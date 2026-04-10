import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface RevisionTransaction {
  id: string;
  transaction_id: string;
  module: 'kas' | 'bank' | 'gudang';
  status: 'Pending Revision Approval 1' | 'Pending Revision Approval 2' | 'Approved' | 'Rejected' | 'Cancelled';
  revision_reason: string;
  requested_by: string;
  requested_at: string;
  revision_approver_1_id: string | null;
  revision_approver_1_name: string | null;
  revision_approver_1_at: string | null;
  revision_approver_2_id: string | null;
  revision_approver_2_name: string | null;
  revision_approver_2_at: string | null;
  rejection_reason: string | null;
  applied_at: string | null;
  // Original values
  original_transaction_number: string;
  original_transaction_date: string;
  original_transaction_type: string;
  original_amount: number;
  original_description: string | null;
  original_coa_id: string | null;
  original_aspek_kerja_id: string | null;
  original_blok_id: string | null;
  original_bank_account: string | null;
  original_item_name: string | null;
  original_item_unit: string | null;
  // Proposed values
  proposed_transaction_date: string | null;
  proposed_transaction_type: string | null;
  proposed_amount: number | null;
  proposed_description: string | null;
  proposed_coa_id: string | null;
  proposed_aspek_kerja_id: string | null;
  proposed_blok_id: string | null;
  proposed_bank_account: string | null;
  proposed_item_name: string | null;
  proposed_item_unit: string | null;
}

interface RevisionCounts {
  pendingRevisionApproval1: number;
  pendingRevisionApproval2: number;
  totalPending: number;
  byModule: {
    kas: number;
    bank: number;
    gudang: number;
  };
}

interface ApprovalHistoryEntry {
  id: string;
  action: string;
  user_name: string;
  action_at: string;
  notes: string | null;
}

interface RevisionApprovalPageProps {
  onBack?: () => void;
  isGuest?: boolean;
}

