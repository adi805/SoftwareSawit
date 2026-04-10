"use strict";
/**
 * Sync Health Dashboard Service for SoftwareSawit
 *
 * Provides APIs for monitoring sync queue health and managing failed items:
 * - getSyncStats: Get accurate counts (pending, failed, total)
 * - getModuleSyncStatus: Per-module breakdown of sync status
 * - getFailedItems: List failed items with retry information including exponential backoff
 * - retryFailedItem: Reset a single failed item's status to pending
 * - retryAllFailed: Reset all failed items to pending
 *
 * This service integrates with:
 * - syncQueueService: for queue operations and stats
 * - retryService: for exponential backoff calculations
 * - syncDatabase: for database access
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
exports.getSyncStats = getSyncStats;
exports.getModuleSyncStatus = getModuleSyncStatus;
exports.getFailedItems = getFailedItems;
exports.retryFailedItem = retryFailedItem;
exports.retryAllFailed = retryAllFailed;
exports.getRetryConfig = getRetryConfig;
exports.getQueueHealth = getQueueHealth;
exports.getHealthDashboardData = getHealthDashboardData;
const electron_log_1 = __importDefault(require("electron-log"));
const syncQueueService = __importStar(require("./syncQueueService"));
const syncDb = __importStar(require("./syncDatabase"));
const retryService = __importStar(require("./retryService"));
// ============ API Implementations ============
/**
 * Get sync statistics - accurate counts for pending, failed, total
 */
function getSyncStats() {
    try {
        const stats = syncQueueService.getQueueStats();
        return {
            pending: stats.pending,
            inProgress: stats.inProgress,
            failed: stats.failed,
            completed: stats.completed,
            total: stats.total,
            oldestPendingTimestamp: stats.oldestPendingTimestamp,
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncHealth] Failed to get sync stats:', error);
        return {
            pending: 0,
            inProgress: 0,
            failed: 0,
            completed: 0,
            total: 0,
            oldestPendingTimestamp: null,
        };
    }
}
/**
 * Get per-module sync status breakdown
 */
function getModuleSyncStatus() {
    try {
        const stats = syncQueueService.getQueueStats();
        const configs = syncDb.getAllSyncConfigs();
        const modules = ['kas', 'bank', 'gudang', 'coa', 'aspek_kerja', 'blok'];
        const moduleSyncStatus = {};
        for (const mod of modules) {
            const config = configs.find(c => c.module === mod);
            const pendingCount = stats.byModule[mod] || 0;
            // Determine sync state
            let syncState;
            if (!config || !config.enabled) {
                syncState = 'not_configured';
            }
            else if (pendingCount > 0) {
                syncState = 'pending';
            }
            else {
                syncState = 'synced';
            }
            moduleSyncStatus[mod] = {
                module: mod,
                pendingCount,
                failedCount: 0, // Could be tracked separately if needed
                lastSyncAt: config?.lastSyncAt || null,
                syncState,
                isConfigured: !!config,
                isEnabled: config?.enabled || false,
            };
        }
        return { success: true, modules: moduleSyncStatus };
    }
    catch (error) {
        electron_log_1.default.error('[SyncHealth] Failed to get module sync status:', error);
        return { success: false, modules: {}, message: 'Failed to get module sync status' };
    }
}
/**
 * Get list of failed items with retry information including exponential backoff
 */
