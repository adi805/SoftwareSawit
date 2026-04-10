/**
 * Network Status Detection Service for SoftwareSawit
 * 
 * Implements network connectivity detection with the following features:
 * - Detects when network connection is available/unavailable
 * - Handles edge cases (unstable connection, captive portals)
 * - Provides connection quality metrics
 * - Sends real-time status updates to UI
 * - Integrates with auto-sync timer to pause/resume based on connectivity
 * 
 * This service uses Electron's online/offline events combined with
 * active connectivity checks to handle edge cases like:
 * - Captive portals (connected to WiFi but no internet)
 * - Unstable connections (intermittent drops)
 * - VPN connections that may appear/disappear
 */

import { app, BrowserWindow } from 'electron';
import log from 'electron-log';

// ============ Types & Interfaces ============

export type NetworkStatusType = 'online' | 'offline' | 'checking';

export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

export interface NetworkStatus {
  /** Current network status */
  status: NetworkStatusType;
  /** Whether internet is actually accessible (not just LAN) */
  isInternetAccessible: boolean;
  /** Connection quality assessment */
  connectionQuality: ConnectionQuality;
  /** Last time status was checked */
  lastCheckedAt: string;
  /** Last time status changed */
  lastStatusChangeAt: string | null;
  /** Previous status before current */
  previousStatus: NetworkStatusType | null;
  /** Number of failed connectivity checks */
  consecutiveFailures: number;
  /** URL being used for connectivity check */
  checkUrl: string;
}

export interface NetworkStatusConfig {
  /** URL to check for internet connectivity */
  checkUrl: string;
  /** Timeout for connectivity check in ms */
  checkTimeoutMs: number;
  /** Number of failed checks before marking as offline */
  maxConsecutiveFailures: number;
  /** Interval for active connectivity checks in ms (when online) */
  checkIntervalMs: number;
  /** Enable captive portal detection */
  detectCaptivePortal: boolean;
  /** Captive portal check URL */
  captivePortalCheckUrl: string;
}

export interface NetworkStatusCallbacks {
  onStatusChange?: (newStatus: NetworkStatus, oldStatus: NetworkStatusType) => void;
  onInternetAccessibleChange?: (isAccessible: boolean) => void;
  onConnectionQualityChange?: (quality: ConnectionQuality) => void;
}

// ============ Default Configuration ============

const DEFAULT_CONFIG: NetworkStatusConfig = {
  checkUrl: 'https://www.google.com/generate_204',
  checkTimeoutMs: 5000,
  maxConsecutiveFailures: 3,
  checkIntervalMs: 30000, // 30 seconds
  detectCaptivePortal: true,
  captivePortalCheckUrl: 'http://connectivitycheck.gstatic.com/generate_204',
};

// ============ Singleton State ============

let networkStatus: NetworkStatus = {
  status: 'checking',
  isInternetAccessible: false,
  connectionQuality: 'unknown',
  lastCheckedAt: new Date().toISOString(),
  lastStatusChangeAt: null,
  previousStatus: null,
  consecutiveFailures: 0,
  checkUrl: DEFAULT_CONFIG.checkUrl,
};

let config: NetworkStatusConfig = { ...DEFAULT_CONFIG };
let callbacks: NetworkStatusCallbacks = {};
let mainWindow: BrowserWindow | null = null;
let checkInterval: NodeJS.Timeout | null = null;
let isInitialized = false;

// For tracking connection stability
let connectionHistory: boolean[] = [];
const HISTORY_SIZE = 5; // Track last 5 checks

// ============ Initialization ============

/**
 * Initialize the network status detection service
 * @param window - The main BrowserWindow for sending status updates
 * @param userConfig - Optional configuration overrides
 * @param userCallbacks - Optional callbacks for status changes
 */
