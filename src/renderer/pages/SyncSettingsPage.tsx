import React, { useState, useEffect, useCallback } from 'react';
import { useSync, MODULES } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import ConflictResolutionDialog from '../components/ConflictResolutionDialog';
import SyncHistoryPanel from '../components/SyncHistoryPanel';

// Types for Sync Health Dashboard API
interface SyncStats {
  pending: number;
  inProgress: number;
  failed: number;
  completed: number;
  total: number;
  oldestPendingTimestamp: string | null;
}

interface ModuleSyncStatus {
  module: string;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  syncState: 'synced' | 'pending' | 'error' | 'not_configured';
}

interface FailedItem {
  id: string;
  module: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  canRetry: boolean;
  maxRetries: number;
  retryDelayMs: number | null;
  retryDelayFormatted: string | null;
  status: 'failed' | 'error';
}

interface SyncSettingsProps {
  onBack: () => void;
}

interface ModuleConfig {
  module: string;
  label: string;
  remotePath: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

const SyncSettings: React.FC<SyncSettingsProps> = ({ onBack }) => {
  const { configs, connectionStatuses, saveConfig, deleteConfig, performSync, clearQueue, queueInfo, isSyncing, networkStatus, syncProgress } = useSync();
  const { user } = useAuth();
  
  // View/Edit mode toggle - default to View mode
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Conflict dialog state
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingConflictsCount, setPendingConflictsCount] = useState(0);
  
  // Confirmation dialog state for clear queue
  const [showClearQueueConfirm, setShowClearQueueConfirm] = useState(false);
  
  // Sync History Panel state (VAL-UI-009)
  const [showSyncHistory, setShowSyncHistory] = useState(false);
  
  // Sync Health Dashboard state
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [moduleSyncStatuses, setModuleSyncStatuses] = useState<Record<string, ModuleSyncStatus>>({});
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [failedItemsTotal, setFailedItemsTotal] = useState(0);
  
  // Check if user is admin
  const isAdmin = user?.role === 'Administrator';
  
  // If not admin, force View mode
  const effectiveEditMode = isAdmin ? isEditMode : false;
  
  const [moduleConfigs, setModuleConfigs] = useState<ModuleConfig[]>(
    MODULES.map(m => ({
      module: m.key,
      label: m.label,
      remotePath: '',
      enabled: false,
      lastSyncAt: null,
    }))
  );
  
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [editPath, setEditPath] = useState('');
  const [editEnabled, setEditEnabled] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load sync health data using getSyncHealthDashboardData
  const loadSyncHealthData = useCallback(async () => {
    if (!window.electronAPI) return;
    
    try {
      // Load comprehensive health dashboard data
      const dashboardData = await window.electronAPI.getSyncHealthDashboardData();
      
      if (dashboardData) {
        // Set stats from dashboard data
        if (dashboardData.stats) {
          setSyncStats({
            pending: dashboardData.stats.pending,
            inProgress: 0,
            failed: dashboardData.stats.failed,
            completed: 0,
            total: dashboardData.stats.total,
            oldestPendingTimestamp: null,
          });
        }
        
        // Set module statuses from dashboard data (using moduleStatus property)
        if (dashboardData.moduleStatus) {
          setModuleSyncStatuses(dashboardData.moduleStatus);
        }
        
        // Load failed items separately since they're not in dashboard data
        try {
          const failedResult = await window.electronAPI.getSyncHealthFailedItems({ limit: 20 });
          if (failedResult && failedResult.items) {
            setFailedItems(failedResult.items);
            setFailedItemsTotal(failedResult.totalCount || failedResult.items.length);
          }
        } catch (failedError) {
          console.error('[SyncSettings] Failed to load failed items:', failedError);
        }
      }
    } catch (error) {
      console.error('[SyncSettings] Failed to load sync health data:', error);
    }
  }, []);

