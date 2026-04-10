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

import log from 'electron-log';
import * as syncDb from './syncDatabase';
import * as retryService from './retryService';

// Sync operation types
export type SyncOperationType = 'create' | 'update' | 'delete';

// Sync status for records (queue-level statuses)
export type SyncStatus = 'synced' | 'pending' | 'in_progress' | 'failed' | 'conflict' | 'error' | 'completed';

// Sync queue item for cloud sync
export interface SyncQueueItem {
  id: string;
  batchId: string | null;
  operation: SyncOperationType;
  module: string;
  recordId: string;
  data: string; // JSON stringified record data
  timestamp: string;
  status: 'pending' | 'in_progress' | 'failed' | 'completed' | 'error' | 'conflict' | 'synced';
  attempts: number;
  lastError: string | null;
}

// Sync batch for grouping operations
export interface SyncBatch {
  id: string;
  module: string;
  items: SyncQueueItem[];
  status: 'open' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
}

// Queue statistics
export interface QueueStats {
  pending: number;
  inProgress: number;
  failed: number;
  completed: number;
  total: number;
  byModule: Record<string, number>;
  oldestPendingTimestamp: string | null;
}

// Queue inspection result for debugging
export interface QueueInspection {
  statistics: QueueStats;
  recentItems: SyncQueueItem[];
  itemsByStatus: Record<string, SyncQueueItem[]>;
  batches: SyncBatch[];
}

// Create sync queue entry for an operation
export function queueSync(
  module: string,
  operation: SyncOperationType,
  recordId: string,
  data: Record<string, unknown>
): { success: boolean; message: string; queueItem?: SyncQueueItem } {
  try {
    const result = syncDb.addToSyncQueue(module, operation, recordId, data);
    
    if (result.success && result.item) {
      // Convert to our format
      const queueItem: SyncQueueItem = {
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
  } catch (error) {
    log.error('[SyncQueue] Failed to queue sync:', error);
    return { success: false, message: 'Failed to queue sync operation' };
  }
}

// Queue multiple operations as a batch (for efficient syncing)
export function queueSyncBatch(
  module: string,
  items: Array<{
    operation: SyncOperationType;
    recordId: string;
    data: Record<string, unknown>;
  }>
): { success: boolean; message: string; batchId: string; itemsAdded: number } {
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
  } catch (error) {
    log.error('[SyncQueue] Failed to queue sync batch:', error);
    return { success: false, message: 'Failed to queue sync batch', batchId: '', itemsAdded: 0 };
  }
}

// Get all pending sync items in FIFO order
export function getPendingItems(): SyncQueueItem[] {
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
      status: item.status as SyncStatus,
      attempts: item.attempts,
      lastError: item.lastError,
    }));
  } catch (error) {
    log.error('[SyncQueue] Failed to get pending items:', error);
    return [];
  }
}

// Get pending items for a specific module
export function getPendingItemsByModule(module: string): SyncQueueItem[] {
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
      status: item.status as SyncStatus,
      attempts: item.attempts,
      lastError: item.lastError,
    }));
  } catch (error) {
    log.error(`[SyncQueue] Failed to get pending items for module ${module}:`, error);
    return [];
  }
}

