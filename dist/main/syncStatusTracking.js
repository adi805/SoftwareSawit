"use strict";
/**
 * Sync Status Tracking Service for SoftwareSawit
 *
 * Implements sync status tracking for transactions:
 * - Tracks sync_status, sync_attempts, last_sync_at, sync_error on transactions
 * - Updates status when sync queue operations complete
 * - Provides IPC handlers for real-time renderer updates
 *
 * This service extends the sync queue to track status at the transaction level,
 * enabling per-transaction sync status display in the UI.
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
exports.setMainWindow = setMainWindow;
exports.addSyncStatusColumns = addSyncStatusColumns;
exports.onTransactionQueued = onTransactionQueued;
exports.onTransactionSynced = onTransactionSynced;
exports.onTransactionSyncFailed = onTransactionSyncFailed;
exports.onTransactionConflict = onTransactionConflict;
exports.getTransactionSyncStatus = getTransactionSyncStatus;
exports.getTransactionsWithSyncStatus = getTransactionsWithSyncStatus;
exports.resetSyncStatusForRetry = resetSyncStatusForRetry;
exports.integrateWithSyncQueue = integrateWithSyncQueue;
exports.handleSyncQueueItemCompleted = handleSyncQueueItemCompleted;
exports.getSyncStatusChannel = getSyncStatusChannel;
exports.getSyncStatusMessage = getSyncStatusMessage;
exports.getSyncStatusDisplay = getSyncStatusDisplay;
const electron_log_1 = __importDefault(require("electron-log"));
const kasDb = __importStar(require("./kasDatabase"));
const bankDb = __importStar(require("./bankDatabase"));
const gudangDb = __importStar(require("./gudangDatabase"));
// IPC event channel for sync status updates
const SYNC_STATUS_CHANNEL = 'sync:transactionStatusChanged';
// Global window reference for IPC broadcasts
let mainWindow = null;
/**
 * Set the main window reference for IPC broadcasts
 */
function setMainWindow(window) {
    mainWindow = window;
}
/**
 * Broadcast sync status change to renderer
 */
function broadcastSyncStatusUpdate(record) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(SYNC_STATUS_CHANNEL, record);
        electron_log_1.default.debug(`[SyncStatus] Broadcast update for ${record.module}/${record.recordId}: ${record.syncStatus}`);
    }
}
// Module database mapping
const moduleDatabases = {
    kas: kasDb,
    bank: bankDb,
    gudang: gudangDb,
};
/**
 * Add sync status columns to transaction table
 * Migration function for existing databases
 */
function addSyncStatusColumns(module) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        // Use the database's addColumn method if available
        if ('addColumn' in dbModule && typeof dbModule.addColumn === 'function') {
            dbModule.addColumn('sync_status', "TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'failed', 'in_progress'))");
            dbModule.addColumn('sync_attempts', 'INTEGER DEFAULT 0');
            dbModule.addColumn('last_sync_at', 'TEXT');
            dbModule.addColumn('sync_error', 'TEXT');
            electron_log_1.default.info(`[SyncStatus] Added sync status columns to ${module} transactions`);
            return { success: true, message: `Added sync status columns to ${module}` };
        }
        // If no addColumn method, just return success - columns may already exist
        return { success: true, message: `Sync status columns for ${module} (already exist or handled by schema)` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to add sync status columns to ${module}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Update transaction sync status when queued for sync
 * Called when a new sync queue item is created
 */
function onTransactionQueued(module, recordId) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        // Update transaction sync status to 'pending'
        if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
            const result = dbModule.updateSyncStatus(recordId, 'pending');
            if (result.success) {
                // Broadcast update to renderer
                broadcastSyncStatusUpdate({
                    id: recordId,
                    module,
                    recordId,
                    syncStatus: 'pending',
                    syncAttempts: result.attempts || 0,
                    lastSyncAt: result.lastSyncAt || null,
                    syncError: null,
                });
            }
            return result;
        }
        electron_log_1.default.warn(`[SyncStatus] updateSyncStatus not available for ${module}`);
        return { success: false, message: `Module ${module} does not support sync status updates` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to update sync status for queued ${module}/${recordId}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Update transaction sync status on sync success
 * Called when a sync queue item is marked as completed
 */
function onTransactionSynced(module, recordId) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
            const result = dbModule.updateSyncStatus(recordId, 'synced');
            if (result.success) {
                broadcastSyncStatusUpdate({
                    id: recordId,
                    module,
                    recordId,
                    syncStatus: 'synced',
                    syncAttempts: result.attempts || 0,
                    lastSyncAt: result.lastSyncAt || new Date().toISOString(),
                    syncError: null,
                });
            }
            return result;
        }
        return { success: false, message: `Module ${module} does not support sync status updates` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to update sync status for synced ${module}/${recordId}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Update transaction sync status on sync failure
 * Called when a sync queue item is marked as failed
 */
function onTransactionSyncFailed(module, recordId, errorMessage) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
            const result = dbModule.updateSyncStatus(recordId, 'failed', errorMessage);
            if (result.success) {
                broadcastSyncStatusUpdate({
                    id: recordId,
                    module,
                    recordId,
                    syncStatus: 'failed',
                    syncAttempts: result.attempts || 0,
                    lastSyncAt: result.lastSyncAt || null,
                    syncError: errorMessage,
                });
            }
            return result;
        }
        return { success: false, message: `Module ${module} does not support sync status updates` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to update sync status for failed ${module}/${recordId}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Update transaction sync status on conflict
 * Called when a sync conflict is detected
 */
function onTransactionConflict(module, recordId) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
            const result = dbModule.updateSyncStatus(recordId, 'conflict');
            if (result.success) {
                broadcastSyncStatusUpdate({
                    id: recordId,
                    module,
                    recordId,
                    syncStatus: 'conflict',
                    syncAttempts: result.attempts || 0,
                    lastSyncAt: result.lastSyncAt || null,
                    syncError: 'Sync conflict detected',
                });
            }
            return result;
        }
        return { success: false, message: `Module ${module} does not support sync status updates` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to update sync status for conflict ${module}/${recordId}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Get sync status for a transaction
 */
function getTransactionSyncStatus(module, recordId) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        electron_log_1.default.warn(`[SyncStatus] Unknown module: ${module}`);
        return null;
    }
    try {
        if ('getSyncStatus' in dbModule && typeof dbModule.getSyncStatus === 'function') {
            return dbModule.getSyncStatus(recordId);
        }
        electron_log_1.default.warn(`[SyncStatus] getSyncStatus not available for ${module}`);
        return null;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to get sync status for ${module}/${recordId}:`, errorMsg);
        return null;
    }
}
/**
 * Get all transactions with their sync status for a module
 */
function getTransactionsWithSyncStatus(module) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        electron_log_1.default.warn(`[SyncStatus] Unknown module: ${module}`);
        return [];
    }
    try {
        if ('getAllWithSyncStatus' in dbModule && typeof dbModule.getAllWithSyncStatus === 'function') {
            return dbModule.getAllWithSyncStatus();
        }
        electron_log_1.default.warn(`[SyncStatus] getAllWithSyncStatus not available for ${module}`);
        return [];
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to get transactions with sync status for ${module}:`, errorMsg);
        return [];
    }
}
/**
 * Reset sync status to pending for retry
 * Called when a failed item is retried
 */