  // Load sync health data on mount and periodically
  useEffect(() => {
    loadSyncHealthData();
    const interval = setInterval(loadSyncHealthData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [loadSyncHealthData]);

  // Load pending conflicts count
  const loadPendingConflictsCount = async () => {
    if (!window.electronAPI) return;
    try {
      const conflicts = await window.electronAPI.getPendingSyncConflicts();
      setPendingConflictsCount(conflicts.length);
    } catch (error) {
      console.error('[SyncSettings] Failed to load pending conflicts count:', error);
    }
  };

  useEffect(() => {
    loadPendingConflictsCount();
  }, [loadPendingConflictsCount]);

  // Handle retry single failed item
  const handleRetryFailedItem = async (itemId: string) => {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.retrySyncHealthFailedItem(itemId);
      if (result.success) {
        // Refresh failed items list
        await loadSyncHealthData();
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('[SyncSettings] Failed to retry item:', error);
    }
  };

  // Handle retry all failed items
  const handleRetryAllFailed = async () => {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.retrySyncHealthAllFailed();
      if (result.success) {
        // Refresh failed items list
        await loadSyncHealthData();
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('[SyncSettings] Failed to retry all:', error);
    }
  };

  // Load configs into moduleConfigs state

  // Load configs into moduleConfigs state
  useEffect(() => {
    if (configs.length > 0) {
      setModuleConfigs(prev => prev.map(m => {
        const config = configs.find(c => c.module === m.module);
        return {
          ...m,
          remotePath: config?.remotePath || '',
          enabled: config?.enabled || false,
          lastSyncAt: config?.lastSyncAt || null,
        };
      }));
    }
  }, [configs]);

  const getConnectionStatus = (module: string) => {
    return connectionStatuses.find(s => s.module === module);
  };

  const handleEdit = (module: string) => {
    const config = moduleConfigs.find(m => m.module === module);
    if (config) {
      setEditingModule(module);
      setEditPath(config.remotePath);
      setEditEnabled(config.enabled);
      setValidationError(null);
    }
  };

  const handleCancel = () => {
    setEditingModule(null);
    setEditPath('');
    setEditEnabled(false);
    setValidationError(null);
  };

  const handleSave = async () => {
    // Validate path format
    if (editEnabled && editPath.trim() === '') {
      setValidationError('Path harus diisi jika sinkronisasi diaktifkan');
      return;
    }

    if (editPath.trim() && !isValidPathFormat(editPath)) {
      setValidationError('Format path tidak valid. Gunakan format UNC (\\\\server\\folder) atau drive letter (D:\\folder)');
      return;
    }

    setValidationError(null);
    
    const result = await saveConfig(editingModule!, editPath.trim(), editEnabled);
    
    if (result.success) {
      setEditingModule(null);
      setEditPath('');
      setEditEnabled(false);
    } else {
      setValidationError(result.message);
    }
  };

  const isValidPathFormat = (path: string): boolean => {
    // UNC path: \\server\share
    const uncPattern = /^\\\\[^\s\\/]+[^\s\\]*(\\)?$/;
    // Drive letter: D:\folder or D:/
    const drivePattern = /^[A-Za-z]:[\\/]/;
    
    return uncPattern.test(path) || drivePattern.test(path);
  };

  const handleSyncNow = async (module: string) => {
    await performSync(module);
  };

  const handleDelete = async (module: string) => {
    if (confirm('Hapus konfigurasi sinkronisasi untuk modul ini?')) {
      await deleteConfig(module);
    }
  };

  // Handle clear queue with confirmation
  const handleClearQueueClick = () => {
    setShowClearQueueConfirm(true);
  };

  const handleConfirmClearQueue = async () => {
    setShowClearQueueConfirm(false);
    await clearQueue();
    await loadSyncHealthData();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div data-testid="sync-settings-header" className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            data-testid="sync-back-button"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Kembali
          </button>
          <h1 className="text-xl font-bold text-gray-800">Pengaturan Sinkronisasi</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {/* View/Edit Mode Toggle - Admin only */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${!effectiveEditMode ? 'text-primary-700' : 'text-gray-500'}`}>
                Mode Tampilan
              </span>
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  effectiveEditMode ? 'bg-primary-700' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    effectiveEditMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${effectiveEditMode ? 'text-primary-700' : 'text-gray-500'}`}>
                {effectiveEditMode ? 'Mode Edit' : 'Mode View'}
              </span>
            </div>
          )}
          
          {/* Non-admin indicator */}
          {!isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-600 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium">Mode Tampilan (View Only)</span>
            </div>
          )}
          