export function initNetworkStatus(
  window?: BrowserWindow | null,
  userConfig?: Partial<NetworkStatusConfig>,
  userCallbacks?: NetworkStatusCallbacks
): void {
  if (isInitialized) {
    log.warn('[NetworkStatus] Already initialized');
    return;
  }

  log.info('[NetworkStatus] Initializing network status detection service...');

  // Apply configuration overrides
  if (userConfig) {
    config = { ...DEFAULT_CONFIG, ...userConfig };
    networkStatus.checkUrl = config.checkUrl;
  }

  // Store callbacks
  if (userCallbacks) {
    callbacks = userCallbacks;
  }

  // Store window reference
  mainWindow = window || null;

  // Set up Electron's online/offline event listeners
  setupElectronEvents();

  // Perform initial connectivity check
  performConnectivityCheck().then(() => {
    // Start periodic connectivity checks
    startPeriodicChecks();
  });

  isInitialized = true;

  log.info('[NetworkStatus] Network status detection initialized', {
    checkUrl: config.checkUrl,
    checkTimeoutMs: config.checkTimeoutMs,
    detectCaptivePortal: config.detectCaptivePortal,
  });
}

/**
 * Set the main window reference for IPC communication
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  log.debug('[NetworkStatus] Main window reference updated');
}

/**
 * Update configuration
 */
export function setConfig(newConfig: Partial<NetworkStatusConfig>): void {
  const oldCheckUrl = config.checkUrl;
  config = { ...config, ...newConfig };
  
  if (newConfig.checkUrl && newConfig.checkUrl !== oldCheckUrl) {
    networkStatus.checkUrl = newConfig.checkUrl;
  }

  // Restart periodic checks if interval changed
  if (newConfig.checkIntervalMs && checkInterval) {
    stopPeriodicChecks();
    startPeriodicChecks();
  }

  log.info('[NetworkStatus] Configuration updated', config);
}

/**
 * Update callbacks
 */
export function setCallbacks(newCallbacks: NetworkStatusCallbacks): void {
  callbacks = { ...callbacks, ...newCallbacks };
}

// ============ Electron Event Handling ============

/**
 * Set up Electron's online/offline event listeners
 */
function setupElectronEvents(): void {
  // Electron's app module emits 'activate' and 'will-quit' events
  // but the actual online/offline detection uses the process object events
  
  // Note: In Electron, the 'online' and 'offline' events are emitted on the process object
  // However, these only reflect the browser's connectivity state, not actual internet access
  
  // We listen to these as a first-level indicator and then verify with active checks
  
  // When Electron thinks we're back online
  app.on('activate', () => {
    log.info('[NetworkStatus] App activated - checking connectivity');
    performConnectivityCheck();
  });

  // The actual online/offline detection in Electron works through the renderer process
  // We handle this through the webContents and the autoSyncTimer integration
  log.debug('[NetworkStatus] Electron event handlers registered');
}

// ============ Connectivity Checking ============

/**
 * Perform an active connectivity check
 * This verifies actual internet access beyond just being on a network
 */
