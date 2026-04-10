"use strict";
/**
 * Batch Sync Service for SoftwareSawit
 *
 * Implements batch sync operations with:
 * - Configurable batch size (default 100 records)
 * - Progress callbacks for UI updates
 * - Partial batch failure handling (retry failed items only)
 * - Atomic batch processing where possible
 *
 * This service groups multiple sync queue items into batches for efficient
 * network usage while maintaining reliability and providing progress feedback.
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
exports.setProgressCallback = setProgressCallback;
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.cancelBatchSync = cancelBatchSync;
exports.resetCancellation = resetCancellation;
exports.processBatchSync = processBatchSync;
exports.retryFailedItems = retryFailedItems;
exports.retryBatch = retryBatch;
exports.createApiClient = createApiClient;
exports.getBatchSyncStats = getBatchSyncStats;
exports.validateConfig = validateConfig;
const electron_log_1 = __importDefault(require("electron-log"));
const syncQueueService = __importStar(require("./syncQueueService"));
// ============ Default Configuration ============
const DEFAULT_CONFIG = {
    batchSize: 100,
    maxRetries: 3,
    retryDelayMs: 1000,
    atomicBatches: false,
    progressCallbacks: true,
};
// ============ State ============
let currentProgressCallback = null;
let isCancelled = false;
let currentConfig = { ...DEFAULT_CONFIG };
// ============ Core Functions ============
/**
 * Set the progress callback for batch sync operations
 */
function setProgressCallback(callback) {
    currentProgressCallback = callback;
    electron_log_1.default.info('[BatchSync] Progress callback', callback ? 'set' : 'removed');
}
/**
 * Update configuration for batch sync
 */
function setConfig(config) {
    currentConfig = { ...currentConfig, ...config };
    electron_log_1.default.info('[BatchSync] Config updated:', currentConfig);
}
/**
 * Get current configuration
 */
function getConfig() {
    return { ...currentConfig };
}
/**
 * Cancel ongoing batch sync operation
 */
function cancelBatchSync() {
    isCancelled = true;
    electron_log_1.default.info('[BatchSync] Cancellation requested');
}
/**
 * Reset cancellation flag
 */
function resetCancellation() {
    isCancelled = false;
}
/**
 * Process batch sync with configurable options
 */
async function processBatchSync(apiClient, config, progressCallback) {
    const startTime = Date.now();
    const mergedConfig = { ...currentConfig, ...config };
    // Set up progress callback
    if (progressCallback) {
        currentProgressCallback = progressCallback;
    }
    electron_log_1.default.info('[BatchSync] Starting batch sync with config:', mergedConfig);
    // Get pending items
    const pendingItems = mergedConfig.module
        ? syncQueueService.getPendingItemsByModule(mergedConfig.module)
        : syncQueueService.getPendingItems();
    if (pendingItems.length === 0) {
        electron_log_1.default.info('[BatchSync] No pending items to sync');
        return {
            success: true,
            totalProcessed: 0,
            succeeded: 0,
            failed: 0,
            retried: 0,
            batchesProcessed: 0,
            totalBatches: 0,
            failedItemIds: [],
            errors: [],
            elapsedMs: Date.now() - startTime,
            batchResults: [],
        };
    }
    // Group items into batches
    const batches = createBatches(pendingItems, mergedConfig.batchSize);
    const totalBatches = batches.length;
    electron_log_1.default.info(`[BatchSync] Created ${totalBatches} batches from ${pendingItems.length} items`);
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalRetried = 0;
    const allFailedItemIds = [];
    const allErrors = [];
    const batchResults = [];
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (isCancelled) {
            electron_log_1.default.info('[BatchSync] Sync cancelled by user');
            break;
        }
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        electron_log_1.default.info(`[BatchSync] Processing batch ${batchNumber}/${totalBatches} with ${batch.length} items`);
        // Report progress
        reportProgress({
            currentBatch: batchNumber,
            totalBatches,
            itemsProcessed: 0,
            totalProcessed,
            totalItems: pendingItems.length,
            succeeded: 0,
            failed: 0,
            status: 'in_progress',
            elapsedMs: Date.now() - startTime,
            estimatedRemainingMs: estimateRemainingTime(startTime, totalProcessed, pendingItems.length),
        });
        // Process the batch
        const batchResult = await processSingleBatch(apiClient, batch, mergedConfig, batchNumber);
        batchResults.push(batchResult);
        totalProcessed += batchResult.itemCount;
        totalSucceeded += batchResult.succeeded;
        totalFailed += batchResult.failed;
        allFailedItemIds.push(...batchResult.failedItemIds);
        if (batchResult.success) {
            electron_log_1.default.info(`[BatchSync] Batch ${batchNumber} completed: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
        }
        else {
            electron_log_1.default.warn(`[BatchSync] Batch ${batchNumber} failed: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
        }
        // Report progress after batch completion
        reportProgress({
            currentBatch: batchNumber,
            totalBatches,
            itemsProcessed: batch.length,
            totalProcessed,
            totalItems: pendingItems.length,
            succeeded: batchResult.succeeded,
            failed: batchResult.failed,
            status: 'in_progress',
            elapsedMs: Date.now() - startTime,
            estimatedRemainingMs: estimateRemainingTime(startTime, totalProcessed, pendingItems.length),
        });
    }
    const elapsedMs = Date.now() - startTime;
    const success = totalFailed === 0 && !isCancelled;
    // Final progress report
    reportProgress({
        currentBatch: batchResults.length || 0,
        totalBatches,
        itemsProcessed: 0,
        totalProcessed,
        totalItems: pendingItems.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        status: isCancelled ? 'cancelled' : (success ? 'completed' : 'failed'),
        elapsedMs,
        estimatedRemainingMs: null,
    });
    electron_log_1.default.info(`[BatchSync] Finished: ${totalProcessed} processed, ${totalSucceeded} succeeded, ${totalFailed} failed in ${elapsedMs}ms`);
    // Reset cancellation flag
    resetCancellation();
    return {
        success,
        totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
        retried: totalRetried,
        batchesProcessed: batchResults.length,
        totalBatches,
        failedItemIds: allFailedItemIds,
        errors: allErrors,
        elapsedMs,
        batchResults,
    };
}
/**
 * Process a single batch of items
 */
