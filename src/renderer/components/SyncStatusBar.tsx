import React, { useMemo, useState, useEffect } from 'react';
import { useSync } from '../context/SyncContext';
import ConflictResolutionDialog from './ConflictResolutionDialog';
import ToastContainer from './ToastContainer';
import NotificationHistory from './NotificationHistory';

interface UserInfo {
  username: string;
  full_name: string;
  role: string;
}

interface SyncStatusBarProps {
  onOpenSettings?: () => void;
  user?: UserInfo | null;
  /** Optional module filter to show module-specific status */
  module?: string;
  /** Show compact version (smaller) */
  compact?: boolean;
}

/**
 * Format relative time string (e.g., "2 menit yang lalu", " baru saja")
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Belum pernah';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) {
    return 'baru saja';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} menit yang lalu`;
  } else if (diffHours < 24) {
    return `${diffHours} jam yang lalu`;
  } else if (diffDays === 1) {
    return 'kemarin';
  } else if (diffDays < 7) {
    return `${diffDays} hari yang lalu`;
  } else {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

/**
 * Format timestamp for tooltip
 */
function formatTimestamp(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SyncStatusBar: React.FC<SyncStatusBarProps> = ({ onOpenSettings, user, module, compact = false }) => {
  const {
    connectionStatuses,
    queueInfo,
    moduleSyncStatuses,
    isOnline,
    networkStatus,
    syncStatus,
    pauseReason,
    lastSyncAt,
    nextSyncAt,
    syncProgress,
    lastSyncError,
    triggerManualSync,
  } = useSync();

  // Conflict dialog state
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingConflictsCount, setPendingConflictsCount] = useState(0);
  
  // Per-module breakdown expansion state (VAL-UI-008)
  const [showModuleBreakdown, setShowModuleBreakdown] = useState(false);

  // Load pending conflicts count periodically
  useEffect(() => {
    const loadPendingConflictsCount = async () => {
      if (!window.electronAPI) return;
      try {
        const conflicts = await window.electronAPI.getPendingSyncConflicts();
        setPendingConflictsCount(conflicts.length);
      } catch (error) {
        console.error('[SyncStatusBar] Failed to load pending conflicts count:', error);
      }
    };

    // Initial load
    loadPendingConflictsCount();

    // Refresh every 30 seconds
    const interval = setInterval(loadPendingConflictsCount, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate summary based on module filter
  const filteredStatuses = useMemo(() => {
    if (module) {
      return connectionStatuses.filter(s => s.module === module);
    }
    return connectionStatuses;
  }, [connectionStatuses, module]);

  const totalConfigured = filteredStatuses.filter(s => s.path).length;
  const isAdministrator = user?.role === 'Administrator';

  // Get sync status display info
  const getSyncStatusDisplay = () => {
    switch (syncStatus) {
      case 'syncing':
        return {
          label: 'Menyinkronkan...',
          color: 'blue',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          icon: (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ),
        };
      case 'paused':
        return {
          label: pauseReason === 'network' ? 'Dijeda - Offline' : 'Dijeda',
          color: 'yellow',
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        };
      case 'error':
        return {
          label: 'Gagal Sync',
          color: 'red',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
      case 'idle':
      default:
        return {
          label: 'Tersinkronkan',
          color: 'green',
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ),
        };
    }
  };

  const statusDisplay = getSyncStatusDisplay();

  // Network status indicator
  const getNetworkDisplay = () => {
    if (!isOnline || networkStatus.status === 'offline') {
      return {
        label: 'Offline',
        color: 'red',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        ),
      };
    }
    
    if (networkStatus.connectionQuality === 'poor') {
      return {
        label: 'Koneksi Lemah',
        color: 'yellow',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
      };
    }
    
    return {
      label: 'Online',
      color: 'green',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      ),
    };
  };

  const networkDisplay = getNetworkDisplay();

  // Calculate progress percentage if syncing
  const progressPercent = syncProgress && syncProgress.totalItems > 0
    ? Math.round((syncProgress.totalProcessed / syncProgress.totalItems) * 100)
    : null;

  return (
    <>
      {/* ToastContainer for multiple stacked toast notifications */}
      <ToastContainer />

      {/* Notification History Bell Icon */}
      <NotificationHistory />

      {/* Network Status Banner - Shows when offline */}
      {!isOnline && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          <span className="font-medium">Offline - Perubahan akan diqueue dan disinkronkan saat koneksi pulih</span>
        </div>
      )}

      {/* Sync Status Bar - Shows when online and some configured */}
      {isOnline && totalConfigured > 0 && (
        <div className={`${statusDisplay.bgColor} ${statusDisplay.borderColor} border-b px-4 ${compact ? 'py-1.5' : 'py-2'} flex items-center justify-between`}>
          <div className="flex items-center gap-4">
            {/* Network Status Indicator */}
            <div className={`flex items-center gap-1.5 text-${networkDisplay.color}-600`}>
              {networkDisplay.icon}
              <span className={`text-xs font-medium ${compact ? 'hidden sm:inline' : ''}`}>{networkDisplay.label}</span>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-300"></div>

            {/* Sync Status Indicator */}
            <div className={`flex items-center gap-1.5 ${statusDisplay.textColor}`}>
              {statusDisplay.icon}
              <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
                {statusDisplay.label}
              </span>
              
              {/* Progress indicator when syncing */}
              {syncStatus === 'syncing' && progressPercent !== null && (
                <span className="text-xs text-blue-600 ml-1">
                  ({progressPercent}%)
                </span>
              )}
            </div>

            {/* Last Sync Time */}
            {lastSyncAt && syncStatus !== 'syncing' && (
              <div className="flex items-center gap-1.5 text-gray-500" title={`Terakhir sync: ${formatTimestamp(lastSyncAt)}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-xs ${compact ? 'hidden sm:inline' : ''}`}>
                  {formatRelativeTime(lastSyncAt)}
                </span>
              </div>
            )}

            {/* Next Sync Time */}
            {nextSyncAt && syncStatus === 'idle' && !compact && (
              <div className="flex items-center gap-1.5 text-gray-400" title={`Next sync: ${formatTimestamp(nextSyncAt)}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-xs">
                  Next: {formatRelativeTime(nextSyncAt)}
                </span>
              </div>
            )}

            {/* Queue/Pending indicator - with click to expand per-module breakdown (VAL-UI-008) */}
            {queueInfo.total > 0 && (
              <button
                onClick={() => setShowModuleBreakdown(!showModuleBreakdown)}
                className="flex items-center gap-1.5 text-yellow-600 hover:text-yellow-700 transition-colors"
                title="Klik untuk melihat breakdown per modul"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-xs font-medium ${queueInfo.failed > 0 ? 'text-red-600' : ''}`}>
                  {queueInfo.total} pending
                  {queueInfo.failed > 0 && ` (${queueInfo.failed} gagal)`}
                </span>
                <svg className={`w-3 h-3 transition-transform ${showModuleBreakdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/* Error message */}
            {syncStatus === 'error' && lastSyncError && !compact && (
              <div className="flex items-center gap-1.5 text-red-600 max-w-xs">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs truncate" title={lastSyncError}>
                  {lastSyncError}
                </span>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            {/* Manual Sync Button */}
            {syncStatus !== 'syncing' && isOnline && (
              <button
                onClick={() => triggerManualSync()}
                className={`p-1.5 rounded hover:bg-white/50 text-${statusDisplay.color}-600 transition-colors`}
                title="Sinkronisasi sekarang"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Conflict Resolution Button - Shows when there are pending conflicts */}
            {pendingConflictsCount > 0 && (
              <button
                onClick={() => setShowConflictDialog(true)}
                className="p-1.5 rounded bg-red-100 hover:bg-red-200 text-red-600 transition-colors relative"
                title={`${pendingConflictsCount} konflik membutuhkan resolusi`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingConflictsCount > 9 ? '9+' : pendingConflictsCount}
                </span>
              </button>
            )}

            {/* Settings - Admin only */}
            {isAdministrator && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className={`text-xs ${statusDisplay.textColor} hover:text-${statusDisplay.color}-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 transition-colors`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!compact && <span>Pengaturan</span>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Minimal status bar when no configs configured but is online */}
      {isOnline && totalConfigured === 0 && !compact && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Network Status */}
            <div className="flex items-center gap-1.5 text-green-600">
              {networkDisplay.icon}
              <span className="text-xs font-medium">{networkDisplay.label}</span>
            </div>

            {/* Sync Status */}
            <div className="flex items-center gap-1.5 text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs">Sync tidak dikonfigurasi</span>
            </div>
          </div>

          {isAdministrator && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="text-xs text-primary-700 hover:text-primary-800 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Konfigurasi Sync
            </button>
          )}
        </div>
      )}

      {/* Per-Module Sync Status Breakdown (VAL-UI-008) */}
      {showModuleBreakdown && isOnline && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Status Sinkronisasi Per Modul</h4>
            <button
              onClick={() => setShowModuleBreakdown(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {moduleSyncStatuses.map((modStatus) => {
              // Determine status color and icon
              let statusColor = 'text-gray-400';
              let statusBg = 'bg-gray-50';
              let statusIcon = null;
              
              if (modStatus.syncState === 'pending') {
                statusColor = 'text-yellow-700';
                statusBg = 'bg-yellow-50';
                statusIcon = (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              } else if (modStatus.syncState === 'error') {
                statusColor = 'text-red-700';
                statusBg = 'bg-red-50';
                statusIcon = (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                );
              } else if (modStatus.syncState === 'synced') {
                statusColor = 'text-green-700';
                statusBg = 'bg-green-50';
                statusIcon = (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                );
              } else {
                statusColor = 'text-gray-500';
                statusBg = 'bg-gray-50';
                statusIcon = (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              }
              
              return (
                <div
                  key={modStatus.module}
                  className={`${statusBg} rounded-lg p-2 border border-gray-200`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{modStatus.label}</span>
                    <span className={statusColor}>{statusIcon}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {modStatus.pendingCount > 0 ? (
                      <span className="text-lg font-bold text-yellow-600">{modStatus.pendingCount}</span>
                    ) : (
                      <span className="text-lg font-bold text-green-600">✓</span>
                    )}
                    <span className="text-xs text-gray-500">
                      {modStatus.lastSyncAt ? formatRelativeTime(modStatus.lastSyncAt) : '-'}
                    </span>
                  </div>
                  {modStatus.pendingCount > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      {modStatus.pendingCount} pending
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        isOpen={showConflictDialog}
        onClose={() => setShowConflictDialog(false)}
        onResolved={() => {
          // Refresh the pending conflicts count after resolution
          setPendingConflictsCount(0);
        }}
      />
    </>
  );
};

export default SyncStatusBar;