function resetSyncStatusForRetry(module, recordId) {
    const dbModule = moduleDatabases[module];
    if (!dbModule) {
        return { success: false, message: `Unknown module: ${module}` };
    }
    try {
        if ('resetSyncStatus' in dbModule && typeof dbModule.resetSyncStatus === 'function') {
            const result = dbModule.resetSyncStatus(recordId);
            if (result.success) {
                broadcastSyncStatusUpdate({
                    id: recordId,
                    module,
                    recordId,
                    syncStatus: 'pending',
                    syncAttempts: result.attempts || 0,
                    lastSyncAt: result.lastSyncAt || null,
                    syncError: null,
                });
            }
            return result;
        }
        return { success: false, message: `Module ${module} does not support sync status reset` };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[SyncStatus] Failed to reset sync status for ${module}/${recordId}:`, errorMsg);
        return { success: false, message: errorMsg };
    }
}
/**
 * Integrate with sync queue service callbacks
 * This sets up automatic status updates when sync queue events occur
 */
function integrateWithSyncQueue() {
    electron_log_1.default.info('[SyncStatus] Integrating with sync queue service');
    // The integration happens through the batch sync service
    // which calls onTransactionSynced/onTransactionSyncFailed when items complete
    // This is a placeholder for any additional integration logic
}
/**
 * Handle sync queue item completion - updates transaction sync status
 */
function handleSyncQueueItemCompleted(item) {
    switch (item.status) {
        case 'completed':
            onTransactionSynced(item.module, item.recordId);
            break;
        case 'failed':
            onTransactionSyncFailed(item.module, item.recordId, item.lastError || 'Sync failed');
            break;
        case 'conflict':
            onTransactionConflict(item.module, item.recordId);
            break;
    }
}
/**
 * Get IPC channel name for sync status updates
 */
function getSyncStatusChannel() {
    return SYNC_STATUS_CHANNEL;
}
/**
 * Get human-readable sync status message (Indonesian)
 */
function getSyncStatusMessage(status) {
    switch (status) {
        case 'synced':
            return 'Tersinkronkan';
        case 'pending':
            return 'Menunggu sync';
        case 'in_progress':
            return 'Sedang sync';
        case 'failed':
            return 'Gagal sync';
        case 'conflict':
            return 'Konflik terdeteksi';
        default:
            return 'Unknown';
    }
}
/**
 * Get sync status display info for UI
 */
function getSyncStatusDisplay(status) {
    switch (status) {
        case 'synced':
            return { label: 'Synced', color: 'green', icon: 'check-circle' };
        case 'pending':
            return { label: 'Pending', color: 'yellow', icon: 'clock' };
        case 'in_progress':
            return { label: 'Syncing', color: 'blue', icon: 'sync' };
        case 'failed':
            return { label: 'Failed', color: 'red', icon: 'x-circle' };
        case 'conflict':
            return { label: 'Conflict', color: 'orange', icon: 'alert-triangle' };
        default:
            return { label: 'Unknown', color: 'gray', icon: 'help-circle' };
    }
}
// Default export
exports.default = {
    setMainWindow,
    addSyncStatusColumns,
    onTransactionQueued,
    onTransactionSynced,
    onTransactionSyncFailed,
    onTransactionConflict,
    getTransactionSyncStatus,
    getTransactionsWithSyncStatus,
    resetSyncStatusForRetry,
    integrateWithSyncQueue,
    handleSyncQueueItemCompleted,
    getSyncStatusChannel,
    getSyncStatusMessage,
    getSyncStatusDisplay,
};
