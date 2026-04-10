"use strict";
/**
 * Auto-Sync Timer Service for SoftwareSawit
 *
 * Implements the 5-minute auto-sync timer with the following features:
 * - Timer triggers sync every 5 minutes when app is active
 * - Timer pauses when sync is already in progress (no overlap)
 * - Timer resets after manual sync
 * - Timer is configurable (interval can be changed)
 * - Timer persists across app sessions
 *
 * This service is designed to work with the batch sync service and sync queue.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAutoSyncTimer = initAutoSyncTimer;
exports.setMainWindow = setMainWindow;
exports.startTimer = startTimer;
exports.stopTimer = stopTimer;
exports.pauseTimer = pauseTimer;
exports.resumeTimer = resumeTimer;
exports.resetTimer = resetTimer;
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.getState = getState;
exports.getStatus = getStatus;
exports.triggerManualSync = triggerManualSync;
exports.destroy = destroy;
const electron_log_1 = __importDefault(require("electron-log"));
const syncQueueService = __importStar(require("./syncQueueService"));
const batchSyncService = __importStar(require("./batchSyncService"));
const syncDb = __importStar(require("./syncDatabase"));
// ============ Default Configuration ============
const DEFAULT_CONFIG = {
    intervalMs: 5 * 60 * 1000, // 5 minutes
    enabled: true,
    modules: [], // Empty means all modules
    minIntervalMs: 30 * 1000, // 30 seconds minimum between syncs
};
// ============ Timer State ============
let timerState = {
    isRunning: false,
    isSyncing: false,
    lastSyncAt: null,
    nextSyncAt: null,
    config: { ...DEFAULT_CONFIG },
    tickCount: 0,
};
let timerInterval = null;
let syncStartTime = null;
let mainWindow = null;
// ============ Initialization ============
/**
 * Initialize the auto-sync timer service
 * @param window - The main BrowserWindow for sending progress updates
 */
function initAutoSyncTimer(window) {
    electron_log_1.default.info('[AutoSyncTimer] Initializing auto-sync timer service...');
    mainWindow = window || null;
    // Load persisted state
    loadTimerState();
    // If timer is enabled, start it
    if (timerState.config.enabled && timerState.isRunning === false) {
        startTimer();
    }
    electron_log_1.default.info('[AutoSyncTimer] Auto-sync timer initialized', {
        enabled: timerState.config.enabled,
        intervalMs: timerState.config.intervalMs,
        lastSyncAt: timerState.lastSyncAt,
    });
}
/**
 * Load timer state from persistent storage
 */
function loadTimerState() {
    try {
        // Try to load from sync database config
        const storedState = syncDb.getSyncConfigByModule('_autoSyncTimer');
        if (storedState && storedState.lastSyncAt) {
            // Parse stored config
            const storedConfig = storedState.lastSyncAt ? JSON.parse(storedState.lastSyncAt) : null;
            if (storedConfig && typeof storedConfig === 'object') {
                timerState.config = { ...DEFAULT_CONFIG, ...storedConfig };
                electron_log_1.default.info('[AutoSyncTimer] Loaded persisted timer state');
            }
        }
    }
    catch (error) {
        electron_log_1.default.warn('[AutoSyncTimer] Failed to load persisted timer state:', error);
    }
}
/**
 * Save timer state to persistent storage
 */
function saveTimerState() {
    try {
        // We store the config in the sync_config table with a special module name
        // This is a simple persistence mechanism
        syncDb.saveSyncConfig({
            module: '_autoSyncTimer',
            remotePath: JSON.stringify(timerState.config),
            enabled: timerState.config.enabled,
        });
        electron_log_1.default.debug('[AutoSyncTimer] Timer state persisted');
    }
    catch (error) {
        electron_log_1.default.warn('[AutoSyncTimer] Failed to persist timer state:', error);
    }
}
/**
 * Set the main window reference for IPC communication
 */
