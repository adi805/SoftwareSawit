import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ExcelImportModal from '../components/ExcelImportModal';
import { useAuth } from '../context/AuthContext';

interface Blok {
  id: string;
  kode_blok: string;
  nama: string;
  tahun_tanam: number;
  luas: number;
  status: string;
  keterangan: string | null;
  pokok: number | null;       // NEW
  sph: number | null;         // NEW
  bulan_tanam: string | null;  // NEW - now stores full "Bulan Tahun" format
  status_tanaman_2025: string | null; // Status for year 2025
  status_tanaman_2026: string | null; // Status for year 2026
  status_tanaman_2027: string | null; // Status for year 2027
  created_at: string;
  updated_at: string;
}

interface PaginationInfo {
  data: Blok[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BlokListPageProps {
  onNavigateToBlokForm?: (blok?: Blok) => void;
  onBack?: () => void;
  isGuest?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const STATUS_OPTIONS = [
  { value: 'TM', label: 'TM - Tanaman Menghasilkan' },
  { value: 'TBM-0', label: 'TBM-0 - Lahan sudah selesai dibuka, ditanami kacangan penutup tanah dan kelapa sawit sudah ditanam' },
  { value: 'TBM-1', label: 'TBM-1 - Usia 0-12 Bulan' },
  { value: 'TBM-2', label: 'TBM-2 - Usia 13-24 Bulan' },
  { value: 'TBM-3', label: 'TBM-3 - Usia 25-30 Bulan' },
];

const BLOK_FIELD_LABELS: Record<string, string> = {
  kode_blok: 'Kode Blok',
  nama: 'Nama',
  tahun_tanam: 'Tahun Tanam',
  luas: 'Luas (Ha)',
  status: 'Status',
  keterangan: 'Keterangan',
  pokok: 'Pokok',
  sph: 'SPH',
  bulan_tanam: 'Bulan Tanam',
  status_tanaman_2025: 'Status 2025',
  status_tanaman_2026: 'Status 2026',
  status_tanaman_2027: 'Status 2027',
};

const BLOK_REQUIRED_FIELDS = ['kode_blok', 'tahun_tanam', 'luas'];
const BLOK_OPTIONAL_FIELDS = ['nama', 'status', 'keterangan', 'pokok', 'sph', 'bulan_tanam', 'status_tanaman_2025', 'status_tanaman_2026', 'status_tanaman_2027'];

const BlokListPage: React.FC<BlokListPageProps> = ({ onNavigateToBlokForm, onBack, isGuest = false }) => {
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
  const [tahunFilter, setTahunFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [existingKodes, setExistingKodes] = useState<string[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearError, setClearError] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load available years for filter dropdown
  useEffect(() => {
    const loadYears = async () => {
      if (window.electronAPI) {
        const years = await window.electronAPI.getBlokAvailableYears();
        setAvailableYears(years);
      }
    };
    loadYears();
  }, []);

  // Load Blok data
  const loadBlok = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.getBlokWithPagination(
        pagination.page,
        pagination.pageSize,
        debouncedSearch || undefined,
        tahunFilter || undefined,
        statusFilter || undefined
      );
      setPagination((prev) => ({
        ...prev,
        data: result.data,
        total: result.total,
        totalPages: result.totalPages,
      }));
    } catch (error) {
      console.error('[Blok] Failed to load:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.pageSize, debouncedSearch, tahunFilter, statusFilter]);

  useEffect(() => {
    loadBlok();
  }, [loadBlok]);

  // Reset page when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [debouncedSearch, tahunFilter, statusFilter]);

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
      const result = await window.electronAPI.localFirstDeleteBlok(id);
      if (result.success) {
        setShowDeleteConfirm(null);
        loadBlok();
      } else {
        setDeleteError(result.message);
        setTimeout(() => setDeleteError(''), 5000);
      }
    } catch (error) {
      console.error('[Blok] Delete error:', error);
      setDeleteError('Gagal menghapus Blok');
      setTimeout(() => setDeleteError(''), 5000);
    }
  };

  const handleClearAll = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.clearAllBlok();
      if (result.success) {
        setShowClearConfirm(false);
        loadBlok();
      } else {
        setClearError(result.message);
        setTimeout(() => setClearError(''), 5000);
      }
    } catch (error) {
      console.error('[Blok] Clear all error:', error);
      setClearError('Gagal menghapus semua Blok');
      setTimeout(() => setClearError(''), 5000);
    }
  };

  const handleImportBlok = async (data: Record<string, string>[]) => {
    if (!window.electronAPI) {
      return { success: false, message: 'API not available', importedCount: 0, errors: [] };
    }

    const parseNumeric = (val: string | undefined | null): number | null => {
      if (!val || val === '-' || val.trim() === '') return null;
      const cleaned = val.toString().replace(/[^0-9.-]/g, '');
      const num = Number(cleaned);
      return isNaN(num) ? null : num;
    };

    const parseNumericRequired = (val: string | undefined | null): number => {
      return parseNumeric(val) ?? 0;
    };

    const parseString = (val: string | undefined | null): string | null => {
      if (!val || val === '-' || val.trim() === '') return null;
      return val;
    };

    const transformData = data.map((row) => {
      const kode_blok = row['kode_blok'] || row['KODE BLOK'] || row['Kode Blok'] || '';
      const tahun_tanam_raw = row['tahun_tanam'] || row['TAHUN TANAM'] || row['Tahun Tanam'] || '';
      const luas_raw = row['luas'] || row['LUAS (HA)'] || row['Luas (Ha)'] || row['Luas'] || '';

      return {
        kode_blok,
        nama: row['nama'] || row['NAMA'] || row['Nama'] || `Blok ${kode_blok}`,
        tahun_tanam: parseNumericRequired(tahun_tanam_raw),
        luas: parseNumericRequired(luas_raw),
        pokok: parseNumeric(row['pokok'] || row['POKOK'] || null),
        sph: parseNumeric(row['sph'] || row['SPH'] || null),
        bulan_tanam: parseString(row['bulan_tanam'] || row['BULAN TANAM'] || null),
        status_tanaman_2025: parseString(row['status_tanaman_2025'] || row['STATUS 2025'] || null),
        status_tanaman_2026: parseString(row['status_tanaman_2026'] || row['STATUS 2026'] || null),
        status_tanaman_2027: parseString(row['status_tanaman_2027'] || row['STATUS 2027'] || null),
        keterangan: row['keterangan'] || row['KETERANGAN'] || row['Keterangan'] || undefined,
      };
    });

    return window.electronAPI.importBlokBatch(transformData);
  };

  const handleOpenImportModal = async () => {
    if (window.electronAPI) {
      const kodes = await window.electronAPI.getAllBlokKodes();
      setExistingKodes(kodes);
      setShowImportModal(true);
    }
  };

  const handleExportExcel = () => {
    const data = pagination.data.map((blok, index) => ({
      No: index + 1,
      'Kode Blok': blok.kode_blok,
      Nama: blok.nama,
      'Tahun Tanam': blok.tahun_tanam,
      'Luas (Ha)': blok.luas,
      Pokok: blok.pokok ?? '',
      SPH: blok.sph ?? '',
      'Bulan Tanam': blok.bulan_tanam ?? '',
      'Status 2025': blok.status_tanaman_2025 ?? '',
      'Status 2026': blok.status_tanaman_2026 ?? '',
      'Status 2027': blok.status_tanaman_2027 ?? '',
      Keterangan: blok.keterangan || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar Blok');

    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // Kode Blok
      { wch: 25 },  // Nama
      { wch: 12 },  // Tahun Tanam
      { wch: 10 },  // Luas
      { wch: 8 },   // Pokok
      { wch: 8 },   // SPH
      { wch: 15 },  // Bulan Tanam
      { wch: 12 },  // Status 2025
      { wch: 12 },  // Status 2026
      { wch: 12 },  // Status 2027
      { wch: 25 },  // Keterangan
    ];

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Daftar_Blok_${date}.xlsx`);
  };

  const handleCopy = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'c') {
      const selectedText = window.getSelection()?.toString().trim();

      if (selectedText) {
        navigator.clipboard.writeText(selectedText);
      } else {
        const headers = ['Kode Blok', 'Nama', 'Tahun Tanam', 'Luas (Ha)', 'Status', 'Keterangan'];
        const rows = pagination.data.map((blok) => [
          blok.kode_blok,
          blok.nama,
          blok.tahun_tanam.toString(),
          blok.luas.toString(),
          getStatusLabel(blok.status),
          blok.keterangan || '',
        ]);

        const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv);
      }

      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1000);
    }
  }, [pagination.data]);

  const getStatusLabel = (status: string) => {
    const option = STATUS_OPTIONS.find((o) => o.value === status);
    return option ? option.label : status;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'TM':
        return 'bg-green-100 text-green-800';
      case 'TBM-0':
        return 'bg-blue-100 text-blue-800';
      case 'TBM-1':
        return 'bg-cyan-100 text-cyan-800';
      case 'TBM-2':
        return 'bg-indigo-100 text-indigo-800';
      case 'TBM-3':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
              <h1 className="text-xl font-bold text-gray-800">Master Data - Blok</h1>
            </div>
            <p className="text-sm text-gray-500 ml-8">Kelola data blok perkebunan</p>
          </div>
          <div className="flex items-center gap-3">
            {!isGuest && (
              <>
                <button
                  onClick={handleOpenImportModal}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import Excel
                </button>
                <button
                  onClick={handleExportExcel}
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
                {onNavigateToBlokForm && (
                  <button
                    onClick={() => onNavigateToBlokForm()}
                    className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Tambah Blok
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
                placeholder="Cari Kode Blok atau Nama..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {copyFeedback && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                  Disalin!
                </span>
              )}
            </div>
          </div>

          {/* Tahun Tanam Filter */}
          <div className="w-36">
            <select
              value={tahunFilter}
              onChange={(e) => setTahunFilter(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Semua Tahun</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
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
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {/* Reset */}
          {(debouncedSearch || tahunFilter !== '' || statusFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setTahunFilter('');
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

      {/* Error message */}
      {deleteError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {deleteError}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode Blok</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tahun Tanam</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Luas (Ha)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pokok</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SPH</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bulan Tanam</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status 2025</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status 2026</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status 2027</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
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
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>Tidak ada data Blok</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagination.data.map((blok, index) => (
                  <tr key={blok.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(pagination.page - 1) * pagination.pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{blok.kode_blok}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.nama}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.tahun_tanam}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.luas.toFixed(2)} Ha</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.pokok ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.sph ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{blok.bulan_tanam ?? '-'}</td>
                    <td className="px-6 py-4">
                      {blok.status_tanaman_2025 ? (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(blok.status_tanaman_2025)}`}>
                          {blok.status_tanaman_2025}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {blok.status_tanaman_2026 ? (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(blok.status_tanaman_2026)}`}>
                          {blok.status_tanaman_2026}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {blok.status_tanaman_2027 ? (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(blok.status_tanaman_2027)}`}>
                          {blok.status_tanaman_2027}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {!isGuest && onNavigateToBlokForm && (
                          <>
                            <button
                              onClick={() => onNavigateToBlokForm(blok)}
                              className="text-primary-600 hover:text-primary-800"
                              title="Edit"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {showDeleteConfirm === blok.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(blok.id)}
                                  className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1"
                                >
                                  Ya
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="text-gray-600 hover:text-gray-800 font-medium text-xs px-2 py-1"
                                >
                                  Tidak
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowDeleteConfirm(blok.id)}
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
          loadBlok();
        }}
        onImport={handleImportBlok}
        moduleName="Blok"
        requiredFields={BLOK_REQUIRED_FIELDS}
        fieldLabels={BLOK_FIELD_LABELS}
        duplicateCheckField="kode_blok"
        existingValues={existingKodes}
        optionalFields={BLOK_OPTIONAL_FIELDS}
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
                  <h3 className="text-lg font-semibold text-gray-900">Hapus Semua Data Blok</h3>
                  <p className="text-sm text-gray-500">Tindakan ini tidak dapat dibatalkan.</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Apakah Anda yakin ingin menghapus <strong>SEMUA</strong> data blok? Data yang dihapus tidak dapat dikembalikan.
              </p>
              {clearError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                  {clearError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowClearConfirm(false);
                    setClearError('');
                  }}
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

export default BlokListPage;
