import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface PendingApprovalItem {
  id: string;
  module: 'Kas' | 'Bank' | 'Gudang';
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  description: string;
  status: 'Pending Approval 1' | 'Pending Approval 2';
  created_by: string;
  created_by_name?: string;
  created_at: string;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  item_name?: string;
  item_unit?: string;
  bank_account?: string;
  // Approval tracking
  approver_1_id?: string | null;
  approver_1_name?: string | null;
  approver_1_at?: string | null;
  approver_2_id?: string | null;
  approver_2_name?: string | null;
  approver_2_at?: string | null;
}

interface ApprovalCounts {
  pendingApproval1: number;
  pendingApproval2: number;
  totalPending: number;
  byModule: {
    kas: number;
    bank: number;
    gudang: number;
  };
}

interface PaginationInfo {
  data: PendingApprovalItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface DashboardApprovalPageProps {
  onBack?: () => void;
  isGuest?: boolean;
  onNavigateToKas?: () => void;
  onNavigateToBank?: () => void;
  onNavigateToGudang?: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const DashboardApprovalPage: React.FC<DashboardApprovalPageProps> = ({ 
  onBack, 
  isGuest = false,
  onNavigateToKas,
  onNavigateToBank,
  onNavigateToGudang,
}) => {
  const { user } = useAuth();
  const canApprove = user?.role === 'Approver' || user?.role === 'Administrator';

  // Sticky header visibility state
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollTop, setLastScrollTop] = useState(0);

  const [counts, setCounts] = useState<ApprovalCounts>({
    pendingApproval1: 0,
    pendingApproval2: 0,
    totalPending: 0,
    byModule: { kas: 0, bank: 0, gudang: 0 },
  });
  const [pagination, setPagination] = useState<PaginationInfo>({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'oldest'>('date');

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedItem, setSelectedItem] = useState<PendingApprovalItem | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<Array<{
    id: string;
    action: string;
    user_name: string;
    action_at: string;
    notes: string | null;
  }>>([]);

  // Scroll tracking for sticky header behavior
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
      
      // Only show/hide header if we've scrolled enough (threshold of 10px)
      if (Math.abs(currentScrollTop - lastScrollTop) > 10) {
        // If scrolling DOWN and header is visible, hide it
        if (currentScrollTop > lastScrollTop && isHeaderVisible && currentScrollTop > 100) {
          setIsHeaderVisible(false);
        } 
        // If scrolling UP and header is hidden, show it
        else if (currentScrollTop < lastScrollTop && !isHeaderVisible) {
          setIsHeaderVisible(true);
        }
      }
      
      setLastScrollTop(currentScrollTop);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollTop, isHeaderVisible]);

