"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initNetworkStatus = initNetworkStatus;
exports.setMainWindow = setMainWindow;
exports.setConfig = setConfig;
exports.setCallbacks = setCallbacks;
exports.performConnectivityCheck = performConnectivityCheck;
exports.checkForCaptivePortal = checkForCaptivePortal;
exports.getStatus = getStatus;
exports.getConnectionQuality = getConnectionQuality;
exports.isOnline = isOnline;
exports.isOffline = isOffline;
exports.checkNow = checkNow;
exports.getConnectionHistory = getConnectionHistory;
exports.getConnectionStability = getConnectionStability;
exports.destroy = destroy;
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
// ============ Default Configuration ============
const DEFAULT_CONFIG = {
    checkUrl: 'https://www.google.com/generate_204',
    checkTimeoutMs: 5000,
    maxConsecutiveFailures: 3,
    checkIntervalMs: 30000, // 30 seconds
    detectCaptivePortal: true,
    captivePortalCheckUrl: 'http://connectivitycheck.gstatic.com/generate_204',
};
// ============ Singleton State ============
let networkStatus = {
    status: 'checking',
    isInternetAccessible: false,
    connectionQuality: 'unknown',
    lastCheckedAt: new Date().toISOString(),
    lastStatusChangeAt: null,
    previousStatus: null,
    consecutiveFailures: 0,
    checkUrl: DEFAULT_CONFIG.checkUrl,
};
let config = { ...DEFAULT_CONFIG };
let callbacks = {};
let mainWindow = null;
let checkInterval = null;
let isInitialized = false;
// For tracking connection stability
let connectionHistory = [];
const HISTORY_SIZE = 5; // Track last 5 checks
// ============ Initialization ============
/**
 * Initialize the network status detection service
 * @param window - The main BrowserWindow for sending status updates
 * @param userConfig - Optional configuration overrides
 * @param userCallbacks - Optional callbacks for status changes
 */
function initNetworkStatus(window, userConfig, userCallbacks) {
    if (isInitialized) {
        electron_log_1.default.warn('[NetworkStatus] Already initialized');
        return;
    }
    electron_log_1.default.info('[NetworkStatus] Initializing network status detection service...');
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
    electron_log_1.default.info('[NetworkStatus] Network status detection initialized', {
        checkUrl: config.checkUrl,
        checkTimeoutMs: config.checkTimeoutMs,
        detectCaptivePortal: config.detectCaptivePortal,
    });
}
/**
 * Set the main window reference for IPC communication
 */
function setMainWindow(window) {
    mainWindow = window;
    electron_log_1.default.debug('[NetworkStatus] Main window reference updated');
}
/**
 * Update configuration
 */
function setConfig(newConfig) {
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
    electron_log_1.default.info('[NetworkStatus] Configuration updated', config);
}
/**
 * Update callbacks
 */
function setCallbacks(newCallbacks) {
    callbacks = { ...callbacks, ...newCallbacks };
}
// ============ Electron Event Handling ============
/**
 * Set up Electron's online/offline event listeners
 */
function setupElectronEvents() {
    // Electron's app module emits 'activate' and 'will-quit' events
    // but the actual online/offline detection uses the process object events
    // Note: In Electron, the 'online' and 'offline' events are emitted on the process object
    // However, these only reflect the browser's connectivity state, not actual internet access
    // We listen to these as a first-level indicator and then verify with active checks
    // When Electron thinks we're back online
    electron_1.app.on('activate', () => {
        electron_log_1.default.info('[NetworkStatus] App activated - checking connectivity');
        performConnectivityCheck();
    });
    // The actual online/offline detection in Electron works through the renderer process
    // We handle this through the webContents and the autoSyncTimer integration
    electron_log_1.default.debug('[NetworkStatus] Electron event handlers registered');
}
// ============ Connectivity Checking ============
/**
 * Perform an active connectivity check
 * This verifies actual internet access beyond just being on a network
 */
async function performConnectivityCheck() {
    electron_log_1.default.debug('[NetworkStatus] Performing connectivity check...');
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
                electron_log_1.default.info('[NetworkStatus] Connectivity check passed', {
                    latency,
                    connectionQuality: networkStatus.connectionQuality,
                });
                return true;
            }
            else {
                // Response was not OK, treat as no internet
                handleConnectivityFailure();
                return false;
            }
        }
        catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                electron_log_1.default.warn('[NetworkStatus] Connectivity check timed out');
            }
            else {
                electron_log_1.default.warn('[NetworkStatus] Connectivity check failed', fetchError);
            }
            handleConnectivityFailure();
            return false;
        }
    }
    catch (error) {
        electron_log_1.default.error('[NetworkStatus] Unexpected error in connectivity check', error);
        handleConnectivityFailure();
        return false;
    }
    finally {
        networkStatus.lastCheckedAt = new Date().toISOString();
        // Notify UI of status update
        sendStatusToRenderer();
    }
}
/**
 * Handle connectivity check failure
 */