// Get sync queue statistics
export function getQueueStats(): QueueStats {
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
  } catch (error) {
    log.error('[SyncQueue] Failed to get queue stats:', error);
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
export function markInProgress(id: string): void {
  try {
    syncDb.markItemInProgress(id);
    log.info(`[SyncQueue] Marked as in_progress: ${id}`);
  } catch (error) {
    log.error(`[SyncQueue] Failed to mark in_progress: ${id}`, error);
  }
}

// Mark item as synced (completed)
export function markSynced(id: string): void {
  try {
    syncDb.markItemCompleted(id);
    log.info(`[SyncQueue] Marked as completed: ${id}`);
  } catch (error) {
    log.error(`[SyncQueue] Failed to mark completed: ${id}`, error);
  }
}

// Mark item as failed and calculate next retry time with exponential backoff
export function markFailed(id: string, errorMessage: string): void {
  try {
    // Get current item to check retry count
    const item = syncDb.getSyncQueueItemById(id);
    const currentAttempts = item?.attempts || 0;
    
    // Calculate next retry time using exponential backoff
    let nextRetryAt: string | null = null;
    
    // Only calculate if we haven't exceeded max retries
    if (retryService.canRetry(id, currentAttempts)) {
      const delayMs = retryService.calculateNextRetryDelay(currentAttempts);
      const nextRetryTime = new Date(Date.now() + delayMs);
      nextRetryAt = nextRetryTime.toISOString();
      
      log.info(`[SyncQueue] Calculated next retry for ${id} at ${nextRetryAt} (attempt ${currentAttempts + 1}, delay ${delayMs}ms)`);
    } else {
      log.warn(`[SyncQueue] Max retries reached for ${id}, marking as error`);
      // Mark as error instead of failed when max retries exceeded
      syncDb.updateSyncQueueItemStatus(id, 'error', errorMessage, null);
      return;
    }
    
    syncDb.updateSyncQueueItemStatus(id, 'failed', errorMessage, nextRetryAt);
    log.warn(`[SyncQueue] Marked as failed: ${id} - ${errorMessage}`);
  } catch (error) {
    log.error(`[SyncQueue] Failed to mark failed: ${id}`, error);
  }
}

// Retry a specific failed item
export function retryItem(id: string): { success: boolean; message: string } {
  try {
    return syncDb.retryItem(id);
  } catch (error) {
    log.error(`[SyncQueue] Failed to retry item: ${id}`, error);
    return { success: false, message: 'Failed to retry item' };
  }
}

// Retry all failed items
export function retryAllFailed(): { success: boolean; message: string; retriedCount: number } {
  try {
    return syncDb.retryAllFailed();
  } catch (error) {
    log.error('[SyncQueue] Failed to retry all failed:', error);
    return { success: false, message: 'Failed to retry items', retriedCount: 0 };
  }
}

// Clear all sync queue items
export function clearQueue(): { success: boolean; message: string; removedCount: number } {
  try {
    return syncDb.clearSyncQueue();
  } catch (error) {
    log.error('[SyncQueue] Failed to clear queue:', error);
    return { success: false, message: 'Failed to clear queue', removedCount: 0 };
  }
}

// Remove completed items from queue (cleanup)
export function removeCompletedItems(): { success: boolean; message: string; removedCount: number } {
  try {
    return syncDb.removeCompletedItems();
  } catch (error) {
    log.error('[SyncQueue] Failed to remove completed items:', error);
    return { success: false, message: 'Failed to remove completed items', removedCount: 0 };
  }
}

// ============ Batch Operations ============

// Create a new batch for grouping operations
export function createBatch(module: string): { success: boolean; batchId: string; message: string } {
  try {
    return syncDb.createSyncBatch(module);
  } catch (error) {
    log.error('[SyncQueue] Failed to create batch:', error);
    return { success: false, batchId: '', message: 'Failed to create batch' };
  }
}

// Get batch by ID
export function getBatch(batchId: string): SyncBatch | null {
  try {
    const batch = syncDb.getSyncBatch(batchId);
    if (!batch) return null;
    
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
        status: item.status as SyncStatus,
        attempts: item.attempts,
        lastError: item.lastError,
      })),
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      itemCount: batch.itemCount,
    };
  } catch (error) {
    log.error(`[SyncQueue] Failed to get batch: ${batchId}`, error);
    return null;
  }
}

// Get all open batches
export function getOpenBatches(): SyncBatch[] {
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
        status: item.status as SyncStatus,
        attempts: item.attempts,
        lastError: item.lastError,
      })),
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      itemCount: batch.itemCount,
    }));
  } catch (error) {
    log.error('[SyncQueue] Failed to get open batches:', error);
    return [];
  }
}