function setMainWindow(window) {
    mainWindow = window;
}
// ============ Timer Control ============
/**
 * Start the auto-sync timer
 */
function startTimer() {
    if (timerInterval) {
        electron_log_1.default.info('[AutoSyncTimer] Timer already running');
        return;
    }
    if (!timerState.config.enabled) {
        electron_log_1.default.info('[AutoSyncTimer] Timer is disabled');
        return;
    }
    electron_log_1.default.info(`[AutoSyncTimer] Starting timer with interval: ${timerState.config.intervalMs}ms`);
    timerState.isRunning = true;
    updateNextSyncTime();
    // Start the interval timer
    timerInterval = setInterval(() => {
        timerTick();
    }, timerState.config.intervalMs);
    // Log startup
    electron_log_1.default.info('[AutoSyncTimer] Timer started', {
        intervalMs: timerState.config.intervalMs,
        nextSyncAt: timerState.nextSyncAt,
    });
    // Notify renderer
    sendTimerStatusToRenderer();
}
/**
 * Stop the auto-sync timer
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerState.isRunning = false;
    timerState.nextSyncAt = null;
    electron_log_1.default.info('[AutoSyncTimer] Timer stopped');
    // Notify renderer
    sendTimerStatusToRenderer();
}
/**
 * Pause the auto-sync timer (e.g., when going offline)
 */
