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

import log from 'electron-log';
import * as syncQueueService from './syncQueueService';
import * as syncDb from './syncDatabase';
import * as retryService from './retryService';

// ============ Types & Interfaces ============

export type SyncOperationType = 'create' | 'update' | 'delete';

export interface BatchSyncConfig {
  /** Maximum items per batch (default: 100) */
  batchSize: number;
  /** Maximum retry attempts for failed items (default: 3) */
  maxRetries: number;
  /** Retry delay in ms, exponential backoff applied (default: 1000) */
  retryDelayMs: number;
  /** Enable atomic batch processing (all succeed or all fail) (default: false) */
  atomicBatches: boolean;
  /** Enable progress callbacks (default: true) */
  progressCallbacks: boolean;
  /** Module to sync, or null for all modules */
  module?: string;
}

export interface BatchSyncProgress {
  /** Current batch number (1-indexed) */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Items processed in current batch */
  itemsProcessed: number;
  /** Total items processed overall */
  totalProcessed: number;
  /** Total items to process */
  totalItems: number;
  /** Current batch items that succeeded */
  succeeded: number;
  /** Current batch items that failed */
  failed: number;
  /** Current batch status */
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Estimated remaining time in ms */
  estimatedRemainingMs: number | null;
}

export type ProgressCallback = (progress: BatchSyncProgress) => void;

export interface BatchSyncResult {
  /** Whether the overall sync succeeded */
  success: boolean;
  /** Total items processed */
  totalProcessed: number;
  /** Items that succeeded */
  succeeded: number;
  /** Items that failed */
  failed: number;
  /** Items that were retried */
  retried: number;
  /** Batches processed */
  batchesProcessed: number;
  /** Total batches */
  totalBatches: number;
  /** Failed item IDs for potential retry */
  failedItemIds: string[];
  /** Error messages if any */
  errors: string[];
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Per-batch results for atomic processing */
  batchResults: BatchResult[];
}

export interface BatchResult {
  batchNumber: number;
  itemCount: number;
  succeeded: number;
  failed: number;
  failedItemIds: string[];
  atomicRollback: boolean;
  success: boolean;
}