function getFailedItems(options) {
    try {
        const { module, limit = 100, offset = 0 } = options || {};
        // Get failed items from sync database
        const allFailed = syncDb.getSyncQueueStats();
        // Get the actual failed items - we'll query them directly
        let failedItems = [];
        // Access the itemsByStatus from inspectQueue
        const inspection = syncDb.inspectQueue();
        failedItems = inspection.itemsByStatus.failed || [];
        // Filter by module if specified
        if (module) {
            failedItems = failedItems.filter(item => item.module === module);
        }
        // Calculate total before pagination
        const totalCount = failedItems.length;
        // Apply pagination
        const paginatedItems = failedItems.slice(offset, offset + limit);
        // Get retry config for exponential backoff info
        const retryConfig = retryService.getConfig();
        // Transform to FailedItem with retry info
        const items = paginatedItems.map(item => {
            // Calculate retry info
            const canRetry = retryService.canRetry(item.id, item.attempts);
            let nextRetryAt = null;
            let retryDelayMs = null;
            let retryDelayFormatted = null;
            if (canRetry) {
                retryDelayMs = retryService.calculateNextRetryDelay(item.attempts);
                const nextRetryTime = new Date(Date.now() + retryDelayMs);
                nextRetryAt = nextRetryTime.toISOString();
                retryDelayFormatted = retryService.formatDelay(retryDelayMs);
            }
            return {
                id: item.id,
                module: item.module,
                operation: item.operation,
                recordId: item.recordId,
                attempts: item.attempts,
                lastError: item.lastError,
                createdAt: item.timestamp,
                lastAttemptAt: item.timestamp, // Would need updated_at field for accuracy
                nextRetryAt,
                canRetry,
                maxRetries: retryConfig.maxRetries,
                retryDelayMs,
                retryDelayFormatted,
                status: item.status === 'error' ? 'error' : 'failed',
            };
        });
        return {
            items,
            totalCount,
            totalRetriedCount: allFailed.failed,
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncHealth] Failed to get failed items:', error);
        return {
            items: [],
            totalCount: 0,
            totalRetriedCount: 0,
        };
    }
}
/**
 * Retry a single failed item - resets status to pending
 */
function retryFailedItem(itemId) {
    try {
        // First check if the item exists
        const item = syncDb.getSyncQueueItemById(itemId);
        if (!item) {
            return { success: false, message: 'Item tidak ditemukan' };
        }
        if (item.status !== 'failed' && item.status !== 'error') {
            return { success: false, message: `Tidak dapat retry item dengan status: ${item.status}` };
        }
        // Use the sync queue service to retry
        const result = syncQueueService.retryItem(itemId);
        if (result.success) {
            electron_log_1.default.info(`[SyncHealth] Retried failed item: ${itemId}`);
        }
        return {
            success: result.success,
            message: result.message,
            itemId,
        };
    }
    catch (error) {
        electron_log_1.default.error(`[SyncHealth] Failed to retry item ${itemId}:`, error);
        return { success: false, message: 'Gagal meretry item' };
    }
}
/**
 * Retry all failed items - resets all to pending
 */
function retryAllFailed() {
    try {
        const result = syncQueueService.retryAllFailed();
        if (result.success) {
            electron_log_1.default.info(`[SyncHealth] Retried all failed items: ${result.retriedCount}`);
        }
        return {
            success: result.success,
            message: result.message,
            retriedCount: result.retriedCount,
        };
    }
    catch (error) {
        electron_log_1.default.error('[SyncHealth] Failed to retry all failed items:', error);
        return { success: false, message: 'Gagal meretry semua item gagal' };
    }
}
/**
 * Get retry configuration info for display
 */
function getRetryConfig() {
    const config = retryService.getConfig();
    const sequence = retryService.getRetrySequence();
    const sequenceFormatted = sequence.map(delay => retryService.formatDelay(delay));
    return {
        maxRetries: config.maxRetries,
        baseDelayMs: config.baseDelayMs,
        maxDelayMs: config.maxDelayMs,
        multiplier: config.multiplier,
        retrySequence: sequence,
        retrySequenceFormatted: sequenceFormatted,
    };
}
/**
 * Get queue health status
 */
function getQueueHealth() {
    try {
        return syncQueueService.getQueueHealth();
    }
    catch (error) {
        electron_log_1.default.error('[SyncHealth] Failed to get queue health:', error);
        return { healthy: false, issues: ['Failed to check queue health'], warnings: [] };
    }
}
/**
 * Get comprehensive health dashboard data
 */
function getHealthDashboardData() {
    const stats = getSyncStats();
    const moduleStatusResult = getModuleSyncStatus();
    const health = getQueueHealth();
    const retryConfig = getRetryConfig();
    const failedItemsResult = getFailedItems({ limit: 1 });
    return {
        stats,
        moduleStatus: moduleStatusResult.modules,
        health,
        retryConfig,
        failedItemsCount: failedItemsResult.totalCount,
    };
}
// Default export
exports.default = {
    getSyncStats,
    getModuleSyncStatus,
    getFailedItems,
    retryFailedItem,
    retryAllFailed,
    getRetryConfig,
    getQueueHealth,
    getHealthDashboardData,
};