function pauseTimer() {
    if (!timerState.isRunning) {
        return;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    electron_log_1.default.info('[AutoSyncTimer] Timer paused');
    // Notify renderer
    sendTimerStatusToRenderer();
}
/**
 * Resume the auto-sync timer (e.g., when coming back online)
 */
function resumeTimer() {
    if (timerState.isRunning && !timerInterval && timerState.config.enabled) {
        electron_log_1.default.info('[AutoSyncTimer] Resuming timer');
        timerInterval = setInterval(() => {
            timerTick();
        }, timerState.config.intervalMs);
        updateNextSyncTime();
        sendTimerStatusToRenderer();
    }
}
/**
 * Reset the timer (after manual sync or other sync operations)
 * This resets the tick count and updates the next sync time
 */
function resetTimer() {
    timerState.tickCount = 0;
    updateNextSyncTime();
    electron_log_1.default.info('[AutoSyncTimer] Timer reset', {
        lastSyncAt: timerState.lastSyncAt,
        nextSyncAt: timerState.nextSyncAt,
    });
    sendTimerStatusToRenderer();
}
// ============ Timer Tick ============
/**
 * Called on each timer tick
 */
async function timerTick() {
    timerState.tickCount++;
    electron_log_1.default.debug(`[AutoSyncTimer] Timer tick #${timerState.tickCount}`, {
        isSyncing: timerState.isSyncing,
        lastSyncAt: timerState.lastSyncAt,
    });
    // Check if sync is already in progress (prevent overlap)
    if (timerState.isSyncing) {
        electron_log_1.default.info('[AutoSyncTimer] Sync already in progress, skipping this tick');
        return;
    }
    // Check if minimum interval has passed since last sync
    if (timerState.lastSyncAt) {
        const timeSinceLastSync = Date.now() - new Date(timerState.lastSyncAt).getTime();
        if (timeSinceLastSync < timerState.config.minIntervalMs) {
            electron_log_1.default.info(`[AutoSyncTimer] Minimum interval not reached (${timeSinceLastSync}ms < ${timerState.config.minIntervalMs}ms), skipping`);
            return;
        }
    }
    // Check if there are pending items to sync
    const stats = syncQueueService.getQueueStats();
    if (stats.pending === 0 && stats.failed === 0) {
        electron_log_1.default.debug('[AutoSyncTimer] No pending items to sync');
        updateNextSyncTime();
        return;
    }
    // Trigger sync
    await triggerAutoSync();
}
/**
 * Trigger an automatic sync
 */
async function triggerAutoSync() {
    if (timerState.isSyncing) {
        electron_log_1.default.warn('[AutoSyncTimer] Cannot trigger sync - already syncing');
        return;
    }
    electron_log_1.default.info('[AutoSyncTimer] Triggering automatic sync...');
    timerState.isSyncing = true;
    syncStartTime = Date.now();
    // Notify renderer that sync is starting
    sendTimerStatusToRenderer();
    try {
        // Get sync configuration from sync database
        const apiBaseUrl = getApiBaseUrl();
        const authToken = getAuthToken();
        if (!apiBaseUrl || !authToken) {
            electron_log_1.default.warn('[AutoSyncTimer] No API configuration found, skipping sync');
            timerState.isSyncing = false;
            sendTimerStatusToRenderer();
            return;
        }
        // Create API client
        const apiClient = batchSyncService.createApiClient(apiBaseUrl, authToken);
        // Set up progress callback
        batchSyncService.setProgressCallback((progress) => {
            sendSyncProgressToRenderer(progress);
        });
        // Perform batch sync
        const result = await batchSyncService.processBatchSync(apiClient, {
            module: timerState.config.modules.length > 0 ? timerState.config.modules[0] : undefined,
        });
        // Update state
        timerState.lastSyncAt = new Date().toISOString();
        timerState.tickCount = 0;
        updateNextSyncTime();
        const duration = Date.now() - (syncStartTime || Date.now());
        electron_log_1.default.info(`[AutoSyncTimer] Auto-sync completed in ${duration}ms`, {
            success: result.success,
            totalProcessed: result.totalProcessed,
            succeeded: result.succeeded,
            failed: result.failed,
        });
        // Notify renderer of completion
        sendSyncResultToRenderer(result);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error('[AutoSyncTimer] Auto-sync failed:', errorMessage);
    }
    finally {
        timerState.isSyncing = false;
        syncStartTime = null;
        sendTimerStatusToRenderer();
    }
}
// ============ Configuration ============
/**
 * Update the timer configuration
 */
function setConfig(newConfig) {
    const oldInterval = timerState.config.intervalMs;
    timerState.config = { ...timerState.config, ...newConfig };
    electron_log_1.default.info('[AutoSyncTimer] Configuration updated', {
        oldInterval,
        newInterval: timerState.config.intervalMs,
        enabled: timerState.config.enabled,
    });
    // If timer is running and interval changed, restart timer
    if (timerState.isRunning && oldInterval !== timerState.config.intervalMs && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timerTick();
        }, timerState.config.intervalMs);
    }
    // Persist state
    saveTimerState();
    // Notify renderer
    sendTimerStatusToRenderer();
}
/**
 * Get current timer configuration
 */
function getConfig() {
    return { ...timerState.config };
}
/**
 * Get current timer state
 */
function getState() {
    return { ...timerState };
}
/**
 * Get timer status for UI display
 */
function getStatus() {
    return {
        isRunning: timerState.isRunning,
        isSyncing: timerState.isSyncing,
        isPaused: timerState.isRunning && timerInterval === null,
        lastSyncAt: timerState.lastSyncAt,
        nextSyncAt: timerState.nextSyncAt,
        intervalMs: timerState.config.intervalMs,
        enabled: timerState.config.enabled,
        tickCount: timerState.tickCount,
    };
}
// ============ Manual Sync Trigger ============
/**
 * Trigger a manual sync (resets the timer)
 * This is called when user clicks the manual sync button
 */
