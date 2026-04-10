import React, { useState, useEffect, useCallback } from 'react';

/**
 * SyncHistoryPanel Component (VAL-UI-009)
 * 
 * Panel that displays sync history from sync_log table with:
 * - Chronological list of all sync operations
 * - Each entry shows: time, direction (push/pull), records count, status, errors
 * - Filterable by date range, module, status
 * - Pagination for large history
 */

interface SyncHistoryEntry {
  id: string;
  direction: 'up' | 'down';
  module: string;
  batchId: string | null;
  recordsCount: number;
  status: 'success' | 'partial' | 'failed';
  errors: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface SyncHistoryResult {
  entries: SyncHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SyncHistoryFilter {
  startDate?: string;
  endDate?: string;
  module?: string;
  direction?: 'up' | 'down';
  status?: 'success' | 'partial' | 'failed';
}

interface SyncHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return '-';
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return formatTimestamp(timestamp);
}

/**
 * Get module display name
 */
function getModuleLabel(module: string): string {
  const labels: Record<string, string> = {
    'coa': 'COA',
    'aspek_kerja': 'Aspek Kerja',
    'blok': 'Blok',
    'kas': 'Kas',
    'bank': 'Bank',
    'gudang': 'Gudang',
  };
  return labels[module] || module;
}

/**
 * Get direction display label and icon
 */
function getDirectionInfo(direction: 'up' | 'down'): { label: string; color: string; bgColor: string } {
  switch (direction) {
    case 'up':
      return { label: 'Upload (↑)', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'down':
      return { label: 'Download (↓)', color: 'text-green-700', bgColor: 'bg-green-100' };
  }
}

/**
 * Get status display info
 */
function getStatusInfo(status: 'success' | 'partial' | 'failed'): { label: string; color: string; bgColor: string; icon: string } {
  switch (status) {
    case 'success':
      return { label: 'Berhasil', color: 'text-green-700', bgColor: 'bg-green-100', icon: '✓' };
    case 'partial':
      return { label: 'Parsial', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: '!' };
    case 'failed':
      return { label: 'Gagal', color: 'text-red-700', bgColor: 'bg-red-100', icon: '✕' };
  }
}

/**
 * SyncHistoryPanel Component
 */
const SyncHistoryPanel: React.FC<SyncHistoryPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [entries, setEntries] = useState<SyncHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterModule, setFilterModule] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Load sync history
  const loadSyncHistory = useCallback(async () => {
    if (!window.electronAPI) {
      setError('Electron API not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const filter: SyncHistoryFilter = {};
      if (filterStartDate) filter.startDate = filterStartDate;
      if (filterEndDate) filter.endDate = filterEndDate;
      if (filterModule) filter.module = filterModule;
      if (filterDirection) filter.direction = filterDirection as 'up' | 'down';
      if (filterStatus) filter.status = filterStatus as 'success' | 'partial' | 'failed';

      const result: SyncHistoryResult = await window.electronAPI.getSyncHistory(page, pageSize, filter);
      
      setEntries(result.entries);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('[SyncHistory] Failed to load sync history:', err);
      setError('Gagal memuat history sinkronisasi');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, filterStartDate, filterEndDate, filterModule, filterDirection, filterStatus]);

  // Load on mount and when filters change
  useEffect(() => {
    if (isOpen) {
      loadSyncHistory();
    }
  }, [isOpen, loadSyncHistory]);

  // Handle filter changes - reset page to 1
  const handleFilterChange = () => {
    setPage(1);
    loadSyncHistory();
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterModule('');
    setFilterDirection('');
    setFilterStatus('');
    setPage(1);
    loadSyncHistory();
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Riwayat Sinkronisasi</h2>
              <p className="text-sm text-gray-600">
                {total} operasi sinkronisasi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Dari:</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => { setFilterStartDate(e.target.value); }}
                onBlur={handleFilterChange}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sampai:</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => { setFilterEndDate(e.target.value); }}
                onBlur={handleFilterChange}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="h-6 w-px bg-gray-300 mx-2" />

            {/* Module Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Modul:</label>
              <select
                value={filterModule}
                onChange={(e) => { setFilterModule(e.target.value); }}
                onBlur={handleFilterChange}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua</option>
                <option value="coa">COA</option>
                <option value="aspek_kerja">Aspek Kerja</option>
                <option value="blok">Blok</option>
                <option value="kas">Kas</option>
                <option value="bank">Bank</option>
                <option value="gudang">Gudang</option>
              </select>
            </div>

            {/* Direction Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Arah:</label>
              <select
                value={filterDirection}
                onChange={(e) => { setFilterDirection(e.target.value); }}
                onBlur={handleFilterChange}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua</option>
                <option value="up">Upload (↑)</option>
                <option value="down">Download (↓)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Status:</label>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); }}
                onBlur={handleFilterChange}
                className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua</option>
                <option value="success">Berhasil</option>
                <option value="partial">Parsial</option>
                <option value="failed">Gagal</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {(filterStartDate || filterEndDate || filterModule || filterDirection || filterStatus) && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* History List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <svg className="w-8 h-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-red-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-600">{error}</p>
                  <button
                    onClick={loadSyncHistory}
                    className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-gray-500">Tidak ada history sinkronisasi</p>
                  <p className="text-sm text-gray-400">History akan muncul setelah melakukan sinkronisasi</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {entries.map((entry) => {
                  const directionInfo = getDirectionInfo(entry.direction);
                  const statusInfo = getStatusInfo(entry.status);
                  
                  return (
                    <div key={entry.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          {/* Status Icon */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusInfo.bgColor}`}>
                            <span className={`text-lg font-bold ${statusInfo.color}`}>
                              {statusInfo.icon}
                            </span>
                          </div>

                          {/* Details */}
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-medium text-gray-800">
                                {getModuleLabel(entry.module)}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${directionInfo.bgColor} ${directionInfo.color}`}>
                                {directionInfo.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatRelativeTime(entry.startedAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {entry.recordsCount} record{entry.recordsCount !== 1 ? 's' : ''}
                              </span>
                              {entry.batchId && (
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                  </svg>
                                  Batch: {entry.batchId.substring(0, 8)}...
                                </span>
                              )}
                            </div>

                            {/* Error Message */}
                            {entry.errors && (
                              <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                <strong>Error:</strong> {entry.errors}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Timestamp */}
                        <div className="text-right text-sm text-gray-400">
                          <div>{formatTimestamp(entry.startedAt)}</div>
                          {entry.completedAt && (
                            <div className="text-xs">
                              Selesai: {formatTimestamp(entry.completedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Page Size Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Per halaman:</label>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Total Records */}
              <span className="text-sm text-gray-500">
                Total: {total} record{total !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(1)}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {totalPages || 1}
              </span>
              
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncHistoryPanel;