// Update batch status
export function updateBatchStatus(batchId: string, status: 'open' | 'processing' | 'completed' | 'failed'): void {
  try {
    syncDb.updateBatchStatus(batchId, status);
  } catch (error) {
    log.error(`[SyncQueue] Failed to update batch status: ${batchId}`, error);
  }
}

// ============ Inspection & Debugging ============

// Inspect entire queue state
export function inspectQueue(): QueueInspection {
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
        status: item.status as SyncStatus,
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
          status: item.status as SyncStatus,
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
          status: item.status as SyncStatus,
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
          status: item.status as SyncStatus,
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
          status: item.status as SyncStatus,
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
          status: item.status as SyncStatus,
          attempts: item.attempts,
          lastError: item.lastError,
        })),
        status: batch.status,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
        itemCount: batch.itemCount,
      })),
    };
  } catch (error) {
    log.error('[SyncQueue] Failed to inspect queue:', error);
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
export function exportQueueState(): string {
  try {
    return syncDb.exportQueueState();
  } catch (error) {
    log.error('[SyncQueue] Failed to export queue state:', error);
    return JSON.stringify({ error: 'Failed to export queue state' });
  }
}

// Get queue health status
export function getQueueHealth(): { healthy: boolean; issues: string[]; warnings: string[] } {
  try {
    return syncDb.getQueueHealth();
  } catch (error) {
    log.error('[SyncQueue] Failed to get queue health:', error);
    return { healthy: false, issues: ['Failed to check queue health'], warnings: [] };
  }
}

// Get a single item by ID
export function getQueueItemById(id: string): SyncQueueItem | null {
  try {
    const item = syncDb.getSyncQueueItemById(id);
    if (!item) return null;
    
    return {
      id: item.id,
      batchId: item.batchId,
      operation: item.operation,
      module: item.module,
      recordId: item.recordId,
      data: item.data,
      timestamp: item.timestamp,
      status: item.status as SyncStatus,
      attempts: item.attempts,
      lastError: item.lastError,
    };
  } catch (error) {
    log.error(`[SyncQueue] Failed to get queue item: ${id}`, error);
    return null;
  }
}

// Build sync data for cloud upload
export interface SyncPayload {
  module: string;
  operation: SyncOperationType;
  recordId: string;
  data: Record<string, unknown>;
  timestamp: string;
  deviceId: string;
}

export function buildSyncPayload(item: SyncQueueItem): SyncPayload | null {
  try {
    const data = JSON.parse(item.data) as Record<string, unknown>;
    return {
      module: item.module,
      operation: item.operation,
      recordId: item.recordId,
      data,
      timestamp: item.timestamp,
      deviceId: getDeviceId(),
    };
  } catch (error) {
    log.error('[SyncQueue] Failed to build sync payload:', error);
    return null;
  }
}

// Get device ID - generates a unique device identifier
let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  
  // Generate a unique device ID based on timestamp + random
  // This provides a stable ID within a session but regenerates on app restart
  // For persistent device ID across sessions, would need electron-store integration
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  cachedDeviceId = `device-${timestamp}-${randomPart}`;
  
  log.info(`[SyncQueue] Generated device ID: ${cachedDeviceId}`);
  return cachedDeviceId;
}

// Get current timestamp for sync operations
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// Format date for transaction tables (YYYY-MM-DD)
export function formatDateForDb(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Parse date from various formats
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
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
export function isValidSyncStatus(status: string): status is SyncStatus {
  return ['synced', 'pending', 'in_progress', 'conflict', 'error', 'completed'].includes(status);
}

// Get human-readable sync status message
export function getSyncStatusMessage(status: SyncStatus): string {
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
export function getStatusDisplay(status: string): { label: string; color: string; icon: string } {
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

export default {
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
