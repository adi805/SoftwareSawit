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

import log from 'electron-log';
import * as syncQueueService from './syncQueueService';
import * as syncDb from './syncDatabase';
import * as retryService from './retryService';

// ============ Types & Interfaces ============

// Sync statistics summary
export interface SyncStats {
  pending: number;
  inProgress: number;
  failed: number;
  completed: number;
  total: number;
  oldestPendingTimestamp: string | null;
}

// Per-module sync status
export interface ModuleSyncStatus {
  module: string;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  syncState: 'synced' | 'pending' | 'error' | 'not_configured';
  isConfigured: boolean;
  isEnabled: boolean;
}

// Failed item with retry information
export interface FailedItem {
  id: string;
  module: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  // Exponential backoff info
  nextRetryAt: string | null;
  canRetry: boolean;
  maxRetries: number;
  retryDelayMs: number | null;
  retryDelayFormatted: string | null;
  // Status
  status: 'failed' | 'error';
}

// Failed items list result
export interface FailedItemsResult {
  items: FailedItem[];
  totalCount: number;
  totalRetriedCount: number;
}

// Retry result
export interface RetryResult {
  success: boolean;
  message: string;
  itemId?: string;
  retriedCount?: number;
}

// ============ API Implementations ============

/**
 * Get sync statistics - accurate counts for pending, failed, total
 */
export function getSyncStats(): SyncStats {
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
  } catch (error) {
    log.error('[SyncHealth] Failed to get sync stats:', error);
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
export function getModuleSyncStatus(): { success: boolean; modules: Record<string, ModuleSyncStatus>; message?: string } {
  try {
    const stats = syncQueueService.getQueueStats();
    const configs = syncDb.getAllSyncConfigs();
    
    const modules = ['kas', 'bank', 'gudang', 'coa', 'aspek_kerja', 'blok'];
    const moduleSyncStatus: Record<string, ModuleSyncStatus> = {};

    for (const mod of modules) {
      const config = configs.find(c => c.module === mod);
      const pendingCount = stats.byModule[mod] || 0;
      
      // Determine sync state
      let syncState: 'synced' | 'pending' | 'error' | 'not_configured';
      if (!config || !config.enabled) {
        syncState = 'not_configured';
      } else if (pendingCount > 0) {
        syncState = 'pending';
      } else {
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
  } catch (error) {
    log.error('[SyncHealth] Failed to get module sync status:', error);
    return { success: false, modules: {}, message: 'Failed to get module sync status' };
  }
}

/**
 * Get list of failed items with retry information including exponential backoff
 */
export function getFailedItems(options?: {
  module?: string;
  limit?: number;
  offset?: number;
}): FailedItemsResult {
  try {
    const { module, limit = 100, offset = 0 } = options || {};
    
    // Get failed items from sync database
    const allFailed = syncDb.getSyncQueueStats();
    
    // Get the actual failed items - we'll query them directly
    let failedItems: syncQueueService.SyncQueueItem[] = [];
    
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
    const items: FailedItem[] = paginatedItems.map(item => {
      // Calculate retry info
      const canRetry = retryService.canRetry(item.id, item.attempts);
      let nextRetryAt: string | null = null;
      let retryDelayMs: number | null = null;
      let retryDelayFormatted: string | null = null;
      
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
  } catch (error) {
    log.error('[SyncHealth] Failed to get failed items:', error);
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
export function retryFailedItem(itemId: string): RetryResult {
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
      log.info(`[SyncHealth] Retried failed item: ${itemId}`);
    }
    
    return {
      success: result.success,
      message: result.message,
      itemId,
    };
  } catch (error) {
    log.error(`[SyncHealth] Failed to retry item ${itemId}:`, error);
    return { success: false, message: 'Gagal meretry item' };
  }
}

/**
 * Retry all failed items - resets all to pending
 */
export function retryAllFailed(): RetryResult {
  try {
    const result = syncQueueService.retryAllFailed();
    
    if (result.success) {
      log.info(`[SyncHealth] Retried all failed items: ${result.retriedCount}`);
    }
    
    return {
      success: result.success,
      message: result.message,
      retriedCount: result.retriedCount,
    };
  } catch (error) {
    log.error('[SyncHealth] Failed to retry all failed items:', error);
    return { success: false, message: 'Gagal meretry semua item gagal' };
  }
}

/**
 * Get retry configuration info for display
 */
export function getRetryConfig(): {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  retrySequence: number[];
  retrySequenceFormatted: string[];
} {
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
export function getQueueHealth(): {
  healthy: boolean;
  issues: string[];
  warnings: string[];
} {
  try {
    return syncQueueService.getQueueHealth();
  } catch (error) {
    log.error('[SyncHealth] Failed to get queue health:', error);
    return { healthy: false, issues: ['Failed to check queue health'], warnings: [] };
  }
}

/**
 * Get comprehensive health dashboard data
 */
export function getHealthDashboardData(): {
  stats: SyncStats;
  moduleStatus: Record<string, ModuleSyncStatus>;
  health: { healthy: boolean; issues: string[]; warnings: string[] };
  retryConfig: ReturnType<typeof getRetryConfig>;
  failedItemsCount: number;
} {
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
export default {
  getSyncStats,
  getModuleSyncStatus,
  getFailedItems,
  retryFailedItem,
  retryAllFailed,
  getRetryConfig,
  getQueueHealth,
  getHealthDashboardData,
};