async function processSingleBatch(apiClient, items, config, batchNumber) {
    let succeeded = 0;
    let failed = 0;
    const failedItemIds = [];
    const errors = [];
    // Mark items as in progress
    for (const item of items) {
        syncQueueService.markInProgress(item.id);
    }
    if (config.atomicBatches) {
        // Atomic batch processing - all or nothing using batch API
        const result = await sendBatchToApi(apiClient, items, true);
        for (const itemResult of result.results) {
            if (itemResult.success) {
                syncQueueService.markSynced(itemResult.itemId);
                succeeded++;
            }
            else {
                syncQueueService.markFailed(itemResult.itemId, itemResult.error || 'Atomic batch failed');
                failedItemIds.push(itemResult.itemId);
                if (itemResult.error)
                    errors.push(itemResult.error);
                failed++;
            }
        }
    }
    else {
        // Non-atomic: use batch API for efficiency, handle partial failures
        const result = await sendBatchToApi(apiClient, items, false);
        for (const itemResult of result.results) {
            if (itemResult.success) {
                syncQueueService.markSynced(itemResult.itemId);
                succeeded++;
            }
            else {
                syncQueueService.markFailed(itemResult.itemId, itemResult.error || 'Batch sync failed');
                failedItemIds.push(itemResult.itemId);
                if (itemResult.error)
                    errors.push(itemResult.error);
                failed++;
            }
        }
    }
    return {
        batchNumber,
        itemCount: items.length,
        succeeded,
        failed,
        failedItemIds,
        atomicRollback: config.atomicBatches,
        success: failed === 0,
    };
}
/**
 * Process a single sync queue item (used for retry operations)
 */
