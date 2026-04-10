"use strict";
/**
 * Sync Queue Service for SoftwareSawit
 *
 * Manages the sync queue for local-first operations:
 * - Queues create/update/delete operations for cloud sync
 * - Tracks operation metadata (timestamp, type)
 * - Supports offline operations without network dependency
 * - Maintains operation order for consistency (FIFO)
 * - Supports batch operations for efficient syncing
 * - Full status tracking: pending, in_progress, failed, completed
 * - Inspection and debugging capabilities
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
exports.queueSync = queueSync;
exports.queueSyncBatch = queueSyncBatch;
exports.getPendingItems = getPendingItems;
exports.getPendingItemsByModule = getPendingItemsByModule;
exports.getQueueStats = getQueueStats;
exports.markInProgress = markInProgress;
exports.markSynced = markSynced;
exports.markFailed = markFailed;
exports.retryItem = retryItem;
exports.retryAllFailed = retryAllFailed;
exports.clearQueue = clearQueue;
exports.removeCompletedItems = removeCompletedItems;
exports.createBatch = createBatch;
exports.getBatch = getBatch;
exports.getOpenBatches = getOpenBatches;
exports.updateBatchStatus = updateBatchStatus;
exports.inspectQueue = inspectQueue;
exports.exportQueueState = exportQueueState;
exports.getQueueHealth = getQueueHealth;
exports.getQueueItemById = getQueueItemById;
exports.buildSyncPayload = buildSyncPayload;
exports.getDeviceId = getDeviceId;
exports.getCurrentTimestamp = getCurrentTimestamp;
exports.formatDateForDb = formatDateForDb;
exports.parseDate = parseDate;
exports.isValidSyncStatus = isValidSyncStatus;
exports.getSyncStatusMessage = getSyncStatusMessage;
exports.getStatusDisplay = getStatusDisplay;
const electron_log_1 = __importDefault(require("electron-log"));
const syncDb = __importStar(require("./syncDatabase"));
// Create sync queue entry for an operation
function queueSync(module, operation, recordId, data) {
    try {
        const result = syncDb.addToSyncQueue(module, operation, recordId, data);
        if (result.success && result.item) {
            // Convert to our format
            const queueItem = {
                id: result.item.id,
                batchId: result.item.batchId,
                operation: result.item.operation,
                module: result.item.module,
                recordId: result.item.recordId,
                data: result.item.data,
                timestamp: result.item.timestamp,
                status: result.item.status,
                attempts: result.item.attempts,
                lastError: result.item.lastError,
            };
            return { success: true, message: 'Queued for sync', queueItem };
        }
        return { success: false, message: 'Failed to queue sync' };
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to queue sync:', error);
        return { success: false, message: 'Failed to queue sync operation' };
    }
}
// Queue multiple operations as a batch (for efficient syncing)
function queueSyncBatch(module, items) {
    try {
        const result = syncDb.addToSyncQueueBatch(module, items);
        if (result.success) {
            return {
                success: true,
                message: `Batch queued with ${result.itemsAdded} items`,
                batchId: result.batchId,
                itemsAdded: result.itemsAdded,
            };
        }
        return { success: false, message: result.message, batchId: '', itemsAdded: 0 };
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to queue sync batch:', error);
        return { success: false, message: 'Failed to queue sync batch', batchId: '', itemsAdded: 0 };
    }
}
// Get all pending sync items in FIFO order
function getPendingItems() {
    try {
        const items = syncDb.getPendingSyncItems();
        return items.map(item => ({
            id: item.id,
            batchId: item.batchId,
            operation: item.operation,
            module: item.module,
            recordId: item.recordId,
            data: item.data,
            timestamp: item.timestamp,
            status: item.status,
            attempts: item.attempts,
            lastError: item.lastError,
        }));
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to get pending items:', error);
        return [];
    }
}
// Get pending items for a specific module
function getPendingItemsByModule(module) {
    try {
        const items = syncDb.getPendingSyncItemsByModule(module);
        return items.map(item => ({
            id: item.id,
            batchId: item.batchId,
            operation: item.operation,
            module: item.module,
            recordId: item.recordId,
            data: item.data,
            timestamp: item.timestamp,
            status: item.status,
            attempts: item.attempts,
            lastError: item.lastError,
        }));
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to get pending items for module ${module}:`, error);
        return [];
    }
}
// Get sync queue statistics
function getQueueStats() {
    try {
        const stats = syncDb.getSyncQueueStats();
        return {
            pending: stats.pending,
            inProgress: stats.inProgress,
            failed: stats.failed,
            completed: stats.completed,
            total: stats.total,
            byModule: stats.byModule,
            oldestPendingTimestamp: stats.oldestPendingTimestamp,
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to get queue stats:', error);
        return {
            pending: 0,
            inProgress: 0,
            failed: 0,
            completed: 0,
            total: 0,
            byModule: {},
            oldestPendingTimestamp: null,
        };
    }
}
// Mark item as in progress
function markInProgress(id) {
    try {
        syncDb.markItemInProgress(id);
        electron_log_1.default.info(`[SyncQueue] Marked as in_progress: ${id}`);
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to mark in_progress: ${id}`, error);
    }
}
// Mark item as synced (completed)
function markSynced(id) {
    try {
        syncDb.markItemCompleted(id);
        electron_log_1.default.info(`[SyncQueue] Marked as completed: ${id}`);
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to mark completed: ${id}`, error);
    }
}
// Mark item as failed
function markFailed(id, errorMessage) {
    try {
        syncDb.updateSyncQueueItemStatus(id, 'failed', errorMessage);
        electron_log_1.default.warn(`[SyncQueue] Marked as failed: ${id} - ${errorMessage}`);
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to mark failed: ${id}`, error);
    }
}
// Retry a specific failed item
function retryItem(id) {
    try {
        return syncDb.retryItem(id);
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to retry item: ${id}`, error);
        return { success: false, message: 'Failed to retry item' };
    }
}
// Retry all failed items
function retryAllFailed() {
    try {
        return syncDb.retryAllFailed();
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to retry all failed:', error);
        return { success: false, message: 'Failed to retry items', retriedCount: 0 };
    }
}
// Clear all sync queue items
function clearQueue() {
    try {
        return syncDb.clearSyncQueue();
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to clear queue:', error);
        return { success: false, message: 'Failed to clear queue', removedCount: 0 };
    }
}
// Remove completed items from queue (cleanup)
function removeCompletedItems() {
    try {
        return syncDb.removeCompletedItems();
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to remove completed items:', error);
        return { success: false, message: 'Failed to remove completed items', removedCount: 0 };
    }
}
// ============ Batch Operations ============
// Create a new batch for grouping operations
function createBatch(module) {
    try {
        return syncDb.createSyncBatch(module);
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to create batch:', error);
        return { success: false, batchId: '', message: 'Failed to create batch' };
    }
}
// Get batch by ID
function getBatch(batchId) {
    try {
        const batch = syncDb.getSyncBatch(batchId);
        if (!batch)
            return null;
        return {
            id: batch.id,
            module: batch.module,
            items: batch.items.map(item => ({
                id: item.id,
                batchId: item.batchId,
                operation: item.operation,
                module: item.module,
                recordId: item.recordId,
                data: item.data,
                timestamp: item.timestamp,
                status: item.status,
                attempts: item.attempts,
                lastError: item.lastError,
            })),
            status: batch.status,
            createdAt: batch.createdAt,
            completedAt: batch.completedAt,
            itemCount: batch.itemCount,
        };
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to get batch: ${batchId}`, error);
        return null;
    }
}
// Get all open batches
function getOpenBatches() {
    try {
        return syncDb.getOpenBatches().map(batch => ({
            id: batch.id,
            module: batch.module,
            items: batch.items.map(item => ({
                id: item.id,
                batchId: item.batchId,
                operation: item.operation,
                module: item.module,
                recordId: item.recordId,
                data: item.data,
                timestamp: item.timestamp,
                status: item.status,
                attempts: item.attempts,
                lastError: item.lastError,
            })),
            status: batch.status,
            createdAt: batch.createdAt,
            completedAt: batch.completedAt,
            itemCount: batch.itemCount,
        }));
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to get open batches:', error);
        return [];
    }
}
// Update batch status
function updateBatchStatus(batchId, status) {
    try {
        syncDb.updateBatchStatus(batchId, status);
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to update batch status: ${batchId}`, error);
    }
}
// ============ Inspection & Debugging ============
// Inspect entire queue state
function inspectQueue() {
    try {
        const inspection = syncDb.inspectQueue();
        return {
            statistics: {
                pending: inspection.statistics.pending,
                inProgress: inspection.statistics.inProgress,
                failed: inspection.statistics.failed,
                completed: inspection.statistics.completed,
                total: inspection.statistics.total,
                byModule: inspection.statistics.byModule,
                oldestPendingTimestamp: inspection.statistics.oldestPendingTimestamp,
            },
            recentItems: inspection.recentItems.map(item => ({
                id: item.id,
                batchId: item.batchId,
                operation: item.operation,
                module: item.module,
                recordId: item.recordId,
                data: item.data,
                timestamp: item.timestamp,
                status: item.status,
                attempts: item.attempts,
                lastError: item.lastError,
            })),
            itemsByStatus: {
                pending: inspection.itemsByStatus.pending.map(item => ({
                    id: item.id,
                    batchId: item.batchId,
                    operation: item.operation,
                    module: item.module,
                    recordId: item.recordId,
                    data: item.data,
                    timestamp: item.timestamp,
                    status: item.status,
                    attempts: item.attempts,
                    lastError: item.lastError,
                })),
                in_progress: inspection.itemsByStatus.in_progress.map(item => ({
                    id: item.id,
                    batchId: item.batchId,
                    operation: item.operation,
                    module: item.module,
                    recordId: item.recordId,
                    data: item.data,
                    timestamp: item.timestamp,
                    status: item.status,
                    attempts: item.attempts,
                    lastError: item.lastError,
                })),
                failed: inspection.itemsByStatus.failed.map(item => ({
                    id: item.id,
                    batchId: item.batchId,
                    operation: item.operation,
                    module: item.module,
                    recordId: item.recordId,
                    data: item.data,
                    timestamp: item.timestamp,
                    status: item.status,
                    attempts: item.attempts,
                    lastError: item.lastError,
                })),
                completed: inspection.itemsByStatus.completed.map(item => ({
                    id: item.id,
                    batchId: item.batchId,
                    operation: item.operation,
                    module: item.module,
                    recordId: item.recordId,
                    data: item.data,
                    timestamp: item.timestamp,
                    status: item.status,
                    attempts: item.attempts,
                    lastError: item.lastError,
                })),
            },
            batches: inspection.batches.map(batch => ({
                id: batch.id,
                module: batch.module,
                items: batch.items.map(item => ({
                    id: item.id,
                    batchId: item.batchId,
                    operation: item.operation,
                    module: item.module,
                    recordId: item.recordId,
                    data: item.data,
                    timestamp: item.timestamp,
                    status: item.status,
                    attempts: item.attempts,
                    lastError: item.lastError,
                })),
                status: batch.status,
                createdAt: batch.createdAt,
                completedAt: batch.completedAt,
                itemCount: batch.itemCount,
            })),
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to inspect queue:', error);
        return {
            statistics: {
                pending: 0,
                inProgress: 0,
                failed: 0,
                completed: 0,
                total: 0,
                byModule: {},
                oldestPendingTimestamp: null,
            },
            recentItems: [],
            itemsByStatus: {
                pending: [],
                in_progress: [],
                failed: [],
                completed: [],
            },
            batches: [],
        };
    }
}
// Export queue state as JSON for debugging
function exportQueueState() {
    try {
        return syncDb.exportQueueState();
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to export queue state:', error);
        return JSON.stringify({ error: 'Failed to export queue state' });
    }
}
// Get queue health status
function getQueueHealth() {
    try {
        return syncDb.getQueueHealth();
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to get queue health:', error);
        return { healthy: false, issues: ['Failed to check queue health'], warnings: [] };
    }
}
// Get a single item by ID
function getQueueItemById(id) {
    try {
        const item = syncDb.getSyncQueueItemById(id);
        if (!item)
            return null;
        return {
            id: item.id,
            batchId: item.batchId,
            operation: item.operation,
            module: item.module,
            recordId: item.recordId,
            data: item.data,
            timestamp: item.timestamp,
            status: item.status,
            attempts: item.attempts,
            lastError: item.lastError,
        };
    }
    catch (error) {
        electron_log_1.default.error(`[SyncQueue] Failed to get queue item: ${id}`, error);
        return null;
    }
}
function buildSyncPayload(item) {
    try {
        const data = JSON.parse(item.data);
        return {
            module: item.module,
            operation: item.operation,
            recordId: item.recordId,
            data,
            timestamp: item.timestamp,
            deviceId: getDeviceId(),
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncQueue] Failed to build sync payload:', error);
        return null;
    }
}
// Get device ID - generates a unique device identifier
let cachedDeviceId = null;
function getDeviceId() {
    if (cachedDeviceId) {
        return cachedDeviceId;
    }
    // Generate a unique device ID based on timestamp + random
    // This provides a stable ID within a session but regenerates on app restart
    // For persistent device ID across sessions, would need electron-store integration
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    cachedDeviceId = `device-${timestamp}-${randomPart}`;
    electron_log_1.default.info(`[SyncQueue] Generated device ID: ${cachedDeviceId}`);
    return cachedDeviceId;
}
// Get current timestamp for sync operations
function getCurrentTimestamp() {
    return new Date().toISOString();
}
// Format date for transaction tables (YYYY-MM-DD)
function formatDateForDb(date) {
    return date.toISOString().split('T')[0];
}
// Parse date from various formats
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    // Try ISO format first
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) {
        return isoDate;
    }
    // Try DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return null;
}
// Validate sync status value
function isValidSyncStatus(status) {
    return ['synced', 'pending', 'in_progress', 'conflict', 'error', 'completed'].includes(status);
}
// Get human-readable sync status message
function getSyncStatusMessage(status) {
    switch (status) {
        case 'synced':
            return 'Tersinkronkan';
        case 'pending':
            return 'Menunggu sync';
        case 'in_progress':
            return 'Sedang sync';
        case 'conflict':
            return 'Konflik terdeteksi';
        case 'error':
        case 'failed':
            return 'Gagal sync';
        case 'completed':
            return 'Selesai';
        default:
            return 'Unknown';
    }
}
// Get status display info for UI
function getStatusDisplay(status) {
    switch (status) {
        case 'pending':
            return { label: 'Pending', color: 'yellow', icon: 'clock' };
        case 'in_progress':
            return { label: 'Syncing', color: 'blue', icon: 'sync' };
        case 'failed':
            return { label: 'Failed', color: 'red', icon: 'x-circle' };
        case 'completed':
            return { label: 'Completed', color: 'green', icon: 'check-circle' };
        case 'synced':
            return { label: 'Synced', color: 'green', icon: 'cloud' };
        case 'conflict':
            return { label: 'Conflict', color: 'orange', icon: 'alert-triangle' };
        default:
            return { label: 'Unknown', color: 'gray', icon: 'help-circle' };
    }
}
exports.default = {
    // Core queue operations
    queueSync,
    queueSyncBatch,
    getPendingItems,
    getPendingItemsByModule,
    getQueueStats,
    markInProgress,
    markSynced,
    markFailed,
    retryItem,
    retryAllFailed,
    clearQueue,
    removeCompletedItems,
    // Batch operations
    createBatch,
    getBatch,
    getOpenBatches,
    updateBatchStatus,
    // Inspection & debugging
    inspectQueue,
    exportQueueState,
    getQueueHealth,
    getQueueItemById,
    // Utilities
    buildSyncPayload,
    getDeviceId,
    getCurrentTimestamp,
    formatDateForDb,
    parseDate,
    isValidSyncStatus,
    getSyncStatusMessage,
    getStatusDisplay,
};