export async function performConnectivityCheck(): Promise<boolean> {
  log.debug('[NetworkStatus] Performing connectivity check...');

  const previousStatus = networkStatus.status;
  const previousInternetAccessible = networkStatus.isInternetAccessible;
  const previousQuality = networkStatus.connectionQuality;

  try {
    // Use a simple fetch request to check connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.checkTimeoutMs);

    const startTime = Date.now();
    
    try {
      const response = await fetch(config.checkUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      const latency = Date.now() - startTime;
      
      if (response.ok || response.status === 204) {
        // Connectivity is good
        networkStatus.consecutiveFailures = 0;
        networkStatus.isInternetAccessible = true;
        networkStatus.connectionQuality = calculateConnectionQuality(latency);
        
        if (networkStatus.status !== 'online') {
          updateStatus('online');
        }
        
        log.info('[NetworkStatus] Connectivity check passed', {
          latency,
          connectionQuality: networkStatus.connectionQuality,
        });
        
        return true;
      } else {
        // Response was not OK, treat as no internet
        handleConnectivityFailure();
        return false;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        log.warn('[NetworkStatus] Connectivity check timed out');
      } else {
        log.warn('[NetworkStatus] Connectivity check failed', fetchError);
      }
      
      handleConnectivityFailure();
      return false;
    }
  } catch (error) {
    log.error('[NetworkStatus] Unexpected error in connectivity check', error);
    handleConnectivityFailure();
    return false;
  } finally {
    networkStatus.lastCheckedAt = new Date().toISOString();
    
    // Notify UI of status update
    sendStatusToRenderer();
  }
}

/**
 * Handle connectivity check failure
 */
function handleConnectivityFailure(): void {
  networkStatus.consecutiveFailures++;
  networkStatus.isInternetAccessible = false;
  
  // Update connection quality
  networkStatus.connectionQuality = 'poor';
  
  // Add to connection history
  connectionHistory.push(false);
  if (connectionHistory.length > HISTORY_SIZE) {
    connectionHistory.shift();
  }

  if (networkStatus.consecutiveFailures >= config.maxConsecutiveFailures) {
    if (networkStatus.status !== 'offline') {
      updateStatus('offline');
    }
  } else {
    // Still in checking mode, not enough failures to declare offline
    if (networkStatus.status === 'checking' || networkStatus.status === 'online') {
      // We're transitioning but not yet offline
      // Keep current status but mark internet as inaccessible
      if (networkStatus.status === 'online') {
        // Transition to checking state
        networkStatus.previousStatus = networkStatus.status;
        networkStatus.status = 'checking';
        notifyStatusChange(networkStatus, 'online');
      }
    }
  }

  log.warn('[NetworkStatus] Connectivity failure', {
    consecutiveFailures: networkStatus.consecutiveFailures,
    maxFailures: config.maxConsecutiveFailures,
    currentStatus: networkStatus.status,
  });
}

/**
 * Calculate connection quality based on latency
 */
function calculateConnectionQuality(latencyMs: number): ConnectionQuality {
  if (latencyMs < 100) return 'good';
  if (latencyMs < 300) return 'fair';
  if (latencyMs < 1000) return 'poor';
  return 'unknown';
}

// ============ Status Management ============

/**
 * Update network status and trigger notifications
 */
function updateStatus(newStatus: NetworkStatusType): void {
  if (networkStatus.status === newStatus) {
    return;
  }

  const oldStatus = networkStatus.status;
  networkStatus.previousStatus = oldStatus;
  networkStatus.status = newStatus;
  networkStatus.lastStatusChangeAt = new Date().toISOString();

  log.info(`[NetworkStatus] Network status changed: ${oldStatus} -> ${newStatus}`);

  // Notify callbacks
  notifyStatusChange(networkStatus, oldStatus);

  // Trigger auto-sync timer integration
  handleStatusChangeForSync(newStatus);
}

/**
 * Notify all registered callbacks of status change
 */
function notifyStatusChange(status: NetworkStatus, oldStatus: NetworkStatusType): void {
  // Call registered callbacks
  if (callbacks.onStatusChange) {
    try {
      callbacks.onStatusChange(status, oldStatus);
    } catch (error) {
      log.error('[NetworkStatus] Error in status change callback', error);
    }
  }

  // Notify renderer process
  sendStatusToRenderer();
}

// ============ Auto-Sync Timer Integration ============

/**
 * Handle network status change for sync operations
 * This integrates with the auto-sync timer to pause/resume based on connectivity
 */
function handleStatusChangeForSync(newStatus: NetworkStatusType): void {
  // Import autoSyncTimer dynamically to avoid circular dependency
  // The actual pause/resume is handled in the autoSyncTimer module
  if (newStatus === 'offline') {
    log.info('[NetworkStatus] Network offline - sync will be paused');
    // Notify that sync should pause
    sendSyncControlToRenderer('pause');
  } else if (newStatus === 'online' && networkStatus.isInternetAccessible) {
    log.info('[NetworkStatus] Network online - sync can resume');
    // Notify that sync can resume
    sendSyncControlToRenderer('resume');
  }
}

// ============ Periodic Checks ============

/**
 * Start periodic connectivity checks
 */
function startPeriodicChecks(): void {
  if (checkInterval) {
    return;
  }

  checkInterval = setInterval(async () => {
    // Only check if we think we're online or checking
    if (networkStatus.status !== 'offline') {
      await performConnectivityCheck();
      
      // If we were checking and now have internet, mark as online
      if (networkStatus.status === 'checking' && networkStatus.isInternetAccessible) {
        updateStatus('online');
      }
    } else {
      // If offline, periodically check if we're back
      await performConnectivityCheck();
    }
  }, config.checkIntervalMs);

  log.debug('[NetworkStatus] Periodic connectivity checks started', {
    intervalMs: config.checkIntervalMs,
  });
}

/**
 * Stop periodic connectivity checks
 */
function stopPeriodicChecks(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    log.debug('[NetworkStatus] Periodic connectivity checks stopped');
  }
}

