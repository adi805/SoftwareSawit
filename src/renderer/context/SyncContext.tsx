import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// ============ Types ============

interface SyncConfig {
  id: string;
  module: string;
  remotePath: string;
  enabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionStatus {
  module: string;
  path: string;
  connected: boolean;
  lastChecked: string;
  error?: string;
}

interface SyncQueueInfo {
  pending: number;
  failed: number;
  total: number;
}

/**
 * Sync status states for the UI:
 * - idle: No sync in progress, timer running normally
 * - syncing: Active sync in progress
 * - paused: Sync paused (by user or network)
 * - error: Sync error occurred
 */
type SyncStatusState = 'idle' | 'syncing' | 'paused' | 'error';

interface NetworkStatusInfo {
  status: 'online' | 'offline' | 'checking';
  isInternetAccessible: boolean;
  connectionQuality: 'good' | 'fair' | 'poor' | 'unknown';
  lastCheckedAt: string;
}

interface AutoSyncTimerStatus {
  isRunning: boolean;
  isSyncing: boolean;
  isPaused: boolean;
  isPausedByNetwork: boolean;
  isManuallyPaused: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  intervalMs: number;
  enabled: boolean;
  tickCount: number;
  networkStatus: NetworkStatusInfo;
}

interface SyncProgress {
  currentBatch: number;
  totalBatches: number;
  itemsProcessed: number;
  totalProcessed: number;
  totalItems: number;
  succeeded: number;
  failed: number;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  elapsedMs: number;
  estimatedRemainingMs: number | null;
}

// Per-module sync status for VAL-UI-008
export interface ModuleSyncStatus {
  module: string;
  label: string;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  syncState: 'synced' | 'pending' | 'error' | 'not_configured';
}

// Notification types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: string;
  read: boolean;
}

interface SyncContextType {
  // Core state
  configs: SyncConfig[];
  connectionStatuses: ConnectionStatus[];
  queueInfo: SyncQueueInfo;
  
  // Per-module sync status (VAL-UI-008)
  moduleSyncStatuses: ModuleSyncStatus[];
  
  // Network and sync status
  isOnline: boolean;
  networkStatus: NetworkStatusInfo;
  syncStatus: SyncStatusState;
  pauseReason: 'network' | 'manual' | null;
  
  // Sync timing
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  
  // Real-time sync progress
  syncProgress: SyncProgress | null;
  
  // Error state
  lastSyncError: string | null;
  
  // Backward compatibility alias
  isSyncing: boolean;
  
  // Notifications (notification history)
  notifications: Notification[];
  unreadCount: number;
  lastNotification: { type: 'success' | 'error' | 'warning' | 'info'; message: string } | null;
  