export interface SyncApiClient {
  /** Base URL for API */
  baseUrl: string;
  /** Authentication token */
  authToken: string;
  /** Make API request */
  request: <T>(method: string, path: string, body?: unknown) => Promise<ApiResponse<T>>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

// ============ Default Configuration ============

const DEFAULT_CONFIG: BatchSyncConfig = {
  batchSize: 100,
  maxRetries: 3,
  retryDelayMs: 1000,
  atomicBatches: false,
  progressCallbacks: true,
};

// ============ State ============

let currentProgressCallback: ProgressCallback | null = null;
let isCancelled = false;
let currentConfig: BatchSyncConfig = { ...DEFAULT_CONFIG };

// ============ Core Functions ============

/**
 * Set the progress callback for batch sync operations
 */
export function setProgressCallback(callback: ProgressCallback | null): void {
  currentProgressCallback = callback;
  log.info('[BatchSync] Progress callback', callback ? 'set' : 'removed');
}

/**
 * Update configuration for batch sync
 */
export function setConfig(config: Partial<BatchSyncConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  log.info('[BatchSync] Config updated:', currentConfig);
}

/**
 * Get current configuration
 */
export function getConfig(): BatchSyncConfig {
  return { ...currentConfig };
}

/**
 * Cancel ongoing batch sync operation
 */
export function cancelBatchSync(): void {
  isCancelled = true;
  log.info('[BatchSync] Cancellation requested');
}

/**
 * Reset cancellation flag
 */
export function resetCancellation(): void {
  isCancelled = false;
}

/**
 * Process batch sync with configurable options
 */
export async function processBatchSync(
  apiClient: SyncApiClient,
  config?: Partial<BatchSyncConfig>,
  progressCallback?: ProgressCallback
): Promise<BatchSyncResult> {
  const startTime = Date.now();
  const mergedConfig = { ...currentConfig, ...config };
  
  // Set up progress callback
  if (progressCallback) {
    currentProgressCallback = progressCallback;
  }

  log.info('[BatchSync] Starting batch sync with config:', mergedConfig);

  // Get pending items
  const pendingItems = mergedConfig.module
    ? syncQueueService.getPendingItemsByModule(mergedConfig.module)
    : syncQueueService.getPendingItems();

  if (pendingItems.length === 0) {
    log.info('[BatchSync] No pending items to sync');
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

  log.info(`[BatchSync] Created ${totalBatches} batches from ${pendingItems.length} items`);

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalRetried = 0;
  const allFailedItemIds: string[] = [];
  const allErrors: string[] = [];
  const batchResults: BatchResult[] = [];

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (isCancelled) {
      log.info('[BatchSync] Sync cancelled by user');
      break;
    }

    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;

    log.info(`[BatchSync] Processing batch ${batchNumber}/${totalBatches} with ${batch.length} items`);

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
    const batchResult = await processSingleBatch(
      apiClient,
      batch,
      mergedConfig,
      batchNumber
    );

    batchResults.push(batchResult);
    totalProcessed += batchResult.itemCount;
    totalSucceeded += batchResult.succeeded;
    totalFailed += batchResult.failed;
    allFailedItemIds.push(...batchResult.failedItemIds);
    
    if (batchResult.success) {
      log.info(`[BatchSync] Batch ${batchNumber} completed: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
    } else {
      log.warn(`[BatchSync] Batch ${batchNumber} failed: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);
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

  log.info(`[BatchSync] Finished: ${totalProcessed} processed, ${totalSucceeded} succeeded, ${totalFailed} failed in ${elapsedMs}ms`);

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
 * Integrates with retryService for automatic retry with exponential backoff
 */
async function processSingleBatch(
  apiClient: SyncApiClient,
  items: syncQueueService.SyncQueueItem[],
  config: BatchSyncConfig,
  batchNumber: number
): Promise<BatchResult> {
  let succeeded = 0;
  let failed = 0;
  const failedItemIds: string[] = [];
  const errors: string[] = [];

  // Mark items as in progress
  for (const item of items) {
    syncQueueService.markInProgress(item.id);
  }

  // Configure retry service based on batch sync config
  retryService.setConfig({
    maxRetries: config.maxRetries,
    baseDelayMs: config.retryDelayMs,
    maxDelayMs: 300000, // 5 minutes max
    multiplier: 2,
    jitterFactor: 0.1,
  });

  // Set up retry exhausted callback
  retryService.setOnRetryExhausted((itemId, finalError) => {
    log.warn(`[BatchSync] All retries exhausted for item ${itemId}: ${finalError}`);
    // Update queue item to error status (permanent failure)
    syncDb.updateSyncQueueItemStatus(itemId, 'error', finalError);
  });

  if (config.atomicBatches) {
    // Atomic batch processing - all or nothing using batch API
    const result = await sendBatchToApi(apiClient, items, true);
    for (const itemResult of result.results) {
      if (itemResult.success) {
        syncQueueService.markSynced(itemResult.itemId);
        retryService.markRetrySuccess(itemResult.itemId);
        succeeded++;
      } else {
        // Handle failure and determine if retry should be scheduled
        const errorMessage = itemResult.error || 'Atomic batch failed';
        const errorObj = new Error(errorMessage);
        const classification = retryService.classifyError(errorObj, itemResult.statusCode);

        // Get the original item for retry scheduling
        const originalItem = items.find(i => i.id === itemResult.itemId);

        if (classification.canRetry && originalItem) {
          // Schedule retry using retryService
          const retryDecision = retryService.processFailedSync(
            itemResult.itemId,
            originalItem.module,
            originalItem.operation,
            originalItem.recordId,
            errorMessage,
            itemResult.statusCode,
            async () => {
              // Retry callback - attempt the single item sync
              const retryResult = await sendToApi(apiClient, originalItem);
              if (!retryResult.success) {
                throw new Error(retryResult.error || 'Retry failed');
              }
              syncQueueService.markSynced(originalItem.id);
            }
          );

          if (retryDecision.shouldRetry) {
            log.info(`[BatchSync] Scheduled retry for ${itemResult.itemId}: ${retryDecision.message}`);
            // Don't add to failedItemIds since retry is scheduled
            continue;
          }
        }

        // No retry scheduled or not retryable
        syncQueueService.markFailed(itemResult.itemId, errorMessage);
        retryService.markRetryExhausted(itemResult.itemId, errorMessage);
        failedItemIds.push(itemResult.itemId);
        if (errorMessage) errors.push(errorMessage);
        failed++;
      }
    }
  } else {
    // Non-atomic: use batch API for efficiency, handle partial failures
    const result = await sendBatchToApi(apiClient, items, false);
    for (const itemResult of result.results) {
      if (itemResult.success) {
        syncQueueService.markSynced(itemResult.itemId);
        retryService.markRetrySuccess(itemResult.itemId);
        succeeded++;
      } else {
        // Handle failure and determine if retry should be scheduled
        const errorMessage = itemResult.error || 'Batch sync failed';
        const errorObj = new Error(errorMessage);
        const classification = retryService.classifyError(errorObj, itemResult.statusCode);

        // Get the original item for retry scheduling
        const originalItem = items.find(i => i.id === itemResult.itemId);

        if (classification.canRetry && originalItem) {
          // Schedule retry using retryService
          const retryDecision = retryService.processFailedSync(
            itemResult.itemId,
            originalItem.module,
            originalItem.operation,
            originalItem.recordId,
            errorMessage,
            itemResult.statusCode,
            async () => {
              // Retry callback - attempt the single item sync
              const retryResult = await sendToApi(apiClient, originalItem);
              if (!retryResult.success) {
                throw new Error(retryResult.error || 'Retry failed');
              }
              syncQueueService.markSynced(originalItem.id);
            }
          );

          if (retryDecision.shouldRetry) {
            log.info(`[BatchSync] Scheduled retry for ${itemResult.itemId}: ${retryDecision.message}`);
            // Don't add to failedItemIds since retry is scheduled
            continue;
          }
        }

        // No retry scheduled or not retryable
        syncQueueService.markFailed(itemResult.itemId, errorMessage);
        retryService.markRetryExhausted(itemResult.itemId, errorMessage);
        failedItemIds.push(itemResult.itemId);
        if (errorMessage) errors.push(errorMessage);
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
 * Now uses retryService for exponential backoff and error classification
 */
async function processSingleItem(
  apiClient: SyncApiClient,
  item: syncQueueService.SyncQueueItem,
  config: BatchSyncConfig
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  // Configure retry service based on batch sync config
  retryService.setConfig({
    maxRetries: config.maxRetries,
    baseDelayMs: config.retryDelayMs,
    maxDelayMs: 300000, // 5 minutes max
    multiplier: 2,
    jitterFactor: 0.1, // 10% jitter to prevent thundering herd
  });

  // Get current attempt from the item's retry count in the queue
  const queueItem = syncQueueService.getQueueItemById(item.id);
  const currentAttempt = queueItem?.attempts || 0;

  // Use retryService to process the failure
  const retryResult = retryService.processFailedSync(
    item.id,
    item.module,
    item.operation,
    item.recordId,
    'Initial attempt',
    undefined, // No error yet
    async () => {
      // This is the retry callback - actually attempt the sync
      const result = await sendToApi(apiClient, item);
      
      if (!result.success) {
        // Convert to error for retry service
        const error = new Error(result.error || 'Sync failed');
        throw error;
      }
    }
  );

  // If we can't retry (non-retryable error), return immediately
  if (!retryResult.shouldRetry) {
    return {
      success: false,
      error: retryResult.message,
      statusCode: undefined,
    };
  }

  // Actually attempt the sync (first attempt or retry)
  try {
    const result = await sendToApi(apiClient, item);

    if (result.success) {
      // Mark retry success
      retryService.markRetrySuccess(item.id);
      return { success: true };
    }

    // Handle failure - classify error and determine if we should retry
    const classification = retryService.classifyError(
      result.error || 'Unknown error',
      result.statusCode
    );

    if (!classification.canRetry) {
      // Non-retryable error
      retryService.markRetryExhausted(item.id, classification.errorMessage);
      return {
        success: false,
        error: classification.errorMessage,
        statusCode: result.statusCode,
      };
    }

    // Retryable error - schedule retry if we have attempts left
    const retryDecision = retryService.processFailedSync(
      item.id,
      item.module,
      item.operation,
      item.recordId,
      classification.errorMessage,
      result.statusCode,
      async () => {
        const retryResult = await sendToApi(apiClient, item);
        if (!retryResult.success) {
          throw new Error(retryResult.error || 'Retry failed');
        }
      }
    );

    if (!retryDecision.shouldRetry) {
      return {
        success: false,
        error: retryDecision.message,
        statusCode: result.statusCode,
      };
    }

    // Retry was scheduled
    log.info(`[BatchSync] Retry scheduled for ${item.id}: ${retryDecision.message}`);
    return {
      success: false,
      error: classification.errorMessage,
      statusCode: result.statusCode,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classification = retryService.classifyError(errorMessage, undefined);

    // Check if we should retry
    if (!classification.canRetry || !retryService.canRetry(item.id, currentAttempt)) {
      retryService.markRetryExhausted(item.id, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    // Schedule retry with exponential backoff
    const delayMs = retryService.calculateNextRetryDelay(currentAttempt);
    log.info(`[BatchSync] Retrying ${item.id} after ${delayMs}ms (attempt ${currentAttempt + 1}/${config.maxRetries})`);

    await sleep(delayMs);

    // Recursive call for retry - this will use updated attempt count
    return processSingleItem(apiClient, item, config);
  }
}

/**
 * Send a single item to the API
 */
async function sendToApi(
  apiClient: SyncApiClient,
  item: syncQueueService.SyncQueueItem
): Promise<ApiResponse<unknown>> {
  const { module, operation, recordId, data } = item;
  const payload = syncQueueService.buildSyncPayload(item);
  
  if (!payload) {
    return { success: false, error: 'Failed to build sync payload' };
  }

  // Parse the data to get year/month from record
  const parsedData = JSON.parse(data);
  const year = parsedData.tanggal ? new Date(parsedData.tanggal).getFullYear() : new Date().getFullYear();
  const month = parsedData.tanggal ? (new Date(parsedData.tanggal).getMonth() + 1).toString().padStart(2, '0') : '01';

  // Build the API path based on operation
  let method: string;
  let path: string;
  let body: unknown;

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
async function sendBatchToApi(
  apiClient: SyncApiClient,
  items: syncQueueService.SyncQueueItem[],
  atomic: boolean = false
): Promise<{
  success: boolean;
  results: Array<{ itemId: string; success: boolean; error?: string; statusCode?: number }>;
  error?: string;
}> {
  if (items.length === 0) {
    return { success: true, results: [] };
  }

  // Group items by module and periode for efficient batching
  const groupedByModuleAndPeriode = new Map<string, syncQueueService.SyncQueueItem[]>();
  
  for (const item of items) {
    const parsedData = JSON.parse(item.data);
    const year = parsedData.tanggal ? new Date(parsedData.tanggal).getFullYear() : new Date().getFullYear();
    const month = parsedData.tanggal ? (new Date(parsedData.tanggal).getMonth() + 1).toString().padStart(2, '0') : '01';
    const key = `${item.module}:${year}:${month}`;
    
    if (!groupedByModuleAndPeriode.has(key)) {
      groupedByModuleAndPeriode.set(key, []);
    }
    groupedByModuleAndPeriode.get(key)!.push(item);
  }

  const allResults: Array<{ itemId: string; success: boolean; error?: string }> = [];

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
      const response = await apiClient.request<{
        success: boolean;
        summary: { total: number; succeeded: number; failed: number };
        results: Array<{ index: number; operation: string; recordId?: string; success: boolean; error?: string }>;
        error?: string;
      }>('POST', '/api/batch', {
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
          } else {
            allResults.push({
              itemId: groupItems[i].id,
              success: false,
              error: 'Result not found in response',
            });
          }
        }
      } else {
        // Batch request failed - mark all items in this group as failed
        for (const item of groupItems) {
          allResults.push({
            itemId: item.id,
            success: false,
            error: response.error || response.data?.error || 'Batch request failed',
          });
        }
      }
    } catch (error) {
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
function createBatches(items: syncQueueService.SyncQueueItem[], batchSize: number): syncQueueService.SyncQueueItem[][] {
  const batches: syncQueueService.SyncQueueItem[][] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Report progress to callback
 */
function reportProgress(progress: BatchSyncProgress): void {
  if (currentProgressCallback) {
    try {
      currentProgressCallback(progress);
    } catch (error) {
      log.error('[BatchSync] Error in progress callback:', error);
    }
  }
}

/**
 * Estimate remaining time based on current progress
 */
function estimateRemainingTime(startTime: number, processed: number, total: number): number | null {
  if (processed === 0 || total === 0) return null;
  
  const elapsed = Date.now() - startTime;
  const rate = processed / elapsed; // items per ms
  const remaining = total - processed;
  
  return Math.round(remaining / rate);
}

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Retry Failed Items ============

/**
 * Retry failed items from a previous batch sync
 */
export async function retryFailedItems(
  apiClient: SyncApiClient,
  itemIds: string[],
  config?: Partial<BatchSyncConfig>
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const mergedConfig = { ...currentConfig, ...config };
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const itemId of itemIds) {
    if (isCancelled) break;

    const item = syncQueueService.getQueueItemById(itemId);
    if (!item) {
      log.warn(`[BatchSync] Item not found for retry: ${itemId}`);
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
      } else {
        syncQueueService.markFailed(itemId, result.error || 'Retry failed');
        errors.push(result.error || 'Unknown error');
        failed++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      syncQueueService.markFailed(itemId, errorMsg);
      errors.push(errorMsg);
      failed++;
    }
  }

  log.info(`[BatchSync] Retry completed: ${succeeded} succeeded, ${failed} failed`);

  return { succeeded, failed, errors };
}

/**
 * Retry items that failed in a specific batch
 */
export async function retryBatch(
  apiClient: SyncApiClient,
  batchResult: BatchResult,
  config?: Partial<BatchSyncConfig>
): Promise<BatchResult> {
  const mergedConfig = { ...currentConfig, ...config };
  
  log.info(`[BatchSync] Retrying batch ${batchResult.batchNumber} with ${batchResult.failedItemIds.length} failed items`);
  
  // Get the failed items
  const items: syncQueueService.SyncQueueItem[] = [];
  for (const itemId of batchResult.failedItemIds) {
    const item = syncQueueService.getQueueItemById(itemId);
    if (item) {
      items.push(item);
    }
  }

  // Process only the failed items
  let totalSucceeded = 0;
  let totalFailed = 0;
  const newFailedItemIds: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      const result = await processSingleItem(apiClient, item, mergedConfig);
      
      if (result.success) {
        syncQueueService.markSynced(item.id);
        totalSucceeded++;
      } else {
        syncQueueService.markFailed(item.id, result.error || 'Retry failed');
        newFailedItemIds.push(item.id);
        errors.push(result.error || 'Unknown error');
        totalFailed++;
      }
    } catch (error) {
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
export function createApiClient(baseUrl: string, authToken: string): SyncApiClient {
  return {
    baseUrl,
    authToken,
    async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
      try {
        const url = `${baseUrl}${path}`;
        const options: RequestInit = {
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
          const data = statusCode === 204 ? undefined : await response.json() as T | undefined;
          return { success: true, data, statusCode };
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          return {
            success: false,
            error: `HTTP ${statusCode}: ${errorText}`,
            statusCode
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`[BatchSync] API request failed: ${method} ${path}`, errorMsg);
        return { success: false, error: errorMsg };
      }
    },
  };
}

// ============ Utility Functions ============

/**
 * Get batch sync statistics
 */
export function getBatchSyncStats() {
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
export function validateConfig(config: Partial<BatchSyncConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

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

export default {
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