          {queueInfo.total > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{queueInfo.total} item di queue</span>
            </div>
          )}

          {/* Conflict Resolution Button */}
          {pendingConflictsCount > 0 && (
            <button
              onClick={() => setShowConflictDialog(true)}
              className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">
                {pendingConflictsCount} Konflik
              </span>
            </button>
          )}

          {/* Sync History Button (VAL-UI-009) */}
          <button
            onClick={() => setShowSyncHistory(true)}
            className="flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">Riwayat Sync</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Sinkronisasi Multi-Lokasi</p>
                <p>Konfigurasi path remote untuk setiap modul. Gunakan format UNC (\\server\share) atau drive letter (D:\folder). Perubahan akan diqueue saat offline dan sinkronisasi otomatis saat koneksi dipulihkan.</p>
              </div>
            </div>
          </div>

          {/* Module List */}
          <div className="space-y-4">
            {moduleConfigs.map((config) => {
              const status = getConnectionStatus(config.module);
              const isEditing = editingModule === config.module;
              
              return (
                <div
                  key={config.module}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  {isEditing ? (
                    // Edit Mode - Inline editing form
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-4">{config.label}</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Path Remote (LAN/UNC)
                          </label>
                          <input
                            type="text"
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            placeholder="\\192.168.1.100\data atau D:\Database"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`enabled-${config.module}`}
                            checked={editEnabled}
                            onChange={(e) => setEditEnabled(e.target.checked)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <label htmlFor={`enabled-${config.module}`} className="text-sm text-gray-700">
                            Aktifkan sinkronisasi
                          </label>
                        </div>
                        
                        {validationError && (
                          <div className="text-sm text-red-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {validationError}
                          </div>
                        )}
                        
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-primary-700 text-white rounded-lg hover:bg-primary-800 text-sm font-medium"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={handleCancel}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View Mode - Display card with status and optional edit controls
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          {/* Status Indicator */}
                          {config.remotePath ? (
                            status?.connected ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-sm text-green-700 font-medium">Terhubung</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                <span className="text-sm text-red-700 font-medium">Terputus</span>
                              </span>
                            )
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                              <span className="text-sm text-gray-500">Belum dikonfigurasi</span>
                            </span>
                          )}
                        </div>
                        
                        <div>
                          <h3 className="font-medium text-gray-800">{config.label}</h3>
                          {config.remotePath && (
                            <p className="text-sm text-gray-500 font-mono">{config.remotePath}</p>
                          )}
                          {config.lastSyncAt && (
                            <p className="text-xs text-gray-400 mt-1">
                              Last sync: {new Date(config.lastSyncAt).toLocaleString('id-ID')}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Action buttons - only shown in Edit mode */}
                      {effectiveEditMode && (
                        <div className="flex items-center gap-2">
                          {config.remotePath && (
                            <>
                              {status?.connected && (
                                <button
                                  onClick={() => handleSyncNow(config.module)}
                                  disabled={isSyncing}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                                >
                                  <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  Sync Sekarang
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(config.module)}
                                className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleEdit(config.module)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                          >
                            {config.remotePath ? 'Edit' : 'Konfigurasi'}
                          </button>
                        </div>
                      )}
                      
                      {/* View mode - just show sync button without delete/edit */}
                      {!effectiveEditMode && config.remotePath && status?.connected && (
                        <button
                          onClick={() => handleSyncNow(config.module)}
                          disabled={isSyncing}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                        >
                          <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Sync
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Connection Quality Indicator */}
          {networkStatus && (
            <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Kualitas Koneksi</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {networkStatus.connectionQuality === 'good' && (
                    <>
                      <span className="w-4 h-4 bg-green-500 rounded-full"></span>
                      <span className="text-green-700 font-medium">Baik</span>
                    </>
                  )}
                  {networkStatus.connectionQuality === 'fair' && (
                    <>
                      <span className="w-4 h-4 bg-yellow-500 rounded-full"></span>
                      <span className="text-yellow-700 font-medium">Sedang</span>
                    </>
                  )}
                  {networkStatus.connectionQuality === 'poor' && (
                    <>
                      <span className="w-4 h-4 bg-red-500 rounded-full"></span>
                      <span className="text-red-700 font-medium">Buruk</span>
                    </>
                  )}
                  {networkStatus.connectionQuality === 'unknown' && (
                    <>
                      <span className="w-4 h-4 bg-gray-400 rounded-full"></span>
                      <span className="text-gray-500 font-medium">Tidak Diketahui</span>
                    </>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  Status: {networkStatus.status === 'online' ? 'Online' : networkStatus.status === 'offline' ? 'Offline' : 'Memeriksa...'}
                </span>
              </div>
            </div>
          )}

          {/* Queue Statistics */}
          {syncStats && (syncStats.total > 0 || syncStats.failed > 0) && (
            <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Statistik Queue Sinkronisasi</h3>
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div className="bg-yellow-50 rounded p-3">
                  <p className="text-gray-500">Menunggu</p>
                  <p className="text-2xl font-bold text-yellow-600">{syncStats.pending}</p>
                </div>
                <div className="bg-red-50 rounded p-3">
                  <p className="text-gray-500">Gagal</p>
                  <p className="text-2xl font-bold text-red-600">{syncStats.failed}</p>
                </div>
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-gray-600">{syncStats.total}</p>
                </div>
              </div>
              
              {/* Per-Module Breakdown */}
              <div className="border-t border-gray-100 pt-3">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Per Modul:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(moduleSyncStatuses).map(([moduleKey, modStatus]) => {
                    const moduleLabel = MODULES.find(m => m.key === moduleKey)?.label || moduleKey;
                    return (
                      <div key={moduleKey} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{moduleLabel}</span>
                        <div className="flex items-center gap-2">
                          {modStatus.pendingCount > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                              {modStatus.pendingCount} menunggu
                            </span>
                          )}
                          {modStatus.failedCount > 0 && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                              {modStatus.failedCount} gagal
                            </span>
                          )}
                          {modStatus.syncState === 'synced' && modStatus.pendingCount === 0 && modStatus.failedCount === 0 && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                              ✓
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Failed Items List */}
          {failedItems.length > 0 && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-red-800">Item Gagal ({failedItemsTotal} total)</h3>
                {isAdmin && failedItems.length > 0 && (
                  <button
                    onClick={handleRetryAllFailed}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                  >
                    Retry Semua
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {failedItems.map((item) => {
                  const moduleLabel = MODULES.find(m => m.key === item.module)?.label || item.module;
                  return (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded p-3 border border-red-100">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">{moduleLabel}</span>
                          <span className="text-sm text-gray-500">
                            {item.operation === 'create' ? 'Buat' : item.operation === 'update' ? 'Update' : 'Hapus'} 
                            {' #'}{item.recordId.substring(0, 8)}...
                          </span>
                        </div>
                        {item.lastError && (
                          <p className="text-xs text-red-600 mt-1">{item.lastError}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>Attempt: {item.attempts}/{item.maxRetries}</span>
                          {item.retryDelayFormatted && item.canRetry && (
                            <span>Retry dalam: {item.retryDelayFormatted}</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleRetryFailedItem(item.id)}
                          disabled={!item.canRetry}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {item.canRetry ? 'Retry' : 'Max Retry'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sync Progress Indicator */}
          {syncProgress && syncProgress.status === 'in_progress' && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-blue-800">Sinkronisasi Sedang Berjalan</h3>
                <span className="text-sm text-blue-600">
                  {syncProgress.itemsProcessed} / {syncProgress.totalItems} item
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-blue-200 rounded-full h-4 mb-3">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${syncProgress.totalItems > 0 ? (syncProgress.itemsProcessed / syncProgress.totalItems) * 100 : 0}%`
                  }}
                />
              </div>
              
              {/* Progress Details */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">Berhasil</p>
                  <p className="text-lg font-bold text-green-600">{syncProgress.succeeded}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Gagal</p>
                  <p className="text-lg font-bold text-red-600">{syncProgress.failed}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Estimasi</p>
                  <p className="text-lg font-bold text-blue-600">
                    {syncProgress.estimatedRemainingMs
                      ? `${Math.ceil(syncProgress.estimatedRemainingMs / 1000)}s`
                      : 'Menghitung...'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Clear Queue Button - Admin Only */}
          {isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0) && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleClearQueueClick}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Bersihkan Queue
              </button>
            </div>
          )}

          {/* Queue Status Legacy (fallback if no syncStats) */}
          {!syncStats && queueInfo.total > 0 && (
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">Status Queue Sinkronisasi</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-white rounded p-3">
                  <p className="text-gray-500">Menunggu</p>
                  <p className="text-2xl font-bold text-yellow-600">{queueInfo.pending}</p>
                </div>
                <div className="bg-white rounded p-3">
                  <p className="text-gray-500">Gagal</p>
                  <p className="text-2xl font-bold text-red-600">{queueInfo.failed}</p>
                </div>
                <div className="bg-white rounded p-3">
                  <p className="text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-gray-600">{queueInfo.total}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear Queue Confirmation Dialog */}
      {showClearQueueConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Konfirmasi Bersihkan Queue</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Apakah Anda yakin ingin menghapus semua item dari queue sinkronisasi? 
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearQueueConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmClearQueue}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
              >
                Ya, Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        isOpen={showConflictDialog}
        onClose={() => setShowConflictDialog(false)}
        onResolved={() => {
          // Refresh the pending conflicts count after resolution
          loadPendingConflictsCount();
        }}
      />

      {/* Sync History Panel (VAL-UI-009) */}
      <SyncHistoryPanel
        isOpen={showSyncHistory}
        onClose={() => setShowSyncHistory(false)}
      />
    </div>
  );
};

export default SyncSettings;