  // Actions
  loadConfigs: () => Promise<void>;
  saveConfig: (module: string, remotePath: string, enabled: boolean) => Promise<{ success: boolean; message: string }>;
  deleteConfig: (module: string) => Promise<void>;
  checkConnections: () => Promise<void>;
  performSync: (module: string) => Promise<{ success: boolean; message: string }>;
  triggerManualSync: () => Promise<{ success: boolean; message: string }>;
  clearQueue: () => Promise<void>;
  dismissNotification: (id?: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotificationHistory: () => void;
  
  // Timer controls
  pauseAutoSync: () => Promise<void>;
  resumeAutoSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const MODULES = [
  { key: 'coa', label: 'COA (Chart of Accounts)' },
  { key: 'aspek_kerja', label: 'Aspek Kerja' },
  { key: 'blok', label: 'Blok' },
  { key: 'kas', label: 'Kas' },
  { key: 'bank', label: 'Bank' },
  { key: 'gudang', label: 'Gudang' },
];

// Default network status
const defaultNetworkStatus: NetworkStatusInfo = {
  status: 'online',
  isInternetAccessible: true,
  connectionQuality: 'unknown',
  lastCheckedAt: new Date().toISOString(),
};

export function SyncProvider({ children }: { children: ReactNode }) {
  // Core state
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [connectionStatuses, setConnectionStatuses] = useState<ConnectionStatus[]>([]);
  const [queueInfo, setQueueInfo] = useState<SyncQueueInfo>({ pending: 0, failed: 0, total: 0 });
  
  // Per-module sync status for VAL-UI-008
  const [moduleSyncStatuses, setModuleSyncStatuses] = useState<ModuleSyncStatus[]>([]);
  
  // Network status
  const [isOnline, setIsOnline] = useState(true);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusInfo>(defaultNetworkStatus);
  
  // Sync status tracking
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>('idle');
  const [pauseReason, setPauseReason] = useState<'network' | 'manual' | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  
  // Legacy state for backward compatibility - derived from syncStatus
  const isSyncing = syncStatus === 'syncing';
  
  // Notifications (notification history - max 50 items)
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unreadCount = notifications.filter(n => !n.read).length;
  const [lastNotification, setLastNotification] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

  // Generate unique notification ID
  const generateNotificationId = () => {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Show notification with auto-dismiss and add to history
  const showNotification = useCallback((type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    const notification: Notification = {
      id: generateNotificationId(),
      type,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Add to notification history (keep max 50)
    setNotifications(prev => {
      const updated = [notification, ...prev];
      if (updated.length > 50) {
        return updated.slice(0, 50);
      }
      return updated;
    });

    // Also set lastNotification for the current toast display
    setLastNotification({ type, message });
    setTimeout(() => {
      setLastNotification(null);
    }, 5000);
  }, []);

  // Dismiss notification (mark as read if id provided, or clear current toast)
  const dismissNotification = useCallback((id?: string) => {
    if (id) {
      // Mark specific notification as read
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } else {
      // Clear current toast (backward compatibility)
      setLastNotification(null);
    }
  }, []);

  // Mark a notification as read
  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  // Mark all notifications as read
  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Clear notification history
  const clearNotificationHistory = useCallback(() => {
    setNotifications([]);
  }, []);

  // Load sync configs and queue info
  const loadConfigs = useCallback(async () => {
    if (!window.electronAPI) return;
    
    try {
      const configsData = await window.electronAPI.getAllSyncConfigs();
      setConfigs(configsData);
      
      const queueData = await window.electronAPI.getSyncQueueCount();
      setQueueInfo(queueData);
      
      // Load per-module sync status for VAL-UI-008
      const moduleStatusResult = await window.electronAPI.getModuleSyncStatus();
      if (moduleStatusResult.success && moduleStatusResult.modules) {
        // Map to include labels
        const moduleLabels: Record<string, string> = {
          kas: 'Kas',
          bank: 'Bank',
          gudang: 'Gudang',
          coa: 'COA',
          aspek_kerja: 'Aspek Kerja',
          blok: 'Blok',
        };
        const modulesRecord = moduleStatusResult.modules as Record<string, ModuleSyncStatus>;
        const statuses = Object.values(modulesRecord).map((mod) => ({
          ...mod,
          label: moduleLabels[mod.module] || mod.module,
        }));
        setModuleSyncStatuses(statuses);
      }
    } catch (error) {
      console.error('[Sync] Failed to load configs:', error);
    }
  }, []);

  const saveConfig = useCallback(async (module: string, remotePath: string, enabled: boolean) => {
    if (!window.electronAPI) {
      return { success: false, message: 'Electron API not available' };
    }

    try {
      const result = await window.electronAPI.saveSyncConfig({ module, remotePath, enabled });
      
      if (result.success) {
        await loadConfigs();
        showNotification('success', `Konfigurasi sync untuk ${module} berhasil disimpan`);
        
        const status = await window.electronAPI.checkSyncConnection(module);
        if (status.connected) {
          showNotification('success', `Terhubung ke ${status.path}`);
        } else {
          showNotification('warning', `Tidak dapat terhubung: ${status.error}`);
        }
      } else {
        showNotification('error', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('[Sync] Failed to save config:', error);
      return { success: false, message: 'Gagal menyimpan konfigurasi' };
    }
  }, [loadConfigs, showNotification]);

  const deleteConfig = useCallback(async (module: string) => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.deleteSyncConfig(module);
      await loadConfigs();
      showNotification('info', `Konfigurasi sync untuk ${module} dihapus`);
    } catch (error) {
      console.error('[Sync] Failed to delete config:', error);
    }
  }, [loadConfigs, showNotification]);

  const checkConnections = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const statuses = await window.electronAPI.checkAllSyncConnections();
      setConnectionStatuses(statuses);

      const anyOnline = statuses.some(s => s.connected);
      setIsOnline(anyOnline);

      const newlyConnected = statuses.filter(s => s.connected);
      const newlyDisconnected = statuses.filter(s => !s.connected && s.path);

      if (newlyConnected.length > 0) {
        showNotification('success', `${newlyConnected.length} koneksi berhasil`);
      }
      if (newlyDisconnected.length > 0) {
        showNotification('warning', `${newlyDisconnected.length} koneksi terputus`);
      }
    } catch (error) {
      console.error('[Sync] Failed to check connections:', error);
    }
  }, [showNotification]);

  // Perform sync for a specific module (legacy method)
  const performSync = useCallback(async (module: string) => {
    if (!window.electronAPI) {
      return { success: false, message: 'Electron API not available' };
    }

    setSyncStatus('syncing');
    setLastSyncError(null);
    
    try {
      const result = await window.electronAPI.performSync(module);
      
      if (result.success) {
        showNotification('success', result.message);
        setSyncStatus('idle');
      } else {
        showNotification('error', result.message);
        setSyncStatus('error');
        setLastSyncError(result.message);
      }

      await loadConfigs();
      await checkConnections();
      
      // Update timer status to get latest lastSyncAt
      if (window.electronAPI.getAutoSyncTimerStatus) {
        const timerStatus = await window.electronAPI.getAutoSyncTimerStatus();
        if (timerStatus) {
          setLastSyncAt(timerStatus.lastSyncAt);
          setNextSyncAt(timerStatus.nextSyncAt);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[Sync] Failed to perform sync:', error);
      showNotification('error', 'Sinkronisasi gagal');
      setSyncStatus('error');
      setLastSyncError('Sinkronisasi gagal');
      return { success: false, message: 'Sinkronisasi gagal' };
    }
  }, [loadConfigs, checkConnections, showNotification]);

  // Trigger manual sync using the auto-sync timer
  const triggerManualSync = useCallback(async () => {
    if (!window.electronAPI) {
      return { success: false, message: 'Electron API not available' };
    }

    setSyncStatus('syncing');
    setLastSyncError(null);
    
    try {
      const result = await window.electronAPI.triggerManualSync();
      
      if (result.success) {
        showNotification('success', result.message);
      } else {
        showNotification('error', result.message);
        setSyncStatus('error');
        setLastSyncError(result.message);
      }

      await loadConfigs();
      
      // Update timer status
      if (window.electronAPI.getAutoSyncTimerStatus) {
        const timerStatus = await window.electronAPI.getAutoSyncTimerStatus();
        if (timerStatus) {
          setLastSyncAt(timerStatus.lastSyncAt);
          setNextSyncAt(timerStatus.nextSyncAt);
          // Update sync status based on timer state
          if (!timerStatus.isRunning || timerStatus.isPaused) {
            setSyncStatus('paused');
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('[Sync] Failed to trigger manual sync:', error);
      showNotification('error', 'Sinkronisasi gagal');
      setSyncStatus('error');
      setLastSyncError('Sinkronisasi gagal');
      return { success: false, message: 'Sinkronisasi gagal' };
    }
  }, [loadConfigs, showNotification]);

  const clearQueue = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.clearSyncQueue();
      showNotification('info', result.message);
      await loadConfigs();
    } catch (error) {
      console.error('[Sync] Failed to clear queue:', error);
    }
  }, [loadConfigs, showNotification]);

  // Pause auto-sync timer
  const pauseAutoSync = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.pauseAutoSyncTimer();
      setSyncStatus('paused');
      setPauseReason('manual');
      showNotification('info', 'Auto-sync dijeda');
    } catch (error) {
      console.error('[Sync] Failed to pause auto-sync:', error);
    }
  }, [showNotification]);

