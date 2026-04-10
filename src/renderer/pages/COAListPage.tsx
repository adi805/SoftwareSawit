import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ExcelImportModal from '../components/ExcelImportModal';
import { useAuth } from '../context/AuthContext';

interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string;
  parent_id: string | null;
  parent_kode?: string;
  parent_nama?: string;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface PaginationInfo {
  data: COA[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface COAListPageProps {
  onNavigateToCOAForm?: (coa?: COA) => void;
  onBack?: () => void;
  isGuest?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const COA_FIELD_LABELS: Record<string, string> = {
  kode: 'Kode',
  nama: 'Nama',
  tipe: 'Tipe',
  parent_kode: 'Parent Kode',
  status_aktif: 'Status Aktif',
};

const COA_REQUIRED_FIELDS = ['kode', 'nama', 'tipe'];

const COAListPage: React.FC<COAListPageProps> = ({ onNavigateToCOAForm, onBack, isGuest = false }) => {
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
  const [tipeFilter, setTipeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteWarning, setDeleteWarning] = useState<{ message: string; aspekKerjaCount?: number } | null>(null);
  const [tipeOptions, setTipeOptions] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [existingKodes, setExistingKodes] = useState<string[]>([]);
  const [showClearCOAConfirm, setShowClearCOAConfirm] = useState(false);
  const [showClearAspekKerjaConfirm, setShowClearAspekKerjaConfirm] = useState(false);
  const [clearCOAError, setClearCOAError] = useState('');
  const [clearAspekKerjaError, setClearAspekKerjaError] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load tipe options
  useEffect(() => {
    const loadTipeOptions = async () => {
      if (window.electronAPI) {
        const options = await window.electronAPI.getCOATipeOptions();
        setTipeOptions(options);
      }
    };
    loadTipeOptions();
  }, []);

  // Load COA data
  const loadCOA = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.getCOAWithPagination(
        pagination.page,
        pagination.pageSize,
        debouncedSearch || undefined,
        tipeFilter || undefined,
        statusFilter !== '' ? statusFilter : undefined
      );
      setPagination((prev) => ({
        ...prev,
        data: result.data,
        total: result.total,
        totalPages: result.totalPages,
      }));
    } catch (error) {
      console.error('[COA] Failed to load COA:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.pageSize, debouncedSearch, tipeFilter, statusFilter]);

  useEffect(() => {
    loadCOA();
  }, [loadCOA]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [debouncedSearch, tipeFilter, statusFilter]);

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
      // First check if there are linked aspek kerja
      const count = await window.electronAPI.getCOAAspekKerjaCount(id);
      if (count > 0) {
        setDeleteWarning({
          message: `COA ini memiliki ${count} Aspek Kerja yang terkait. Pilih "Ya" untuk menghapus COA beserta Aspek Kerja terkait, atau "Tidak" untuk membatalkan.`,
          aspekKerjaCount: count,
        });
        setShowDeleteConfirm(id);
        return;
      }

      const result = await window.electronAPI.localFirstDeleteCOA(id);
      if (result.success) {
        setShowDeleteConfirm(null);
        loadCOA();
      } else {
        setDeleteError(result.message);
        setTimeout(() => setDeleteError(''), 5000);
      }
    } catch (error) {
      console.error('[COA] Delete error:', error);
      setDeleteError('Gagal menghapus COA');
      setTimeout(() => setDeleteError(''), 5000);
    }
  };

  const handleDeleteWithCascade = async (id: string) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.deleteCOAWithAspekKerja(id);
      if (result.success) {
        setShowDeleteConfirm(null);
        setDeleteWarning(null);
        loadCOA();
      } else {
        setDeleteError(result.message);
        setTimeout(() => setDeleteError(''), 5000);
      }
    } catch (error) {
      console.error('[COA] Delete cascade error:', error);
      setDeleteError('Gagal menghapus COA');
      setTimeout(() => setDeleteError(''), 5000);
    }
  };

  const handleExportExcel = () => {
    const data = pagination.data.map((coa, index) => ({
      No: index + 1,
      Kode: coa.kode,
      Nama: coa.nama,
      Tipe: coa.tipe,
      'Parent Kode': coa.parent_kode || '-',
      'Parent Nama': coa.parent_nama || '-',
      'Status Aktif': coa.status_aktif === 1 ? 'Aktif' : 'Nonaktif',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar COA');

    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // Kode
      { wch: 30 },  // Nama
      { wch: 15 },  // Tipe
      { wch: 15 },  // Parent Kode
      { wch: 20 },  // Parent Nama
      { wch: 12 },  // Status
    ];

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Daftar_COA_${date}.xlsx`);
  };

  const handleCopy = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'c') {
      // Get selected text or copy all visible data
      const selectedText = window.getSelection()?.toString().trim();

      if (selectedText) {
        // Copy selected text
        navigator.clipboard.writeText(selectedText);
      } else {
        // Copy all visible rows as tab-separated
        const headers = ['Kode', 'Nama', 'Tipe', 'Parent Kode', 'Parent Nama', 'Status Aktif'];
        const rows = pagination.data.map((coa) => [
          coa.kode,
          coa.nama,
          coa.tipe,
          coa.parent_kode || '',
          coa.parent_nama || '',
          coa.status_aktif === 1 ? 'Aktif' : 'Nonaktif',
        ]);

        const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv);
      }

      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1000);
    }
  }, [pagination.data]);

  const getTipeBadgeColor = (tipe: string) => {
    switch (tipe) {
      case 'Aktiva':
        return 'bg-blue-100 text-blue-800';
      case 'Passiva':
        return 'bg-orange-100 text-orange-800';
      case 'Modal':
        return 'bg-purple-100 text-purple-800';
      case 'Pendapatan':
        return 'bg-green-100 text-green-800';
      case 'Beban':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleImportCOA = async (data: Record<string, string>[]) => {
    if (!window.electronAPI) {
      return { success: false, message: 'API not available', importedCount: 0, errors: [] };
    }

    // Transform data to match expected format
    const transformData = data.map(row => ({
      kode: row.kode || '',
      nama: row.nama || '',
      tipe: row.tipe || '',
      parent_kode: row.parent_kode || undefined,
      status_aktif: row.status_aktif === '1' || row.status_aktif === 'Aktif' ? 1 : 0,
    }));

    return window.electronAPI.importCOABatch(transformData);
  };

  const handleOpenImportModal = async () => {
    if (window.electronAPI) {
      const kodes = await window.electronAPI.getAllCOAKodes();
      setExistingKodes(kodes);
      setShowImportModal(true);
    }
  };

  const handleClearAllCOA = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.clearAllCOA();
      if (result.success) {
        setShowClearCOAConfirm(false);
        loadCOA();
      } else {
        setClearCOAError(result.message);
        setTimeout(() => setClearCOAError(''), 5000);
      }
    } catch (error) {
      console.error('[COA] Clear all error:', error);
      setClearCOAError('Gagal menghapus semua COA');
      setTimeout(() => setClearCOAError(''), 5000);
    }
  };

  const handleClearAllAspekKerja = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.clearAllAspekKerja();
      if (result.success) {
        setShowClearAspekKerjaConfirm(false);
        loadAspekKerja();
      } else {
        setClearAspekKerjaError(result.message);
        setTimeout(() => setClearAspekKerjaError(''), 5000);
      }
    } catch (error) {
      console.error('[COA] Clear all Aspek Kerja error:', error);
      setClearAspekKerjaError('Gagal menghapus semua Aspek Kerja');
      setTimeout(() => setClearAspekKerjaError(''), 5000);
    }
  };

  // Placeholder for loadAspekKerja if not already defined
  const loadAspekKerja = useCallback(async () => {
    // This would reload Aspek Kerja data if the page had it
    // For now, this is a placeholder since COAListPage doesn't have Aspek Kerja data
  }, []);

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
              <h1 className="text-xl font-bold text-gray-800">Master Data - Chart of Accounts (COA)</h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">Kelola kode akun dan hierarki COA</p>
          </div>
          <div className="flex items-center gap-3">
            {!isGuest && (
              <>
                <button
                  onClick={handleOpenImportModal}
                  data-testid="import-excel"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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
                  <>
                    <button
                      onClick={() => setShowClearCOAConfirm(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear All COA
                    </button>
                    <button
                      onClick={() => setShowClearAspekKerjaConfirm(true)}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear All Aspek Kerja
                    </button>
                  </>
                )}
                {onNavigateToCOAForm && (
                  <button
                    onClick={() => onNavigateToCOAForm()}
                    data-testid="add-coa"
                    className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Tambah COA
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari Kode atau Nama..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {copyFeedback && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  Disalin!
                </span>
              )}
            </div>
          </div>

          {/* Tipe Filter */}
          <div className="w-40">
            <select
              value={tipeFilter}
              onChange={(e) => setTipeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Tipe</option>
              {tipeOptions.map((tipe) => (
                <option key={tipe} value={tipe}>{tipe}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-32">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua</option>
              <option value={1}>Aktif</option>
              <option value={0}>Nonaktif</option>
            </select>
          </div>

          {/* Reset */}
          {(debouncedSearch || tipeFilter || statusFilter !== '') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setTipeFilter('');
                setStatusFilter('');
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            >
              Reset Filter
            </button>
          )}

          {/* Result count */}
          <div className="text-sm text-gray-500">
            {pagination.total} data
          </div>
        </div>
      </div>

      {/* Error/Warning messages */}
      {deleteError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {deleteError}
        </div>
      )}

      {/* Cascade Warning Modal */}
      {deleteWarning && (
        <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Peringatan CASCADE Delete</p>
              <p className="mt-1">{deleteWarning.message}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => handleDeleteWithCascade(showDeleteConfirm!)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-medium"
                >
                  Ya, Hapus Semua
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(null);
                    setDeleteWarning(null);
                  }}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                >
                  Tidak, Batalkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear COA Confirmation Modal */}
      {showClearCOAConfirm && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Konfirmasi Hapus Semua COA</p>
              <p className="mt-1">Apakah Anda yakin ingin menghapus SEMUA data COA? Tindakan ini tidak dapat dibatalkan.</p>
              {clearCOAError && (
                <p className="mt-2 text-red-600">{clearCOAError}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleClearAllCOA}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
                >
                  Ya, Hapus Semua
                </button>
                <button
                  onClick={() => {
                    setShowClearCOAConfirm(false);
                    setClearCOAError('');
                  }}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Aspek Kerja Confirmation Modal */}
      {showClearAspekKerjaConfirm && (
        <div className="mx-6 mt-4 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">Konfirmasi Hapus Semua Aspek Kerja</p>
              <p className="mt-1">Apakah Anda yakin ingin menghapus SEMUA data Aspek Kerja? Tindakan ini tidak dapat dibatalkan.</p>
              {clearAspekKerjaError && (
                <p className="mt-2 text-orange-600">{clearAspekKerjaError}</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleClearAllAspekKerja}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium"
                >
                  Ya, Hapus Semua
                </button>
                <button
                  onClick={() => {
                    setShowClearAspekKerjaConfirm(false);
                    setClearAspekKerjaError('');
                  }}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table data-testid="coa-table" className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipe</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent COA</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
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
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>Tidak ada data COA</p>
                      <p className="text-sm">Tambahkan COA baru atau ubah filter pencarian</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.data.map((coa, index) => (
                  <tr key={coa.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(pagination.page - 1) * pagination.pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{coa.kode}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{coa.nama}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTipeBadgeColor(coa.tipe)}`}>
                        {coa.tipe}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {coa.parent_kode ? (
                        <span>
                          <span className="font-mono">{coa.parent_kode}</span>
                          <span className="text-gray-400 ml-1">- {coa.parent_nama}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        coa.status_aktif === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {coa.status_aktif === 1 ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {!isGuest && onNavigateToCOAForm && (
                          <>
                            <button
                              onClick={() => onNavigateToCOAForm(coa)}
                              data-testid={`edit-${coa.id}`}
                              className="text-primary-600 hover:text-primary-800"
                              title="Edit"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {showDeleteConfirm === coa.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(coa.id)}
                                  data-testid={`delete-${coa.id}`}
                                  className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1"
                                >
                                  Ya
                                </button>
                                <button
                                  onClick={() => {
                                    setShowDeleteConfirm(null);
                                    setDeleteWarning(null);
                                  }}
                                  className="text-gray-600 hover:text-gray-800 font-medium text-xs px-2 py-1"
                                >
                                  Tidak
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowDeleteConfirm(coa.id)}
                                data-testid={`delete-${coa.id}`}
                                className="text-red-600 hover:text-red-800"
                                title="Hapus"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
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

      {/* Import Modal */}
      <ExcelImportModal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          loadCOA();
        }}
        onImport={handleImportCOA}
        moduleName="COA"
        requiredFields={COA_REQUIRED_FIELDS}
        fieldLabels={COA_FIELD_LABELS}
        duplicateCheckField="kode"
        existingValues={existingKodes}
      />
    </div>
  );
};

export default COAListPage;
