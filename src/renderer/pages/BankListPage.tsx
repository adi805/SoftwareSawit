import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ExcelImportModal from '../components/ExcelImportModal';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { useAuth } from '../context/AuthContext';

interface BankTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Bank Masuk' | 'Bank Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  bank_account: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  approver_1_id: string | null;
  approver_1_name: string | null;
  approver_1_at: string | null;
  approver_2_id: string | null;
  approver_2_name: string | null;
  approver_2_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface ApprovalHistoryEntry {
  id: string;
  transaction_id: string;
  action: 'created' | 'approved_1' | 'approved_2' | 'rejected' | 'edited';
  user_id: string;
  user_name: string;
  action_at: string;
  notes: string | null;
}

interface BankBalance {
  bankMasuk: number;
  bankKeluar: number;
  balance: number;
}

interface PaginationInfo {
  data: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CurrentUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
}

interface BankListPageProps {
  onNavigateToBankForm?: (transaction?: BankTransaction) => void;
  onNavigateToRevisionForm?: (transaction: BankTransaction) => void;
  onBack?: () => void;
  currentUser?: CurrentUser | null;
  isGuest?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const BankListPage: React.FC<BankListPageProps> = ({ onNavigateToBankForm, onNavigateToRevisionForm, onBack, currentUser, isGuest = false }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrator';
  
  const [pagination, setPagination] = useState<PaginationInfo>({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [balance, setBalance] = useState<BankBalance>({ bankMasuk: 0, bankKeluar: 0, balance: 0 });
  const [approverSetup, setApproverSetup] = useState<{ complete: boolean; message: string }>({ complete: false, message: '' });
  
  // Approval modal state
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryEntry[]>([]);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Clear all state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearError, setClearError] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load balance
  const loadBalance = useCallback(async () => {
    if (window.electronAPI) {
      const bal = await window.electronAPI.getBankBalance();
      setBalance(bal);
    }
  }, []);

  // Load approver setup status
  const loadApproverSetup = useCallback(async () => {
    if (window.electronAPI) {
      const status = await window.electronAPI.checkBankApproverSetup();
      setApproverSetup(status);
    }
  }, []);

  // Load transaction data
  const loadTransactions = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.getBankWithPagination(
        pagination.page,
        pagination.pageSize,
        debouncedSearch || undefined,
        typeFilter || undefined,
        statusFilter || undefined,
        startDate || undefined,
        endDate || undefined,
        syncStatusFilter || undefined
      );
      setPagination((prev) => ({
        ...prev,
        data: result.data,
        total: result.total,
        totalPages: result.totalPages,
      }));
    } catch (error) {
      console.error('[BANK] Failed to load transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.pageSize, debouncedSearch, typeFilter, statusFilter, startDate, endDate, syncStatusFilter]);

  useEffect(() => {
    loadBalance();
    loadApproverSetup();
  }, [loadBalance, loadApproverSetup]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [debouncedSearch, typeFilter, statusFilter, startDate, endDate, syncStatusFilter]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize: newSize, page: 1 }));
  };

  const handleDelete = async (id: string) => {
    if (!window.electronAPI) return;

    try {
      // Use local-first delete with sync queue
      const result = await window.electronAPI.localFirstDeleteBankTransaction(id);
      if (result.success) {
        setShowDeleteConfirm(null);
        setActionSuccess('Transaksi berhasil dihapus (akan disinkronkan)');
        setTimeout(() => setActionSuccess(''), 3000);
        loadTransactions();
        loadBalance();
      } else {
        setDeleteError(result.message);
        setTimeout(() => setDeleteError(''), 5000);
      }
    } catch (error) {
      console.error('[BANK] Delete error:', error);
      setDeleteError('Gagal menghapus transaksi');
      setTimeout(() => setDeleteError(''), 5000);
    }
  };