async function processSingleItem(apiClient, item, config) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            const result = await sendToApi(apiClient, item);
            if (result.success) {
                return { success: true };
            }
            else {
                lastError = result.error;
                // If it's a non-retryable error (e.g., 4xx), don't retry
                if (result.statusCode && result.statusCode >= 400 && result.statusCode < 500) {
                    electron_log_1.default.warn(`[BatchSync] Non-retryable error for ${item.id}: ${result.error}`);
                    return { success: false, error: result.error };
                }
            }
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            // Network errors are retryable
            if (attempt < config.maxRetries) {
                const delay = config.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
                electron_log_1.default.info(`[BatchSync] Retrying item ${item.id} after ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
                await sleep(delay);
            }
        }
        // If not on last attempt, wait before retry
        if (attempt < config.maxRetries) {
            const delay = config.retryDelayMs * Math.pow(2, attempt);
            await sleep(delay);
        }
    }
    return { success: false, error: lastError };
}
/**
 * Send a single item to the API
 */
async function sendToApi(apiClient, item) {
    const { module, operation, recordId, data, timestamp } = item;
    const payload = syncQueueService.buildSyncPayload(item);
    if (!payload) {
        return { success: false, error: 'Failed to build sync payload' };
    }
    // Parse the data to get year/month from record
    const parsedData = JSON.parse(data);
    const year = parsedData.tanggal ? new Date(parsedData.tanggal).getFullYear() : new Date().getFullYear();
    const month = parsedData.tanggal ? (new Date(parsedData.tanggal).getMonth() + 1).toString().padStart(2, '0') : '01';
    // Build the API path based on operation
    let method;
    let path;
    let body;
    switch (operation) {
        case 'create':
            method = 'POST';
            path = `/api/${module}/${year}/${month}`;
            body = parsedData;
            break;
        case 'update':
            method = 'PUT';
            path = `/api/${module}/${year}/${month}/${recordId}`;
            body = parsedData;
            break;
        case 'delete':
            method = 'DELETE';
            path = `/api/${module}/${year}/${month}/${recordId}`;
            body = undefined;
            break;
        default:
            return { success: false, error: `Unknown operation: ${operation}` };
    }
    return await apiClient.request(method, path, body);
}
// ============ Helper Functions ============
/**
 * Send a batch of items to the API using the batch endpoint
 */
async function sendBatchToApi(apiClient, items, atomic = false) {
    if (items.length === 0) {
        return { success: true, results: [] };
    }
    // Group items by module and periode for efficient batching
    const groupedByModuleAndPeriode = new Map();
    for (const item of items) {
        const parsedData = JSON.parse(item.data);
        const year = parsedData.tanggal ? new Date(parsedData.tanggal).getFullYear() : new Date().getFullYear();
        const month = parsedData.tanggal ? (new Date(parsedData.tanggal).getMonth() + 1).toString().padStart(2, '0') : '01';
        const key = `${item.module}:${year}:${month}`;
        if (!groupedByModuleAndPeriode.has(key)) {
            groupedByModuleAndPeriode.set(key, []);
        }
        groupedByModuleAndPeriode.get(key).push(item);
    }
    const allResults = [];
    // Process each module/periode group
    for (const [key, groupItems] of groupedByModuleAndPeriode) {
        const [module, year, month] = key.split(':');
        // Build batch request payload
        const operations = groupItems.map(item => {
            const parsedData = JSON.parse(item.data);
            return {
                operation: item.operation,
                recordId: item.recordId,
                data: parsedData,
                timestamp: item.timestamp,
                deviceId: parsedData.device_id,
            };
        });
        try {
            const response = await apiClient.request('POST', '/api/batch', {
                module,
                year,
                month,
                operations,
                atomic,
            });
            if (response.success && response.data) {
                // Map results back to items
                for (let i = 0; i < groupItems.length; i++) {
                    const apiResult = response.data.results.find(r => r.index === i);
                    if (apiResult) {
                        allResults.push({
                            itemId: groupItems[i].id,
                            success: apiResult.success,
                            error: apiResult.error,
                        });
                    }
                    else {
                        allResults.push({
                            itemId: groupItems[i].id,
                            success: false,
                            error: 'Result not found in response',
                        });
                    }
                }
            }
            else {
                // Batch request failed - mark all items in this group as failed
                for (const item of groupItems) {
                    allResults.push({
                        itemId: item.id,
                        success: false,
                        error: response.error || response.data?.error || 'Batch request failed',
                    });
                }
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Network error - mark all items in this group as failed
            for (const item of groupItems) {
                allResults.push({
                    itemId: item.id,
                    success: false,
                    error: errorMsg,
                });
            }
        }
    }
    const allSucceeded = allResults.every(r => r.success);
    return {
        success: allSucceeded,
        results: allResults,
    };
}
/**
 * Create batches from items
 */
function createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}
/**
 * Report progress to callback
 */
function reportProgress(progress) {
    if (currentProgressCallback) {
        try {
            currentProgressCallback(progress);
        }
        catch (error) {
            electron_log_1.default.error('[BatchSync] Error in progress callback:', error);
        }
    }
}
/**
 * Estimate remaining time based on current progress
 */
function estimateRemainingTime(startTime, processed, total) {
    if (processed === 0 || total === 0)
        return null;
    const elapsed = Date.now() - startTime;
    const rate = processed / elapsed; // items per ms
    const remaining = total - processed;
    return Math.round(remaining / rate);
}
/**
 * Sleep for specified duration
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ============ Retry Failed Items ============
/**
 * Retry failed items from a previous batch sync
 */
async function retryFailedItems(apiClient, itemIds, config) {
    const mergedConfig = { ...currentConfig, ...config };
    let succeeded = 0;
    let failed = 0;
    const errors = [];
    for (const itemId of itemIds) {
        if (isCancelled)
            break;
        const item = syncQueueService.getQueueItemById(itemId);
        if (!item) {
            electron_log_1.default.warn(`[BatchSync] Item not found for retry: ${itemId}`);
            failed++;
            errors.push(`Item not found: ${itemId}`);
            continue;
        }
        // Reset status to pending for retry
        syncQueueService.retryItem(itemId);
        try {
            const result = await processSingleItem(apiClient, item, mergedConfig);
            if (result.success) {
                syncQueueService.markSynced(itemId);
                succeeded++;
            }
            else {
                syncQueueService.markFailed(itemId, result.error || 'Retry failed');
                errors.push(result.error || 'Unknown error');
                failed++;
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            syncQueueService.markFailed(itemId, errorMsg);
            errors.push(errorMsg);
            failed++;
        }
    }
    electron_log_1.default.info(`[BatchSync] Retry completed: ${succeeded} succeeded, ${failed} failed`);
    return { succeeded, failed, errors };
}
/**
 * Retry items that failed in a specific batch
 */
async function retryBatch(apiClient, batchResult, config) {
    const mergedConfig = { ...currentConfig, ...config };
    electron_log_1.default.info(`[BatchSync] Retrying batch ${batchResult.batchNumber} with ${batchResult.failedItemIds.length} failed items`);
    // Get the failed items
    const items = [];
    for (const itemId of batchResult.failedItemIds) {
        const item = syncQueueService.getQueueItemById(itemId);
        if (item) {
            items.push(item);
        }
    }
    // Process only the failed items
    let totalSucceeded = 0;
    let totalFailed = 0;
    const newFailedItemIds = [];
    const errors = [];
    for (const item of items) {
        try {
            const result = await processSingleItem(apiClient, item, mergedConfig);
            if (result.success) {
                syncQueueService.markSynced(item.id);
                totalSucceeded++;
            }
            else {
                syncQueueService.markFailed(item.id, result.error || 'Retry failed');
                newFailedItemIds.push(item.id);
                errors.push(result.error || 'Unknown error');
                totalFailed++;
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            syncQueueService.markFailed(item.id, errorMsg);
            newFailedItemIds.push(item.id);
            errors.push(errorMsg);
            totalFailed++;
        }
    }
    return {
        batchNumber: batchResult.batchNumber,
        itemCount: items.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        failedItemIds: newFailedItemIds,
        atomicRollback: batchResult.atomicRollback,
        success: totalFailed === 0,
    };
}
// ============ Simple API Client Factory ============
/**
 * Create a simple API client for batch sync
 */
function createApiClient(baseUrl, authToken) {
    return {
        baseUrl,
        authToken,
        async request(method, path, body) {
            try {
                const url = `${baseUrl}${path}`;
                const options = {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`,
                    },
                };
                if (body && method !== 'GET' && method !== 'DELETE') {
                    options.body = JSON.stringify(body);
                }
                const response = await fetch(url, options);
                const statusCode = response.status;
                if (response.ok) {
                    const data = statusCode === 204 ? undefined : await response.json();
                    return { success: true, data, statusCode };
                }
                else {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    return {
                        success: false,
                        error: `HTTP ${statusCode}: ${errorText}`,
                        statusCode
                    };
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                electron_log_1.default.error(`[BatchSync] API request failed: ${method} ${path}`, errorMsg);
                return { success: false, error: errorMsg };
            }
        },
    };
}
// ============ Utility Functions ============
/**
 * Get batch sync statistics
 */