const RevisionApprovalPage: React.FC<RevisionApprovalPageProps> = ({
  onBack,
  isGuest = false,
}) => {
  const { user } = useAuth();
  const canApprove = user?.role === 'Approver' || user?.role === 'Administrator';

  const [counts, setCounts] = useState<RevisionCounts>({
    pendingRevisionApproval1: 0,
    pendingRevisionApproval2: 0,
    totalPending: 0,
    byModule: { kas: 0, bank: 0, gudang: 0 },
  });
  const [revisions, setRevisions] = useState<RevisionTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'oldest'>('date');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

  // Modal states
  const [showDiffModal, setShowDiffModal] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<RevisionTransaction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryEntry[]>([]);

  // Action feedback
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Check if item is overdue (>24h)
  const isOverdue = useCallback((requestedAt: string): boolean => {
    const requested = new Date(requestedAt);
    const now = new Date();
    const diffHours = (now.getTime() - requested.getTime()) / (1000 * 60 * 60);
    return diffHours > 24;
  }, []);

  // Get hours pending
  const getHoursPending = useCallback((requestedAt: string): number => {
    const requested = new Date(requestedAt);
    const now = new Date();
    return Math.floor((now.getTime() - requested.getTime()) / (1000 * 60 * 60));
  }, []);

  // Load revision counts
  const loadCounts = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.getRevisionCounts();
      if (result.success) {
        setCounts(result.counts);
      }
    } catch (err) {
      console.error('[RevisionApproval] Failed to load counts:', err);
    }
  }, []);

  // Load pending revisions
  const loadRevisions = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const filters: { module?: 'kas' | 'bank' | 'gudang' } = {};
      if (moduleFilter !== 'all') {
        filters.module = moduleFilter as 'kas' | 'bank' | 'gudang';
      }

      const result = await window.electronAPI.getPendingRevisions(filters);
      if (result.success) {
        let filtered = result.revisions;

        // Apply status filter
        if (statusFilter !== 'all') {
          filtered = filtered.filter(r => r.status === statusFilter);
        }

        // Apply search filter
        if (debouncedSearch) {
          const search = debouncedSearch.toLowerCase();
          filtered = filtered.filter(r =>
            r.original_transaction_number.toLowerCase().includes(search) ||
            r.revision_reason.toLowerCase().includes(search) ||
            r.requested_by.toLowerCase().includes(search)
          );
        }

        // Sort
        filtered.sort((a, b) => {
          const dateA = new Date(a.requested_at).getTime();
          const dateB = new Date(b.requested_at).getTime();
          return sortBy === 'date' ? dateB - dateA : dateA - dateB;
        });

        // Paginate
        const total = filtered.length;
        const totalPagesCalc = Math.ceil(total / pageSize);
        setTotalPages(totalPagesCalc || 1);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        setRevisions(filtered.slice(startIndex, endIndex));
      } else {
        setError(result.message || 'Gagal memuat data revisi');
      }
    } catch (err) {
      console.error('[RevisionApproval] Failed to load revisions:', err);
      setError('Gagal memuat data revisi. Pastikan koneksi database aktif.');
    } finally {
      setIsLoading(false);
    }
  }, [moduleFilter, statusFilter, debouncedSearch, sortBy, page, pageSize]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, moduleFilter, statusFilter, sortBy]);

  // Polling mechanism for real-time updates (5 second interval)
  useEffect(() => {
    const POLLING_INTERVAL = 5000;

    const pollData = () => {
      loadCounts();
      loadRevisions();
    };

    pollData();
    const intervalId = setInterval(pollData, POLLING_INTERVAL);
    return () => clearInterval(intervalId);
  }, [loadCounts, loadRevisions]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Handle view diff
  const handleViewDiff = async (revision: RevisionTransaction) => {
    setSelectedRevision(revision);
    setShowDiffModal(revision.id);
  };

  // Handle view history
  const handleViewHistory = async (revision: RevisionTransaction) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.getRevisionsForTransaction(
        revision.module,
        revision.transaction_id
      );

      if (result.success) {
        // Get approval history from the correct module
        let historyResult;
        switch (revision.module) {
          case 'kas':
            historyResult = await window.electronAPI.getKasApprovalHistory(revision.transaction_id);
            break;
          case 'bank':
            historyResult = await window.electronAPI.getBankApprovalHistory(revision.transaction_id);
            break;
          case 'gudang':
            historyResult = await window.electronAPI.getGudangApprovalHistory(revision.transaction_id);
            break;
        }
        setApprovalHistory(historyResult || []);
      }
      setShowHistoryModal(revision.id);
    } catch (err) {
      console.error('[RevisionApproval] Failed to load history:', err);
    }
  };

  // Handle approve
  const handleApprove = async (revision: RevisionTransaction) => {
    if (!window.electronAPI || !user) return;

    try {
      const result = await window.electronAPI.approveRevision(revision.id, {
        approver_id: user.id,
        approver_name: user.full_name,
      });

      if (result.success) {
        setShowApproveModal(null);
        setSelectedRevision(null);
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadCounts();
        loadRevisions();
      } else {
        setActionError(result.message);
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (err) {
      console.error('[RevisionApproval] Approve error:', err);
      setActionError('Gagal menyetujui revisi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  // Handle reject
  const handleReject = async (revision: RevisionTransaction) => {
    if (!window.electronAPI || !user) return;

    if (!rejectReason.trim()) {
      setActionError('Alasan penolakan harus diisi');
      return;
    }

    try {
      const result = await window.electronAPI.rejectRevision(revision.id, {
        rejected_by_id: user.id,
        rejected_by_name: user.full_name,
        reason: rejectReason.trim(),
      });

      if (result.success) {
        setShowRejectModal(null);
        setSelectedRevision(null);
        setRejectReason('');
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadCounts();
        loadRevisions();
      } else {
        setActionError(result.message);
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (err) {
      console.error('[RevisionApproval] Reject error:', err);
      setActionError('Gagal menolak revisi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  // Check if user can approve this revision
  const canApproveRevision = (revision: RevisionTransaction): boolean => {
    if (!user) return false;
    if (!canApprove) return false;
    if (revision.requested_by === user.id) return false; // Cannot approve own revision
    if (revision.status === 'Pending Revision Approval 2') {
      // Different approver required for stage 2
      if (revision.revision_approver_1_id === user.id) return false;
    }
    return true;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case 'kas': return 'bg-green-100 text-green-800';
      case 'bank': return 'bg-blue-100 text-blue-800';
      case 'gudang': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Pending Revision Approval 1': return 'bg-yellow-100 text-yellow-800';
      case 'Pending Revision Approval 2': return 'bg-blue-100 text-blue-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper to get changed fields
  const getChangedFields = (revision: RevisionTransaction) => {
    const fields: Array<{
      field: string;
      label: string;
      originalValue: string;
      proposedValue: string;
    }> = [];

    if (revision.proposed_transaction_date && revision.proposed_transaction_date !== revision.original_transaction_date) {
      fields.push({
        field: 'transaction_date',
        label: 'Tanggal Transaksi',
        originalValue: revision.original_transaction_date,
        proposedValue: revision.proposed_transaction_date,
      });
    }

    if (revision.proposed_amount !== null && revision.proposed_amount !== revision.original_amount) {
      fields.push({
        field: 'amount',
        label: 'Jumlah',
        originalValue: formatCurrency(revision.original_amount),
        proposedValue: formatCurrency(revision.proposed_amount),
      });
    }

    if (revision.proposed_description !== null && revision.proposed_description !== revision.original_description) {
      fields.push({
        field: 'description',
        label: 'Keterangan',
        originalValue: revision.original_description || '-',
        proposedValue: revision.proposed_description || '-',
      });
    }

    if (revision.module === 'bank' && revision.proposed_bank_account !== null && revision.proposed_bank_account !== revision.original_bank_account) {
      fields.push({
        field: 'bank_account',
        label: 'Bank Account',
        originalValue: revision.original_bank_account || '-',
        proposedValue: revision.proposed_bank_account || '-',
      });
    }

    if (revision.module === 'gudang') {
      if (revision.proposed_item_name !== null && revision.proposed_item_name !== revision.original_item_name) {
        fields.push({
          field: 'item_name',
          label: 'Nama Item',
          originalValue: revision.original_item_name || '-',
          proposedValue: revision.proposed_item_name || '-',
        });
      }
      if (revision.proposed_item_unit !== null && revision.proposed_item_unit !== revision.original_item_unit) {
        fields.push({
          field: 'item_unit',
          label: 'Unit',
          originalValue: revision.original_item_unit || '-',
          proposedValue: revision.proposed_item_unit || '-',
        });
      }
    }

    return fields;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {onBack && (
                <button
                  onClick={onBack}
                  aria-label="Kembali"
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              )}
              <h1 className="text-xl font-bold text-gray-800">Dashboard Revisi Approval</h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">Kelola semua permintaan revisi yang menunggu persetujuan</p>
          </div>
          {isGuest && (
            <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg">
              <span className="text-amber-700 text-sm font-medium">Mode View Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Pending Revision Approval 1 Card */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 font-medium">Pending Revisi Approval 1</p>
                <p className="text-2xl font-bold text-yellow-800">{counts.pendingRevisionApproval1}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-200 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-xs text-yellow-600">
              <span>Kas: {counts.byModule.kas}</span>
              <span>Bank: {counts.byModule.bank}</span>
              <span>Gudang: {counts.byModule.gudang}</span>
            </div>
          </div>

          {/* Pending Revision Approval 2 Card */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Pending Revisi Approval 2</p>
                <p className="text-2xl font-bold text-blue-800">{counts.pendingRevisionApproval2}</p>
              </div>
              <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              Total: {counts.totalPending} revisi
            </div>
          </div>

          {/* Overdue Card */}
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Overdue (&gt;24h)</p>
                <p className="text-2xl font-bold text-red-800">
                  {revisions.filter(r => isOverdue(r.requested_at)).length}
                </p>
              </div>
              <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-red-600">
              Perlu perhatian segera
            </div>
          </div>

          {/* Total Pending Card */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Pending</p>
                <p className="text-2xl font-bold text-gray-800">{counts.totalPending}</p>
              </div>
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Dari semua modul
            </div>
          </div>
        </div>
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
                placeholder="Cari nomor transaksi atau alasan..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Module Filter */}
          <div className="w-36">
            <label htmlFor="moduleFilter" className="sr-only">Filter Modul</label>
            <select
              id="moduleFilter"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              aria-label="Filter Modul"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Semua Modul</option>
              <option value="kas">Kas</option>
              <option value="bank">Bank</option>
              <option value="gudang">Gudang</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-44">
            <label htmlFor="statusFilter" className="sr-only">Filter Status</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter Status"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Semua Status</option>
              <option value="Pending Revision Approval 1">Pending Revision Approval 1</option>
              <option value="Pending Revision Approval 2">Pending Revision Approval 2</option>
            </select>
          </div>

          {/* Sort */}
          <div className="w-36">
            <label htmlFor="sortBy" className="sr-only">Urutkan</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'oldest')}
              aria-label="Urutkan"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="date">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </div>

          {/* Reset */}
          {(debouncedSearch || moduleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setModuleFilter('all');
                setStatusFilter('all');
              }}
              aria-label="Reset filter"
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            >
              Reset Filter
            </button>
          )}

          {/* Result count */}
          <div className="text-sm text-gray-500 ml-auto">
            {revisions.length} data
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div role="alert" className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg text-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-medium text-red-800">Gagal memuat data</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
            <button
              onClick={() => {
                loadCounts();
                loadRevisions();
              }}
              aria-label="Coba muat ulang data"
              className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Coba Lagi
            </button>
          </div>
        </div>
      )}
      {actionError && !error && (
        <div role="alert" className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div role="status" className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {actionSuccess}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modul</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No Transaksi</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Request</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alasan Revisi</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested By</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Memuat...
                      </div>
                    </td>
                  </tr>
                ) : revisions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-medium">Tidak ada revisi pending</p>
                        <p className="text-sm">Semua revisi sudah diproses atau belum ada yang diajukan</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  revisions.map((revision, index) => (
                    <tr
                      key={revision.id}
                      className={`hover:bg-gray-50 ${isOverdue(revision.requested_at) ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getModuleBadgeColor(revision.module)}`}>
                          {revision.module.charAt(0).toUpperCase() + revision.module.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-mono font-medium text-gray-900">
                        {revision.original_transaction_number}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        <div>{new Date(revision.requested_at).toLocaleDateString('id-ID')}</div>
                        <div className="text-xs text-gray-400">{getHoursPending(revision.requested_at)}j lalu</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(revision.status)}`}>
                          {revision.status.replace('Pending Revision ', '')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-500 max-w-[200px]">
                        <div className="truncate" title={revision.revision_reason}>
                          {revision.revision_reason}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {revision.requested_by}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewDiff(revision)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            aria-label="Lihat detail perubahan"
                            title="Detail"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {!isGuest && canApproveRevision(revision) && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedRevision(revision);
                                  setShowApproveModal(revision.id);
                                }}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                aria-label="Setujui revisi"
                                title="Setujui"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedRevision(revision);
                                  setShowRejectModal(revision.id);
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                aria-label="Tolak revisi"
                                title="Tolak"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleViewHistory(revision)}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
                            aria-label="Lihat riwayat"
                            title="Riwayat"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Halaman {page} dari {totalPages || 1}
            </span>
            <label htmlFor="pageSize" className="sr-only">Jumlah per halaman</label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              aria-label="Jumlah per halaman"
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
              disabled={page === 1}
              aria-label="Halaman pertama"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Awal
            </button>
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              aria-label="Halaman sebelumnya"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &lt;
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Halaman berikutnya"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &gt;
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={page >= totalPages}
              aria-label="Halaman terakhir"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Akhir
            </button>
          </div>
        </div>
      </div>

      {/* Diff Modal */}
      {showDiffModal && selectedRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Detail Revisi</h3>

            {/* Revision Info */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><span className="text-gray-500">Modul:</span> <span className="font-medium">{selectedRevision.module}</span></p>
                <p><span className="text-gray-500">No Transaksi:</span> <span className="font-medium font-mono">{selectedRevision.original_transaction_number}</span></p>
                <p><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadgeColor(selectedRevision.status)}`}>{selectedRevision.status}</span></p>
                <p><span className="text-gray-500">Requested By:</span> <span className="font-medium">{selectedRevision.requested_by}</span></p>
              </div>
              <div className="mt-2 text-sm">
                <p className="text-gray-500">Alasan Revisi:</p>
                <p className="text-gray-800">{selectedRevision.revision_reason}</p>
              </div>
            </div>

            {/* Changed Fields Summary */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Field yang Berubah:</h4>
              <div className="flex flex-wrap gap-2">
                {getChangedFields(selectedRevision).map((field) => (
                  <span key={field.field} className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                    {field.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Side-by-side Diff */}
            <div className="grid grid-cols-2 gap-8">
              {/* Original Values */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Nilai Lama (Original)</h4>
                <div className="space-y-2">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Tanggal</p>
                    <p className="text-sm font-medium text-gray-800">{selectedRevision.original_transaction_date}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Jenis</p>
                    <p className="text-sm font-medium text-gray-800">{selectedRevision.original_transaction_type}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Jumlah</p>
                    <p className="text-sm font-medium text-gray-800">{formatCurrency(selectedRevision.original_amount)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Keterangan</p>
                    <p className="text-sm font-medium text-gray-800">{selectedRevision.original_description || '-'}</p>
                  </div>
                  {selectedRevision.module === 'bank' && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Bank Account</p>
                      <p className="text-sm font-medium text-gray-800">{selectedRevision.original_bank_account || '-'}</p>
                    </div>
                  )}
                  {selectedRevision.module === 'gudang' && (
                    <>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Nama Item</p>
                        <p className="text-sm font-medium text-gray-800">{selectedRevision.original_item_name || '-'}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Unit</p>
                        <p className="text-sm font-medium text-gray-800">{selectedRevision.original_item_unit || '-'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Proposed Values */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Nilai Baru (Proposed)</h4>
                <div className="space-y-2">
                  <div className={`p-3 rounded-lg ${selectedRevision.proposed_transaction_date && selectedRevision.proposed_transaction_date !== selectedRevision.original_transaction_date ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-500">Tanggal</p>
                    <p className="text-sm font-medium text-gray-800">
                      {selectedRevision.proposed_transaction_date || selectedRevision.original_transaction_date}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Jenis</p>
                    <p className="text-sm font-medium text-gray-800">
                      {selectedRevision.proposed_transaction_type || selectedRevision.original_transaction_type}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${selectedRevision.proposed_amount !== null && selectedRevision.proposed_amount !== selectedRevision.original_amount ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-500">Jumlah</p>
                    <p className="text-sm font-medium text-gray-800">
                      {selectedRevision.proposed_amount !== null ? formatCurrency(selectedRevision.proposed_amount) : formatCurrency(selectedRevision.original_amount)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-lg ${selectedRevision.proposed_description !== null && selectedRevision.proposed_description !== selectedRevision.original_description ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-500">Keterangan</p>
                    <p className="text-sm font-medium text-gray-800">
                      {selectedRevision.proposed_description || selectedRevision.original_description || '-'}
                    </p>
                  </div>
                  {selectedRevision.module === 'bank' && (
                    <div className={`p-3 rounded-lg ${selectedRevision.proposed_bank_account !== null && selectedRevision.proposed_bank_account !== selectedRevision.original_bank_account ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500">Bank Account</p>
                      <p className="text-sm font-medium text-gray-800">
                        {selectedRevision.proposed_bank_account || selectedRevision.original_bank_account || '-'}
                      </p>
                    </div>
                  )}
                  {selectedRevision.module === 'gudang' && (
                    <>
                      <div className={`p-3 rounded-lg ${selectedRevision.proposed_item_name !== null && selectedRevision.proposed_item_name !== selectedRevision.original_item_name ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                        <p className="text-xs text-gray-500">Nama Item</p>
                        <p className="text-sm font-medium text-gray-800">
                          {selectedRevision.proposed_item_name || selectedRevision.original_item_name || '-'}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${selectedRevision.proposed_item_unit !== null && selectedRevision.proposed_item_unit !== selectedRevision.original_item_unit ? 'bg-yellow-50 border border-yellow-300' : 'bg-gray-50'}`}>
                        <p className="text-xs text-gray-500">Unit</p>
                        <p className="text-sm font-medium text-gray-800">
                          {selectedRevision.proposed_item_unit || selectedRevision.original_item_unit || '-'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowDiffModal(null);
                  setSelectedRevision(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Setujui Revisi</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Modul: <span className="font-medium">{selectedRevision.module}</span></p>
              <p className="text-sm text-gray-600">No Transaksi: <span className="font-medium font-mono">{selectedRevision.original_transaction_number}</span></p>
              <p className="text-sm text-gray-600">Requested By: <span className="font-medium">{selectedRevision.requested_by}</span></p>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {selectedRevision.status === 'Pending Revision Approval 1'
                ? 'Ini adalah persetujuan tahap 1. Revisi akan dilanjutkan ke tahap 2.'
                : 'Ini adalah persetujuan tahap 2. Revisi akan diterapkan ke transaksi.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowApproveModal(null);
                  setSelectedRevision(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleApprove(selectedRevision)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
              >
                Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Tolak Revisi</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Modul: <span className="font-medium">{selectedRevision.module}</span></p>
              <p className="text-sm text-gray-600">No Transaksi: <span className="font-medium font-mono">{selectedRevision.original_transaction_number}</span></p>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Apakah Anda yakin ingin menolak revisi ini?
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
                  setSelectedRevision(null);
                  setRejectReason('');
                  setActionError('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleReject(selectedRevision)}
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
            <h3 className="text-lg font-bold text-gray-800 mb-4">Riwayat Revisi</h3>
            <div className="max-h-80 overflow-y-auto">
              {approvalHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Tidak ada riwayat</p>
              ) : (
                <div className="space-y-3">
                  {approvalHistory.map((entry) => (
                    <div key={entry.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          entry.action === 'revision_requested' ? 'bg-yellow-100 text-yellow-800' :
                          entry.action === 'revision_approved_1' ? 'bg-blue-100 text-blue-800' :
                          entry.action === 'revision_approved_2' ? 'bg-green-100 text-green-800' :
                          entry.action === 'revision_rejected' ? 'bg-red-100 text-red-800' :
                          entry.action === 'revision_cancelled' ? 'bg-gray-100 text-gray-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {entry.action.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(entry.action_at)}
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
    </div>
  );
};

export default RevisionApprovalPage;