  // Resume auto-sync timer
  const resumeAutoSync = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.resumeAutoSyncTimer();
      setSyncStatus('idle');
      setPauseReason(null);
      showNotification('info', 'Auto-sync dilanjutkan');
    } catch (error) {
      console.error('[Sync] Failed to resume auto-sync:', error);
    }
  }, [showNotification]);

  // Initialize on mount
  useEffect(() => {
    loadConfigs();
    
    if (window.electronAPI) {
      window.electronAPI.initSync();
    }

    // Check connections periodically
    const connectionInterval = setInterval(checkConnections, 30000);
    checkConnections();

    // Fetch initial timer status
    const fetchTimerStatus = async () => {
      if (window.electronAPI?.getAutoSyncTimerStatus) {
        try {
          const timerStatus = await window.electronAPI.getAutoSyncTimerStatus();
          if (timerStatus) {
            updateTimerStatus(timerStatus);
          }
        } catch (error) {
          console.error('[Sync] Failed to get timer status:', error);
        }
      }
    };
    
    fetchTimerStatus();
    
    // Poll timer status every 10 seconds
    const timerInterval = setInterval(fetchTimerStatus, 10000);

    return () => {
      clearInterval(connectionInterval);
      clearInterval(timerInterval);
    };
  }, [loadConfigs, checkConnections]);

  // Update timer status from AutoSyncTimerStatus object
  const updateTimerStatus = useCallback((timerStatus: AutoSyncTimerStatus) => {
    setLastSyncAt(timerStatus.lastSyncAt);
    setNextSyncAt(timerStatus.nextSyncAt);
    
    // Determine sync status
    if (timerStatus.isSyncing) {
      setSyncStatus('syncing');
    } else if (timerStatus.isPaused) {
      setSyncStatus('paused');
      if (timerStatus.isPausedByNetwork) {
        setPauseReason('network');
      } else if (timerStatus.isManuallyPaused) {
        setPauseReason('manual');
      }
    } else if (timerStatus.isRunning) {
      setSyncStatus('idle');
    }
    
    // Update network status from timer
    if (timerStatus.networkStatus) {
      setNetworkStatus(timerStatus.networkStatus);
      setIsOnline(timerStatus.networkStatus.status === 'online' && timerStatus.networkStatus.isInternetAccessible);
    }
  }, []);

  // Set up event listeners for real-time updates
  useEffect(() => {
    if (!window.electronAPI) return;

    // Listen to auto-sync timer status updates
    const handleTimerStatus = (status: AutoSyncTimerStatus) => {
      updateTimerStatus(status);
    };

    // Listen to sync progress updates
    const handleSyncProgress = (progress: SyncProgress) => {
      setSyncProgress(progress);
      setSyncStatus('syncing');
    };

    // Listen to sync result updates
    const handleSyncResult = (result: { success: boolean; message?: string; totalProcessed?: number; succeeded?: number; failed?: number }) => {
      setSyncProgress(null);
      
      if (result.success) {
        setSyncStatus('idle');
        setLastSyncError(null);
        if (result.message) {
          showNotification('success', result.message);
        }
      } else {
        setSyncStatus('error');
        setLastSyncError(result.message || 'Sinkronisasi gagal');
        if (result.message) {
          // Classify error to determine toast type
          // Non-retryable errors (401, 403, 400, 404) get 'error' toast (red bg-red-600)
          // Retryable errors (network, 5xx) get 'warning' toast (yellow bg-yellow-600)
          const isNonRetryable = result.message.includes('401') || 
            result.message.includes('403') || 
            result.message.includes('400') || 
            result.message.includes('404') ||
            result.message.toLowerCase().includes('unauthorized') ||
            result.message.toLowerCase().includes('forbidden') ||
            result.message.toLowerCase().includes('not found') ||
            result.message.toLowerCase().includes('validation');
          
          showNotification(isNonRetryable ? 'error' : 'warning', result.message);
        }
      }
      
      // Refresh queue info after sync
      loadConfigs();
    };

    // Listen to network status changes
    const handleNetworkStatus = (status: NetworkStatusInfo) => {
      setNetworkStatus(status);
      setIsOnline(status.status === 'online' && status.isInternetAccessible);
      
      // Update sync status based on network
      if (status.status === 'offline') {
        setSyncStatus(prev => prev === 'syncing' ? prev : 'paused');
        setPauseReason('network');
      } else if (status.status === 'online' && status.isInternetAccessible) {
        if (pauseReason === 'network') {
          setSyncStatus('idle');
          setPauseReason(null);
        }
      }
    };

    // Listen to sync control (pause/resume from network status)
    const handleSyncControl = (data: { command: string; networkStatus: NetworkStatusInfo }) => {
      if (data.command === 'pause') {
        setSyncStatus('paused');
        setPauseReason('network');
      } else if (data.command === 'resume') {
        setSyncStatus(prev => prev === 'paused' && pauseReason === 'network' ? 'idle' : prev);
        if (pauseReason === 'network') {
          setPauseReason(null);
        }
      }
    };

    // Register event listeners
    window.electronAPI.onAutoSyncTimerStatus(handleTimerStatus);
    window.electronAPI.onAutoSyncTimerProgress(handleSyncProgress);
    window.electronAPI.onAutoSyncTimerResult(handleSyncResult);
    window.electronAPI.onNetworkStatusChange(handleNetworkStatus);
    window.electronAPI.onNetworkStatusSyncControl(handleSyncControl);

    // Legacy event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function to remove all listeners and prevent memory leaks
    return () => {
      // Remove IPC event listeners
      window.electronAPI.offAutoSyncTimerStatus();
      window.electronAPI.offAutoSyncTimerProgress();
      window.electronAPI.offAutoSyncTimerResult();
      window.electronAPI.offNetworkStatusChange();
      window.electronAPI.offNetworkStatusSyncControl();
      
      // Remove legacy window listeners
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadConfigs, showNotification, updateTimerStatus, pauseReason]);

  // Legacy online/offline handlers
  const handleOnline = useCallback(() => {
    setIsOnline(true);
    showNotification('info', 'Koneksi dipulihkan, memulai sinkronisasi...');
    
    if (window.electronAPI) {
      configs.forEach(config => {
        if (config.enabled) {
          window.electronAPI.triggerAutoSync(config.module);
        }
      });
    }
  }, [configs, showNotification]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    showNotification('warning', 'Koneksi terputus, perubahan akan diqueue');
  }, [showNotification]);

  return (
    <SyncContext.Provider
      value={{
        configs,
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
        isSyncing,
        notifications,
        unreadCount,
        lastNotification,
        loadConfigs,
        saveConfig,
        deleteConfig,
        checkConnections,
        performSync,
        triggerManualSync,
        clearQueue,
        dismissNotification,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotificationHistory,
        pauseAutoSync,
        resumeAutoSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

export { MODULES };