function getBatchSyncStats() {
    const queueStats = syncQueueService.getQueueStats();
    const config = getConfig();
    const pendingItems = config.module
        ? syncQueueService.getPendingItemsByModule(config.module)
        : syncQueueService.getPendingItems();
    const estimatedBatches = Math.ceil(pendingItems.length / config.batchSize);
    return {
        pendingItems: pendingItems.length,
        estimatedBatches,
        batchSize: config.batchSize,
        queueStats,
    };
}
/**
 * Validate batch sync configuration
 */
function validateConfig(config) {
    const errors = [];
    if (config.batchSize !== undefined) {
        if (config.batchSize < 1) {
            errors.push('Batch size must be at least 1');
        }
        if (config.batchSize > 1000) {
            errors.push('Batch size should not exceed 1000 for performance reasons');
        }
    }
    if (config.maxRetries !== undefined) {
        if (config.maxRetries < 0) {
            errors.push('Max retries must be non-negative');
        }
        if (config.maxRetries > 10) {
            errors.push('Max retries should not exceed 10');
        }
    }
    if (config.retryDelayMs !== undefined) {
        if (config.retryDelayMs < 100) {
            errors.push('Retry delay should be at least 100ms');
        }
        if (config.retryDelayMs > 60000) {
            errors.push('Retry delay should not exceed 60000ms (1 minute)');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
// ============ Export ============
exports.default = {
    setProgressCallback,
    setConfig,
    getConfig,
    cancelBatchSync,
    resetCancellation,
    processBatchSync,
    retryFailedItems,
    retryBatch,
    createApiClient,
    getBatchSyncStats,
    validateConfig,
};