function handleConnectivityFailure() {
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
    }
    else {
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
    electron_log_1.default.warn('[NetworkStatus] Connectivity failure', {
        consecutiveFailures: networkStatus.consecutiveFailures,
        maxFailures: config.maxConsecutiveFailures,
        currentStatus: networkStatus.status,
    });
}
/**
 * Calculate connection quality based on latency
 */
function calculateConnectionQuality(latencyMs) {
    if (latencyMs < 100)
        return 'good';
    if (latencyMs < 300)
        return 'fair';
    if (latencyMs < 1000)
        return 'poor';
    return 'unknown';
}
// ============ Status Management ============
/**
 * Update network status and trigger notifications
 */
function updateStatus(newStatus) {
    if (networkStatus.status === newStatus) {
        return;
    }
    const oldStatus = networkStatus.status;
    networkStatus.previousStatus = oldStatus;
    networkStatus.status = newStatus;
    networkStatus.lastStatusChangeAt = new Date().toISOString();
    electron_log_1.default.info(`[NetworkStatus] Network status changed: ${oldStatus} -> ${newStatus}`);
    // Notify callbacks
    notifyStatusChange(networkStatus, oldStatus);
    // Trigger auto-sync timer integration
    handleStatusChangeForSync(newStatus);
}
/**
 * Notify all registered callbacks of status change
 */
function notifyStatusChange(status, oldStatus) {
    // Call registered callbacks
    if (callbacks.onStatusChange) {
        try {
            callbacks.onStatusChange(status, oldStatus);
        }
        catch (error) {
            electron_log_1.default.error('[NetworkStatus] Error in status change callback', error);
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
function handleStatusChangeForSync(newStatus) {
    // Import autoSyncTimer dynamically to avoid circular dependency
    // The actual pause/resume is handled in the autoSyncTimer module
    if (newStatus === 'offline') {
        electron_log_1.default.info('[NetworkStatus] Network offline - sync will be paused');
        // Notify that sync should pause
        sendSyncControlToRenderer('pause');
    }
    else if (newStatus === 'online' && networkStatus.isInternetAccessible) {
        electron_log_1.default.info('[NetworkStatus] Network online - sync can resume');
        // Notify that sync can resume
        sendSyncControlToRenderer('resume');
    }
}
// ============ Periodic Checks ============
/**
 * Start periodic connectivity checks
 */
function startPeriodicChecks() {
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
        }
        else {
            // If offline, periodically check if we're back
            await performConnectivityCheck();
        }
    }, config.checkIntervalMs);
    electron_log_1.default.debug('[NetworkStatus] Periodic connectivity checks started', {
        intervalMs: config.checkIntervalMs,
    });
}
/**
 * Stop periodic connectivity checks
 */
function stopPeriodicChecks() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        electron_log_1.default.debug('[NetworkStatus] Periodic connectivity checks stopped');
    }
}
// ============ Captive Portal Detection ============
/**
 * Check if connected to a captive portal
 * Captive portals show a login page instead of actual internet
 */
async function checkForCaptivePortal() {
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
                electron_log_1.default.warn('[NetworkStatus] Possible captive portal detected');
                return true;
            }
        }
        return false;
    }
    catch (error) {
        // Any error could indicate a captive portal
        electron_log_1.default.warn('[NetworkStatus] Captive portal check failed', error);
        return true; // Assume captive portal on error
    }
}
// ============ IPC Communication ============
/**
 * Send network status to renderer process
 */
function sendStatusToRenderer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('networkStatus:changed', getStatus());
    }
}
/**
 * Send sync control command to renderer
 */
function sendSyncControlToRenderer(command) {
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
function getStatus() {
    return { ...networkStatus };
}
/**
 * Get connection quality
 */
function getConnectionQuality() {
    return networkStatus.connectionQuality;
}
/**
 * Check if network is currently online
 */
function isOnline() {
    return networkStatus.status === 'online' && networkStatus.isInternetAccessible;
}
/**
 * Check if network is currently offline
 */
function isOffline() {
    return networkStatus.status === 'offline' || !networkStatus.isInternetAccessible;
}
/**
 * Force a connectivity check
 */
async function checkNow() {
    await performConnectivityCheck();
    return getStatus();
}
/**
 * Get connection history for stability assessment
 */
function getConnectionHistory() {
    return [...connectionHistory];
}
/**
 * Assess connection stability based on history
 */
function getConnectionStability() {
    if (connectionHistory.length < 3) {
        return 'unknown';
    }
    const successCount = connectionHistory.filter(Boolean).length;
    const successRate = successCount / connectionHistory.length;
    if (successRate >= 0.8)
        return 'stable';
    if (successRate >= 0.5)
        return 'unstable';
    return 'unstable';
}
// ============ Cleanup ============
/**
 * Stop the network status service and clean up
 */
function destroy() {
    electron_log_1.default.info('[NetworkStatus] Destroying network status service');
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
    electron_log_1.default.info('[NetworkStatus] Network status service destroyed');
}
// ============ Export ============
exports.default = {
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