  // Action feedback states
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
  const isOverdue = useCallback((createdAt: string): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return diffHours > 24;
  }, []);

  // Get hours pending
  const getHoursPending = useCallback((createdAt: string): number => {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
  }, []);

  // Load approval counts
  const loadCounts = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      // Fetch counts from each module
      const [kasPA1Total, kasPA2Total, bankPA1Total, bankPA2Total, gudangPA1Total, gudangPA2Total] = await Promise.all([
        window.electronAPI.getKasWithPagination(1, 1, undefined, undefined, 'Pending Approval 1'),
        window.electronAPI.getKasWithPagination(1, 1, undefined, undefined, 'Pending Approval 2'),
        window.electronAPI.getBankWithPagination(1, 1, undefined, undefined, 'Pending Approval 1'),
        window.electronAPI.getBankWithPagination(1, 1, undefined, undefined, 'Pending Approval 2'),
        window.electronAPI.getGudangWithPagination(1, 1, undefined, undefined, 'Pending Approval 1'),
        window.electronAPI.getGudangWithPagination(1, 1, undefined, undefined, 'Pending Approval 2'),
      ]);

      const pendingApproval1 = kasPA1Total.total + bankPA1Total.total + gudangPA1Total.total;
      const pendingApproval2 = kasPA2Total.total + bankPA2Total.total + gudangPA2Total.total;

      setCounts({
        pendingApproval1,
        pendingApproval2,
        totalPending: pendingApproval1 + pendingApproval2,
        byModule: {
          kas: kasPA1Total.total + kasPA2Total.total,
          bank: bankPA1Total.total + bankPA2Total.total,
          gudang: gudangPA1Total.total + gudangPA2Total.total,
        },
      });
      setError(''); // Clear error on successful load
    } catch (error) {
      console.error('[Dashboard] Failed to load counts:', error);
      setError('Gagal memuat data. Pastikan koneksi database aktif.');
    }
  }, []);

  // Load pending approvals from all modules
  const loadPendingApprovals = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const allItems: PendingApprovalItem[] = [];

      // Build filter parameters
      const filters = {
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      // Fetch from each module - explicitly filter to only pending statuses and cast
      const [kasData, bankData, gudangData] = await Promise.all([
        moduleFilter === 'all' || moduleFilter === 'kas'
          ? window.electronAPI.getKasWithPagination(1, 1000, filters.search, undefined, filters.status || 'Pending Approval 1', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Kas' as const } as PendingApprovalItem)))
          : Promise.resolve([]),
        moduleFilter === 'all' || moduleFilter === 'bank'
          ? window.electronAPI.getBankWithPagination(1, 1000, filters.search, undefined, filters.status || 'Pending Approval 1', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Bank' as const } as PendingApprovalItem)))
          : Promise.resolve([]),
        moduleFilter === 'all' || moduleFilter === 'gudang'
          ? window.electronAPI.getGudangWithPagination(1, 1000, filters.search, undefined, filters.status || 'Pending Approval 1', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Gudang' as const } as PendingApprovalItem)))
          : Promise.resolve([]),
      ]);

      // Also fetch PA2 if status filter is all (to avoid duplicates when PA2 is explicitly selected)
      const [kasPA2, bankPA2, gudangPA2] = await Promise.all([
        moduleFilter === 'all' || moduleFilter === 'kas'
          ? statusFilter === 'all'
            ? window.electronAPI.getKasWithPagination(1, 1000, filters.search, undefined, 'Pending Approval 2', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Kas' as const } as PendingApprovalItem)))
            : Promise.resolve([])
          : Promise.resolve([]),
        moduleFilter === 'all' || moduleFilter === 'bank'
          ? statusFilter === 'all'
            ? window.electronAPI.getBankWithPagination(1, 1000, filters.search, undefined, 'Pending Approval 2', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Bank' as const } as PendingApprovalItem)))
            : Promise.resolve([])
          : Promise.resolve([]),
        moduleFilter === 'all' || moduleFilter === 'gudang'
          ? statusFilter === 'all'
            ? window.electronAPI.getGudangWithPagination(1, 1000, filters.search, undefined, 'Pending Approval 2', filters.startDate, filters.endDate).then(r => r.data.filter(t => t.status === 'Pending Approval 1' || t.status === 'Pending Approval 2').map(t => ({ ...t, module: 'Gudang' as const } as PendingApprovalItem)))
            : Promise.resolve([])
          : Promise.resolve([]),
      ]);

      allItems.push(...kasData, ...kasPA2, ...bankData, ...bankPA2, ...gudangData, ...gudangPA2);

      // Sort by date (newest first or oldest first based on sortBy)
      allItems.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortBy === 'date' ? dateB - dateA : dateA - dateB;
      });

      // Paginate
      const total = allItems.length;
      const totalPages = Math.ceil(total / pagination.pageSize);
      const startIndex = (pagination.page - 1) * pagination.pageSize;
      const endIndex = startIndex + pagination.pageSize;
      const paginatedData = allItems.slice(startIndex, endIndex);

      setPagination({
        data: paginatedData,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages,
      });
      setError(''); // Clear error on successful load
    } catch (error) {
      console.error('[Dashboard] Failed to load pending approvals:', error);
      setError('Gagal memuat data. Pastikan koneksi database aktif.');
    } finally {
      setIsLoading(false);
    }
  }, [moduleFilter, statusFilter, startDate, endDate, debouncedSearch, sortBy, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadPendingApprovals();
  }, [loadPendingApprovals]);

  // Reset page when filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [debouncedSearch, moduleFilter, statusFilter, startDate, endDate, sortBy]);

  // Polling mechanism for real-time updates (5 second interval)
  useEffect(() => {
    const POLLING_INTERVAL = 5000; // 5 seconds

    const pollData = () => {
      loadCounts();
      loadPendingApprovals();
    };

    // Initial load
    pollData();

    // Set up polling interval
    const intervalId = setInterval(pollData, POLLING_INTERVAL);

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [loadCounts, loadPendingApprovals]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPagination(prev => ({ ...prev, pageSize: newSize, page: 1 }));
  };

  // Handle approve action
  const handleApprove = async (item: PendingApprovalItem) => {
    if (!window.electronAPI || !user) return;

    try {
      let result;
      switch (item.module) {
        case 'Kas':
          result = await window.electronAPI.approveKasTransaction(item.id, {
            approver_id: user.id,
            approver_name: user.full_name,
          });
          break;
        case 'Bank':
          result = await window.electronAPI.approveBankTransaction(item.id, {
            approver_id: user.id,
            approver_name: user.full_name,
          });
          break;
        case 'Gudang':
          result = await window.electronAPI.approveGudangTransaction(item.id, {
            approver_id: user.id,
            approver_name: user.full_name,
          });
          break;
      }

      if (result?.success) {
        setShowApproveModal(null);
        setSelectedItem(null);
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadCounts();
        loadPendingApprovals();
      } else {
        setActionError(result?.message || 'Gagal menyetujui transaksi');
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (error) {
      console.error('[Dashboard] Approve error:', error);
      setActionError('Gagal menyetujui transaksi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  // Handle reject action
  const handleReject = async (item: PendingApprovalItem) => {
    if (!window.electronAPI || !user) return;
    
    // Clear previous errors
    setActionError('');
    
    if (!rejectReason.trim()) {
      setActionError('Alasan penolakan harus diisi');
      return;
    }

    try {
      let result;
      switch (item.module) {
        case 'Kas':
          result = await window.electronAPI.rejectKasTransaction(item.id, {
            rejected_by_id: user.id,
            rejected_by_name: user.full_name,
            reason: rejectReason.trim(),
          });
          break;
        case 'Bank':
          result = await window.electronAPI.rejectBankTransaction(item.id, {
            rejected_by_id: user.id,
            rejected_by_name: user.full_name,
            reason: rejectReason.trim(),
          });
          break;
        case 'Gudang':
          result = await window.electronAPI.rejectGudangTransaction(item.id, {
            rejected_by_id: user.id,
            rejected_by_name: user.full_name,
            reason: rejectReason.trim(),
          });
          break;
      }

      if (result?.success) {
        setShowRejectModal(null);
        setSelectedItem(null);
        setRejectReason('');
        setActionSuccess(result.message);
        setTimeout(() => setActionSuccess(''), 3000);
        loadCounts();
        loadPendingApprovals();
      } else {
        setActionError(result?.message || 'Gagal menolak transaksi');
        setTimeout(() => setActionError(''), 5000);
      }
    } catch (error) {
      console.error('[Dashboard] Reject error:', error);
      setActionError('Gagal menolak transaksi');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  // Handle view history
  const handleViewHistory = async (item: PendingApprovalItem) => {
    if (!window.electronAPI) return;

    try {
      let history;
      switch (item.module) {
        case 'Kas':
          history = await window.electronAPI.getKasApprovalHistory(item.id);
          break;
        case 'Bank':
          history = await window.electronAPI.getBankApprovalHistory(item.id);
          break;
        case 'Gudang':
          history = await window.electronAPI.getGudangApprovalHistory(item.id);
          break;
      }
      setApprovalHistory(history || []);
      setShowHistoryModal(item.id);
    } catch (error) {
      console.error('[Dashboard] Failed to load history:', error);
    }
  };

  // Check if user can approve this item
  const canApproveItem = (item: PendingApprovalItem): boolean => {
    if (!user) return false;
    if (!canApprove) return false;
    if (item.created_by === user.id) return false; // Cannot approve own
    if (item.status === 'Pending Approval 2') {
      // Different approver required for stage 2 - would need to check who approved stage 1
      // For simplicity, we allow if user is not the creator
      return true;
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

  const handleModuleClick = (module: string) => {
    switch (module) {
      case 'Kas':
        onNavigateToKas?.();
        break;
      case 'Bank':
        onNavigateToBank?.();
        break;
      case 'Gudang':
        onNavigateToGudang?.();
        break;
    }
  };

  const getModuleBadgeColor = (module: string) => {
    switch (module) {
      case 'Kas':
        return 'bg-green-100 text-green-800';
      case 'Bank':
        return 'bg-blue-100 text-blue-800';
      case 'Gudang':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Sticky Header Container */}
      <div 
        className={`sticky top-0 z-30 transition-all duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
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
                <h1 className="text-xl font-bold text-gray-800">Dashboard Approval</h1>
              </div>
              <p className="text-sm text-gray-500 ml-8">Kelola semua transaksi yang menunggu persetujuan</p>
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
            {/* Pending Approval 1 Card */}
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Pending Approval 1</p>
                  <p className="text-2xl font-bold text-yellow-800">{counts.pendingApproval1}</p>
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

            {/* Pending Approval 2 Card */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Pending Approval 2</p>
                  <p className="text-2xl font-bold text-blue-800">{counts.pendingApproval2}</p>
                </div>
                <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-xs text-blue-600">
                Total: {counts.totalPending} transaksi
              </div>
            </div>

            {/* Overdue Card */}
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Overdue (&gt;24h)</p>
                  <p className="text-2xl font-bold text-red-800">
                    {pagination.data.filter(item => isOverdue(item.created_at)).length}
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
                placeholder="Cari nomor transaksi atau pembuat..."
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
              <option value="Pending Approval 1">Pending Approval 1</option>
              <option value="Pending Approval 2">Pending Approval 2</option>
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
          {(debouncedSearch || moduleFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setModuleFilter('all');
                setStatusFilter('all');
                setStartDate('');
                setEndDate('');
              }}
              aria-label="Reset filter"
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
      <div aria-live="polite" aria-atomic="true" className="sr-only" />
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
                loadPendingApprovals();
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
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">COA</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aspek Kerja</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blok</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detail</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Approval</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pembuat</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
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
                    <td colSpan={14} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-medium">Tidak ada transaksi pending</p>
                        <p className="text-sm">Semua transaksi sudah diproses atau belum ada yang menunggu approval</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagination.data.map((item, index) => (
                    <tr 
                      key={`${item.module}-${item.id}`} 
                      className={`hover:bg-gray-50 ${isOverdue(item.created_at) ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-3 py-3 text-sm text-gray-500">
                        {(pagination.page - 1) * pagination.pageSize + index + 1}
                      </td>
                      <td className="px-3 py-3">
                        <span 
                          onClick={() => handleModuleClick(item.module)}
                          className={`px-2 py-1 text-xs font-medium rounded-full cursor-pointer hover:opacity-80 ${getModuleBadgeColor(item.module)}`}
                        >
                          {item.module}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-mono font-medium text-gray-900">{item.transaction_number}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        <div>{item.transaction_date}</div>
                        <div className="text-xs text-gray-400">{getHoursPending(item.created_at)}j lalu</div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{item.transaction_type}</td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        <div className="font-mono">{item.coa_kode || '-'}</div>
                        <div className="text-gray-400 truncate max-w-[100px]">{item.coa_nama || ''}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        <div className="font-mono">{item.aspek_kerja_kode || '-'}</div>
                        <div className="text-gray-400 truncate max-w-[100px]">{item.aspek_kerja_nama || ''}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        <div className="font-mono">{item.blok_kode || '-'}</div>
                        <div className="text-gray-400 truncate max-w-[80px]">{item.blok_nama || ''}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[150px]">
                        <div className="truncate" title={item.description}>
                          {item.description || '-'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {item.module === 'Bank' && item.bank_account && (
                          <div className="text-xs">
                            <span className="text-gray-500">Bank:</span> {item.bank_account}
                          </div>
                        )}
                        {item.module === 'Gudang' && (item.item_name || item.item_unit) && (
                          <div className="text-xs">
                            <span className="text-gray-500">Item:</span> {item.item_name || '-'}
                            {item.item_unit && <span className="text-gray-400"> ({item.item_unit})</span>}
                          </div>
                        )}
                        {!item.bank_account && (!item.item_name && !item.item_unit) && (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="space-y-1">
                          {/* KTU (Approver 1) */}
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500 font-medium">KTU:</span>
                            {item.approver_1_name ? (
                              <div className="text-green-700">
                                <span className="font-medium">{item.approver_1_name}</span>
                                {item.approver_1_at && (
                                  <div className="text-xs text-gray-400">
                                    {formatDate(item.approver_1_at)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-yellow-600">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Menunggu</span>
                              </div>
                            )}
                          </div>
                          {/* ASKEP (Approver 2) */}
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500 font-medium">ASKEP:</span>
                            {item.approver_2_name ? (
                              <div className="text-green-700">
                                <span className="font-medium">{item.approver_2_name}</span>
                                {item.approver_2_at && (
                                  <div className="text-xs text-gray-400">
                                    {formatDate(item.approver_2_at)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-yellow-600">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Menunggu</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {item.created_by_name || item.created_by}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          {!isGuest && canApproveItem(item) && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowApproveModal(item.id);
                                }}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                aria-label="Setujui transaksi"
                                title="Setujui"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowRejectModal(item.id);
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                aria-label="Tolak transaksi"
                                title="Tolak"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleViewHistory(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
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
              Menampilkan {pagination.data.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total}
            </span>
            <label htmlFor="pageSize" className="sr-only">Jumlah per halaman</label>
            <select
              id="pageSize"
              value={pagination.pageSize}
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
              disabled={pagination.page === 1}
              aria-label="Halaman pertama"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Awal
            </button>
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              aria-label="Halaman sebelumnya"
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
              aria-label="Halaman berikutnya"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &gt;
            </button>
            <button
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
              aria-label="Halaman terakhir"
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Akhir
            </button>
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Setujui Transaksi</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Modul: <span className="font-medium">{selectedItem.module}</span></p>
              <p className="text-sm text-gray-600">No Transaksi: <span className="font-medium font-mono">{selectedItem.transaction_number}</span></p>
              <p className="text-sm text-gray-600">Jumlah: <span className="font-medium">{formatCurrency(selectedItem.amount)}</span></p>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Apakah Anda yakin ingin menyetujui transaksi ini?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Dengan menyetujui, Anda menjadi approver untuk transaksi ini.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowApproveModal(null);
                  setSelectedItem(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleApprove(selectedItem)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
              >
                Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Tolak Transaksi</h3>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Modul: <span className="font-medium">{selectedItem.module}</span></p>
              <p className="text-sm text-gray-600">No Transaksi: <span className="font-medium font-mono">{selectedItem.transaction_number}</span></p>
            </div>
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
                  setSelectedItem(null);
                  setRejectReason('');
                  setActionError('');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => handleReject(selectedItem)}
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

export default DashboardApprovalPage;