async function triggerManualSync() {
    electron_log_1.default.info('[AutoSyncTimer] Manual sync triggered');
    // If already syncing, return
    if (timerState.isSyncing) {
        return { success: false, message: 'Sync already in progress' };
    }
    // Reset the timer (resets tick count and next sync time)
    resetTimer();
    // Trigger sync immediately
    timerState.isSyncing = true;
    syncStartTime = Date.now();
    sendTimerStatusToRenderer();
    try {
        const apiBaseUrl = getApiBaseUrl();
        const authToken = getAuthToken();
        if (!apiBaseUrl || !authToken) {
            timerState.isSyncing = false;
            sendTimerStatusToRenderer();
            return { success: false, message: 'No API configuration found' };
        }
        const apiClient = batchSyncService.createApiClient(apiBaseUrl, authToken);
        batchSyncService.setProgressCallback((progress) => {
            sendSyncProgressToRenderer(progress);
        });
        const result = await batchSyncService.processBatchSync(apiClient, {
            module: timerState.config.modules.length > 0 ? timerState.config.modules[0] : undefined,
        });
        timerState.lastSyncAt = new Date().toISOString();
        timerState.tickCount = 0;
        updateNextSyncTime();
        const duration = Date.now() - (syncStartTime || Date.now());
        electron_log_1.default.info(`[AutoSyncTimer] Manual sync completed in ${duration}ms`, {
            success: result.success,
            totalProcessed: result.totalProcessed,
        });
        sendSyncResultToRenderer(result);
        return {
            success: result.success,
            message: result.success
                ? `Sync completed: ${result.succeeded} succeeded, ${result.failed} failed`
                : `Sync failed: ${result.errors.join(', ')}`,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error('[AutoSyncTimer] Manual sync failed:', errorMessage);
        return { success: false, message: errorMessage };
    }
    finally {
        timerState.isSyncing = false;
        syncStartTime = null;
        sendTimerStatusToRenderer();
    }
}
// ============ Helper Functions ============
/**
 * Update the next scheduled sync time
 */
function updateNextSyncTime() {
    if (timerState.isRunning && timerState.config.enabled) {
        const nextTime = new Date(Date.now() + timerState.config.intervalMs);
        timerState.nextSyncAt = nextTime.toISOString();
    }
    else {
        timerState.nextSyncAt = null;
    }
}
/**
 * Get API base URL from configuration
 */
function getApiBaseUrl() {
    try {
        // Try to get from sync config for any module
        const configs = syncDb.getAllSyncConfigs();
        if (configs.length > 0 && configs[0].remotePath) {
            // remotePath is used to store the API URL in our setup
            // This is a simplification - in production, you'd have a separate config
            return configs[0].remotePath;
        }
    }
    catch (error) {
        electron_log_1.default.warn('[AutoSyncTimer] Failed to get API base URL:', error);
    }
    return null;
}
/**
 * Get auth token from configuration
 */
function getAuthToken() {
    // In a real implementation, this would come from secure storage
    // For now, we'll use a placeholder
    // The actual token would be stored during login
    try {
        // Try to get from user session or secure storage
        // This is implementation-dependent
        return process.env.SYNC_AUTH_TOKEN || null;
    }
    catch (error) {
        electron_log_1.default.warn('[AutoSyncTimer] Failed to get auth token:', error);
    }
    return null;
}
// ============ IPC Communication ============
/**
 * Send timer status to renderer process
 */
function sendTimerStatusToRenderer() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autoSyncTimer:status', getStatus());
    }
}
/**
 * Send sync progress to renderer process
 */
function sendSyncProgressToRenderer(progress) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autoSyncTimer:syncProgress', progress);
    }
}
/**
 * Send sync result to renderer process
 */
function sendSyncResultToRenderer(result) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autoSyncTimer:syncResult', result);
    }
}
// ============ Cleanup ============
/**
 * Stop the timer and clean up
 */
function destroy() {
    electron_log_1.default.info('[AutoSyncTimer] Destroying timer service');
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerState.isRunning = false;
    timerState.isSyncing = false;
    mainWindow = null;
    electron_log_1.default.info('[AutoSyncTimer] Timer service destroyed');
}
// ============ Export ============
exports.default = {
    initAutoSyncTimer,
    setMainWindow,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    triggerManualSync,
    setConfig,
    getConfig,
    getState,
    getStatus,
    destroy,
};