  const handleClearAll = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.clearAllBank();
      if (result.success) {
        setShowClearConfirm(false);
        loadTransactions();
        loadBalance();
      } else {
        setClearError(result.message);
        setTimeout(() => setClearError(''), 5000);
      }
    } catch (error) {
      console.error('[BANK] Clear all error:', error);
      setClearError('Gagal menghapus semua transaksi');
      setTimeout(() => setClearError(''), 5000);
    }
  };

  const handleApprove = async (id: string) => {
    if (!window.electronAPI || !currentUser) return;

    try {
      const result = await window.electronAPI.approveBankTransaction(id, {
        approver_id: currentUser.id,
        approver_name: currentUser.full_name,
      });
      if (result.success) {
        setShowApproveModal(null);
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadTransactions();
        loadBalance();
      } else {
        setActionError(result.message);
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (error) {
      console.error('[BANK] Approve error:', error);
      setActionError('Gagal menyetujui transaksi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.electronAPI || !currentUser) return;
    if (!rejectReason.trim()) {
      setActionError('Alasan penolakan harus diisi');
      return;
    }

    try {
      const result = await window.electronAPI.rejectBankTransaction(id, {
        rejected_by_id: currentUser.id,
        rejected_by_name: currentUser.full_name,
        reason: rejectReason.trim(),
      });
      if (result.success) {
        setShowRejectModal(null);
        setRejectReason('');
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadTransactions();
      } else {
        setActionError(result.message);
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (error) {
      console.error('[BANK] Reject error:', error);
      setActionError('Gagal menolak transaksi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const handleViewHistory = async (id: string) => {
    if (!window.electronAPI) return;

    try {
      const history = await window.electronAPI.getBankApprovalHistory(id);
      setApprovalHistory(history);
      setShowHistoryModal(id);
    } catch (error) {
      console.error('[BANK] Failed to load history:', error);
    }
  };

  const handleCopyTransaction = async (id: string) => {
    if (!window.electronAPI || !currentUser) return;

    try {
      const result = await window.electronAPI.copyBankTransaction(id, currentUser.id);
      if (result.success) {
        setActionSuccess('Transaksi berhasil disalin');
        setTimeout(() => setActionSuccess(''), 3000);
        loadTransactions();
      } else {
        setActionError(result.message);
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (error) {
      console.error('[BANK] Copy error:', error);
      setActionError('Gagal menyalin transaksi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const handleExportExcel = () => {
    const data = pagination.data.map((tx, index) => ({
      No: index + 1,
      'No Transaksi': tx.transaction_number,
      Tanggal: tx.transaction_date,
      Jenis: tx.transaction_type,
      Jumlah: tx.amount,
      'Rekening Bank': tx.bank_account || '-',
      Keterangan: tx.description,
      'COA': tx.coa_kode ? `${tx.coa_kode} - ${tx.coa_nama}` : '-',
      'Aspek Kerja': tx.aspek_kerja_kode ? `${tx.aspek_kerja_kode} - ${tx.aspek_kerja_nama}` : '-',
      Blok: tx.blok_kode ? `${tx.blok_kode} - ${tx.blok_nama}` : '-',
      Status: tx.status,
      'Dibuat Oleh': tx.created_by_name || tx.created_by,
      'Approver 1': tx.approver_1_name || '-',
      'Approver 2': tx.approver_2_name || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bank Transactions');

    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 20 },  // No Transaksi
      { wch: 12 },  // Tanggal
      { wch: 12 },  // Jenis
      { wch: 15 },  // Jumlah
      { wch: 20 },  // Rekening Bank
      { wch: 30 },  // Keterangan
      { wch: 25 },  // COA
      { wch: 25 },  // Aspek Kerja
      { wch: 15 },  // Blok
      { wch: 18 },  // Status
      { wch: 15 },  // Dibuat Oleh
      { wch: 15 },  // Approver 1
      { wch: 15 },  // Approver 2
    ];

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Bank_Transactions_${date}.xlsx`);
  };

  const handleImportBank = async (data: Record<string, string>[]) => {
    if (!window.electronAPI || !currentUser) {
      return { success: false, message: 'API not available', importedCount: 0, errors: [] };
    }

    // Transform data to match expected format
    const transformData = data.map(row => ({
      transaction_type: row.transaction_type || row.Jenis || '',
      transaction_date: row.transaction_date || row.Tanggal || '',
      amount: row.amount || row.Jumlah || 0,
      description: row.description || row.Keterangan || '',
      coa_kode: row.coa_kode || row.COA?.split(' - ')[0] || '',
      aspek_kerja_kode: row.aspek_kerja_kode || row['Aspek Kerja']?.split(' - ')[0] || '',
      blok_kode: row.blok_kode || row.Blok?.split(' - ')[0] || '',
      bank_account: row['Rekening Bank'] || '',
    }));

    return window.electronAPI.importBankBatch(transformData, currentUser.full_name);
  };

  const handleCopy = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'c') {
      const selectedText = window.getSelection()?.toString().trim();

      if (selectedText) {
        navigator.clipboard.writeText(selectedText);
      } else {
        const headers = ['No Transaksi', 'Tanggal', 'Jenis', 'Jumlah', 'Rekening Bank', 'Keterangan', 'COA', 'Aspek Kerja', 'Blok', 'Status'];
        const rows = pagination.data.map((tx, _idx) => [
          tx.transaction_number,
          tx.transaction_date,
          tx.transaction_type,
          tx.amount.toString(),
          tx.bank_account || '',
          tx.description,
          tx.coa_kode || '',
          tx.aspek_kerja_kode || '',
          tx.blok_kode || '',
          tx.status,
        ]);

        const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv);
      }

      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1000);
    }
  }, [pagination.data]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Pending Approval 1':
        return 'bg-yellow-100 text-yellow-800';
      case 'Pending Approval 2':
        return 'bg-blue-100 text-blue-800';
      case 'Fully Approved':
        return 'bg-green-100 text-green-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Bank Masuk':
        return 'bg-green-100 text-green-800';
      case 'Bank Keluar':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canApprove = (tx: BankTransaction) => {
    if (!currentUser) return false;
    if (currentUser.role !== 'Approver' && currentUser.role !== 'Administrator') return false;
    if (tx.created_by === currentUser.id) return false; // Cannot approve own transaction
    if (tx.status === 'Pending Approval 1') return true;
    if (tx.status === 'Pending Approval 2') {
      // Must be different from approver 1
      return tx.approver_1_id !== currentUser.id;
    }
    return false;
  };

  const canEdit = (tx: BankTransaction) => {
    return tx.status === 'Pending Approval 1';
  };

  const canDelete = (tx: BankTransaction) => {
    return tx.status === 'Pending Approval 1';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100" onKeyDown={handleCopy} tabIndex={0}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}
              <h1 className="text-xl font-bold text-gray-800">Modul Bank</h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">Kelola transaksi bank masuk dan bank keluar</p>
          </div>
          <div className="flex items-center gap-3">
            {!isGuest && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  data-testid="import-excel"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Import Excel
                </button>
                <button
                  onClick={handleExportExcel}
                  data-testid="export-excel"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export Excel
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All
                  </button>
                )}
                {onNavigateToBankForm && (
                  <button
                    onClick={() => onNavigateToBankForm()}
                    data-testid="add-bank"
                    className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Tambah Transaksi
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">Total Bank Masuk</p>
            <p className="text-xl font-bold text-green-800">{formatCurrency(balance.bankMasuk)}</p>
            <p className="text-xs text-green-500 mt-1">Fully Approved</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <p className="text-sm text-red-600 font-medium">Total Bank Keluar</p>
            <p className="text-xl font-bold text-red-800">{formatCurrency(balance.bankKeluar)}</p>
            <p className="text-xs text-red-500 mt-1">Fully Approved</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Saldo Bank</p>
            <p className={`text-xl font-bold ${balance.balance >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
              {formatCurrency(balance.balance)}
            </p>
            <p className="text-xs text-blue-500 mt-1">After Fully Approved</p>
          </div>
        </div>
        {!approverSetup.complete && (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {approverSetup.message}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nomor transaksi..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {copyFeedback && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  Disalin!
                </span>
              )}
            </div>
          </div>

          {/* Type Filter */}
          <div className="w-36">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Jenis</option>
              <option value="Bank Masuk">Bank Masuk</option>
              <option value="Bank Keluar">Bank Keluar</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Status</option>
              <option value="Pending Approval 1">Pending Approval 1</option>
              <option value="Pending Approval 2">Pending Approval 2</option>
              <option value="Fully Approved">Fully Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Tanggal Mulai"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Tanggal Akhir"
            />
          </div>

          {/* Sync Status Filter */}
          <div className="w-36">
            <select
              value={syncStatusFilter}
              onChange={(e) => setSyncStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Sync</option>
              <option value="synced">Tersinkronkan</option>
              <option value="pending">Pending</option>
              <option value="failed">Gagal</option>
              <option value="conflict">Konflik</option>
            </select>
          </div>

          {/* Reset */}
          {(debouncedSearch || typeFilter || statusFilter || startDate || endDate || syncStatusFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('');
                setStatusFilter('');
                setStartDate('');
                setEndDate('');
                setSyncStatusFilter('');
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            >
              Reset Filter
            </button>
          )}

          {/* Result count */}
          <div className="text-sm text-gray-500 ml-auto">
            {pagination.total} data
          </div>
        </div>
      </div>

      {/* Error/Success messages */}
      {actionError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {actionSuccess}
        </div>
      )}
      {deleteError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {deleteError}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table data-testid="bank-table" className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No Transaksi</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rekening</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COA</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blok</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sync</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Memuat...
                    </div>
                  </td>
                </tr>
              ) : pagination.data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>Tidak ada data transaksi</p>
                      <p className="text-sm">Tambahkan transaksi baru atau ubah filter pencarian</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.data.map((tx, index) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(pagination.page - 1) * pagination.pageSize + index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{tx.transaction_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{tx.transaction_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadgeColor(tx.transaction_type)}`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {tx.bank_account || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {tx.coa_kode ? (
                        <span>
                          <span className="font-mono">{tx.coa_kode}</span>
                          <span className="text-gray-400 ml-1">- {tx.coa_nama}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {tx.blok_kode ? (
                        <span>
                          <span className="font-mono">{tx.blok_kode}</span>
                          <span className="text-gray-400 ml-1">- {tx.blok_nama}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(tx.status)}`}>
                          {tx.status}
                        </span>
                        {tx.status === 'Rejected' && tx.rejection_reason && (
                          <span className="text-xs text-red-500" title={tx.rejection_reason}>
                            Alasan: {tx.rejection_reason.substring(0, 20)}...
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(tx as any).sync_status ? (
                        <SyncStatusBadge
                          status={(tx as any).sync_status}
                          lastSyncAt={(tx as any).last_sync_at}
                          size="sm"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1">
                        {!isGuest && (
                          <>
                            {canApprove(tx) && (
                              <button
                                onClick={() => setShowApproveModal(tx.id)}
                                data-testid={`approve-${tx.id}`}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                title="Setujui"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            {(tx.status === 'Pending Approval 1' || tx.status === 'Pending Approval 2') && (
                              <button
                                onClick={() => setShowRejectModal(tx.id)}
                                data-testid={`reject-${tx.id}`}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                title="Tolak"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                            {onNavigateToBankForm && canEdit(tx) && (
                              <button
                                onClick={() => onNavigateToBankForm(tx)}
                                data-testid={`edit-${tx.id}`}
                                className="p-1.5 text-primary-600 hover:bg-primary-50 rounded"
                                title="Edit"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {showDeleteConfirm === tx.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  onClick={() => handleDelete(tx.id)}
                                  data-testid={`delete-${tx.id}`}
                                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                                >
                                  Ya
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                                >
                                  Tidak
                                </button>
                              </div>
                            ) : (
                              canDelete(tx) && (
                                <button
                                  onClick={() => setShowDeleteConfirm(tx.id)}
                                  data-testid={`delete-${tx.id}`}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  title="Hapus"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )
                            )}
                            <button
                              onClick={() => handleCopyTransaction(tx.id)}
                              className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
                              title="Salin"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleViewHistory(tx.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Riwayat"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        {!isGuest && onNavigateToRevisionForm && tx.status === 'Fully Approved' && (
                          <button
                            onClick={() => onNavigateToRevisionForm(tx)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                            title="Ajukan Revisi"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Menampilkan {pagination.data.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total}
            </span>
            <select
              value={pagination.pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} per halaman</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Awal
            </button>
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &lt;
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              Halaman {pagination.page} dari {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &gt;
            </button>
            <button
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Akhir
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-2">
        <p className="text-xs text-gray-400 text-center">
          Tekan <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">A</kbd> lalu <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">C</kbd> untuk menyalin semua data tabel
        </p>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Setujui Transaksi</h3>
            <p className="text-sm text-gray-600 mb-4">
              Apakah Anda yakin ingin menyetujui transaksi ini?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Dengan menyetujui, Anda menjadi approver untuk transaksi ini.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowApproveModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleApprove(showApproveModal)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
              >
                Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Tolak Transaksi</h3>
            <p className="text-sm text-gray-600 mb-4">
              Apakah Anda yakin ingin menolak transaksi ini?
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Alasan Penolakan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
                placeholder="Masukkan alasan penolakan..."
                required
              />
            </div>
            {actionError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                {actionError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                  setActionError('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Riwayat Approval</h3>
            <div className="max-h-80 overflow-y-auto">
              {approvalHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Tidak ada riwayat</p>
              ) : (
                <div className="space-y-3">
                  {approvalHistory.map((entry) => (
                    <div key={entry.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          entry.action === 'created' ? 'bg-gray-100 text-gray-800' :
                          entry.action === 'approved_1' ? 'bg-blue-100 text-blue-800' :
                          entry.action === 'approved_2' ? 'bg-green-100 text-green-800' :
                          entry.action === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {entry.action === 'created' ? 'Dibuat' :
                           entry.action === 'approved_1' ? 'Approval 1' :
                           entry.action === 'approved_2' ? 'Approval 2' :
                           entry.action === 'rejected' ? 'Ditolak' : 'Edit'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(entry.action_at).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{entry.user_name}</p>
                      {entry.notes && (
                        <p className="text-xs text-gray-500 mt-1">{entry.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setShowHistoryModal(null);
                  setApprovalHistory([]);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ExcelImportModal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          loadTransactions();
          loadBalance();
        }}
        onImport={handleImportBank}
        moduleName="Bank"
        requiredFields={['transaction_type', 'transaction_date', 'amount']}
        fieldLabels={{
          transaction_type: 'Jenis Transaksi',
          transaction_date: 'Tanggal',
          amount: 'Jumlah',
          description: 'Keterangan',
          coa_kode: 'Kode COA',
          aspek_kerja_kode: 'Kode Aspek Kerja',
          blok_kode: 'Kode Blok',
          bank_account: 'Rekening Bank',
        }}
      />

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Hapus Semua Data Bank</h3>
                  <p className="text-sm text-gray-500">Tindakan ini tidak dapat dibatalkan.</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Apakah Anda yakin ingin menghapus <strong>SEMUA</strong> data transaksi bank? Data yang dihapus tidak dapat dikembalikan.
              </p>
              {clearError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                  {clearError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowClearConfirm(false); setClearError(''); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                >
                  Ya, Hapus Semua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankListPage;