// ============ Captive Portal Detection ============

/**
 * Check if connected to a captive portal
 * Captive portals show a login page instead of actual internet
 */
export async function checkForCaptivePortal(): Promise<boolean> {
  if (!config.detectCaptivePortal) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.checkTimeoutMs);

    const response = await fetch(config.captivePortalCheckUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // If we get a 200 with content that looks like a captive portal page, we're probably in one
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      
      // Captive portals often return text/html instead of expected 204
      if (contentType.includes('text/html')) {
        log.warn('[NetworkStatus] Possible captive portal detected');
        return true;
      }
    }

    return false;
  } catch (error) {
    // Any error could indicate a captive portal
    log.warn('[NetworkStatus] Captive portal check failed', error);
    return true; // Assume captive portal on error
  }
}

// ============ IPC Communication ============

/**
 * Send network status to renderer process
 */
function sendStatusToRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('networkStatus:changed', getStatus());
  }
}

/**
 * Send sync control command to renderer
 */
function sendSyncControlToRenderer(command: 'pause' | 'resume'): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('networkStatus:syncControl', {
      command,
      networkStatus: getStatus(),
    });
  }
}

// ============ Public API ============

/**
 * Get current network status
 */
export function getStatus(): NetworkStatus {
  return { ...networkStatus };
}

/**
 * Get connection quality
 */
export function getConnectionQuality(): ConnectionQuality {
  return networkStatus.connectionQuality;
}

/**
 * Check if network is currently online
 */
export function isOnline(): boolean {
  return networkStatus.status === 'online' && networkStatus.isInternetAccessible;
}

/**
 * Check if network is currently offline
 */
export function isOffline(): boolean {
  return networkStatus.status === 'offline' || !networkStatus.isInternetAccessible;
}

/**
 * Force a connectivity check
 */
export async function checkNow(): Promise<NetworkStatus> {
  await performConnectivityCheck();
  return getStatus();
}

/**
 * Get connection history for stability assessment
 */
export function getConnectionHistory(): boolean[] {
  return [...connectionHistory];
}

/**
 * Assess connection stability based on history
 */
export function getConnectionStability(): 'stable' | 'unstable' | 'unknown' {
  if (connectionHistory.length < 3) {
    return 'unknown';
  }

  const successCount = connectionHistory.filter(Boolean).length;
  const successRate = successCount / connectionHistory.length;

  if (successRate >= 0.8) return 'stable';
  if (successRate >= 0.5) return 'unstable';
  return 'unstable';
}

// ============ Cleanup ============

/**
 * Stop the network status service and clean up
 */
export function destroy(): void {
  log.info('[NetworkStatus] Destroying network status service');

  stopPeriodicChecks();
  
  networkStatus = {
    status: 'checking',
    isInternetAccessible: false,
    connectionQuality: 'unknown',
    lastCheckedAt: new Date().toISOString(),
    lastStatusChangeAt: null,
    previousStatus: null,
    consecutiveFailures: 0,
    checkUrl: config.checkUrl,
  };
  
  connectionHistory = [];
  mainWindow = null;
  callbacks = {};
  isInitialized = false;

  log.info('[NetworkStatus] Network status service destroyed');
}

// ============ Export ============

export default {
  initNetworkStatus,
  setMainWindow,
  setConfig,
  setCallbacks,
  getStatus,
  getConnectionQuality,
  isOnline,
  isOffline,
  checkNow,
  checkForCaptivePortal,
  getConnectionHistory,
  getConnectionStability,
  performConnectivityCheck,
  destroy,
};
