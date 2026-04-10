/**
 * Unit tests for Sync Health Dashboard Service (F014-BE)
 * 
 * These tests verify the sync health dashboard APIs:
 * - getSyncStats: accurate counts (pending, failed, total)
 * - getModuleSyncStatus: per-module breakdown
 * - getFailedItems: list with retry info including exponential backoff
 * - retryFailedItem: reset status to pending
 * - retryAllFailed: retry all failed items
 */

import * as syncHealthDashboard from './syncHealthDashboard';
import * as syncDb from './syncDatabase';
import * as syncQueueService from './syncQueueService';
import * as retryService from './retryService';

// Mock the dependencies
jest.mock('./syncDatabase', () => ({
  getAllSyncConfigs: jest.fn(),
  getSyncQueueStats: jest.fn(),
  inspectQueue: jest.fn(),
  getSyncQueueItemById: jest.fn(),
}));

jest.mock('./syncQueueService', () => ({
  getQueueStats: jest.fn(),
  getQueueHealth: jest.fn(),
  retryItem: jest.fn(),
  retryAllFailed: jest.fn(),
}));

jest.mock('./retryService', () => ({
  getConfig: jest.fn(),
  getRetrySequence: jest.fn(),
  canRetry: jest.fn(),
  calculateNextRetryDelay: jest.fn(),
  formatDelay: jest.fn(),
}));

describe('SyncHealthDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset retry service config
    retryService.getConfig.mockReturnValue({
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      multiplier: 2,
      jitterFactor: 0,
    });
  });

  describe('getSyncStats', () => {
    test('returns accurate counts for pending, failed, total', () => {
      // Setup mock
      syncQueueService.getQueueStats.mockReturnValue({
        pending: 10,
        inProgress: 2,
        failed: 3,
        completed: 100,
        total: 115,
        byModule: { kas: 5, bank: 5, gudang: 3 },
        oldestPendingTimestamp: '2024-01-15T10:00:00Z',
      });

      const stats = syncHealthDashboard.getSyncStats();

      expect(stats.pending).toBe(10);
      expect(stats.inProgress).toBe(2);
      expect(stats.failed).toBe(3);
      expect(stats.completed).toBe(100);
      expect(stats.total).toBe(115);
      expect(stats.oldestPendingTimestamp).toBe('2024-01-15T10:00:00Z');
    });

    test('returns zeros when queue is empty', () => {
      syncQueueService.getQueueStats.mockReturnValue({
        pending: 0,
        inProgress: 0,
        failed: 0,
        completed: 0,
        total: 0,
        byModule: {},
        oldestPendingTimestamp: null,
      });

      const stats = syncHealthDashboard.getSyncStats();

      expect(stats.pending).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.oldestPendingTimestamp).toBeNull();
    });

    test('handles errors gracefully', () => {
      syncQueueService.getQueueStats.mockImplementation(() => {
        throw new Error('Database error');
      });

      const stats = syncHealthDashboard.getSyncStats();

      expect(stats.pending).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('getModuleSyncStatus', () => {
    test('returns per-module breakdown with correct status', () => {
      syncDb.getAllSyncConfigs.mockReturnValue([
        { id: '1', module: 'kas', remotePath: '\\\\server\\share', enabled: true, lastSyncAt: '2024-01-15T10:00:00Z', createdAt: '', updatedAt: '' },
        { id: '2', module: 'bank', remotePath: '\\\\server\\share', enabled: true, lastSyncAt: '2024-01-15T10:00:00Z', createdAt: '', updatedAt: '' },
        { id: '3', module: 'coa', remotePath: '\\\\server\\share', enabled: false, lastSyncAt: null, createdAt: '', updatedAt: '' },
      ]);

      syncQueueService.getQueueStats.mockReturnValue({
        pending: 10,
        inProgress: 0,
        failed: 0,
        completed: 0,
        total: 10,
        byModule: { kas: 5, bank: 3 },
        oldestPendingTimestamp: null,
      });

      const result = syncHealthDashboard.getModuleSyncStatus();

      expect(result.success).toBe(true);
      expect(result.modules.kas.syncState).toBe('pending');
      expect(result.modules.kas.pendingCount).toBe(5);
      expect(result.modules.kas.isConfigured).toBe(true);
      expect(result.modules.kas.isEnabled).toBe(true);

      expect(result.modules.bank.syncState).toBe('pending');
      expect(result.modules.bank.pendingCount).toBe(3);
      expect(result.modules.bank.isConfigured).toBe(true);
      expect(result.modules.bank.isEnabled).toBe(true);

      expect(result.modules.coa.syncState).toBe('not_configured');
      expect(result.modules.coa.isConfigured).toBe(true);
      expect(result.modules.coa.isEnabled).toBe(false);

      // Module not in config list is marked as not_configured
      expect(result.modules.gudang.syncState).toBe('not_configured');
      expect(result.modules.gudang.isConfigured).toBe(false);
    });

    test('marks module as synced when no pending items', () => {
      syncDb.getAllSyncConfigs.mockReturnValue([
        { id: '1', module: 'kas', remotePath: '\\\\server\\share', enabled: true, lastSyncAt: '2024-01-15T10:00:00Z', createdAt: '', updatedAt: '' },
      ]);

      syncQueueService.getQueueStats.mockReturnValue({
        pending: 0,
        inProgress: 0,
        failed: 0,
        completed: 0,
        total: 0,
        byModule: {},
        oldestPendingTimestamp: null,
      });

      const result = syncHealthDashboard.getModuleSyncStatus();

      expect(result.success).toBe(true);
      expect(result.modules.kas.syncState).toBe('synced');
      expect(result.modules.kas.pendingCount).toBe(0);
    });
  });

  describe('getFailedItems', () => {
    test('handles empty failed items list', () => {
      syncDb.inspectQueue.mockReturnValue({
        statistics: { pending: 0, inProgress: 0, failed: 0, completed: 0, total: 0, byModule: {}, oldestPendingTimestamp: null },
        recentItems: [],
        itemsByStatus: { pending: [], in_progress: [], failed: [], completed: [], error: [] },
        batches: [],
      });

      const result = syncHealthDashboard.getFailedItems();

      expect(result.items).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.totalRetriedCount).toBe(0);
    });
  });

  describe('retryFailedItem', () => {
    test('resets failed item status to pending', () => {
      syncDb.getSyncQueueItemById.mockReturnValue({
        id: 'item-1',
        batchId: null,
        module: 'kas',
        operation: 'create' as const,
        recordId: 'record-1',
        data: '{}',
        timestamp: '2024-01-15T10:00:00Z',
        status: 'failed' as const,
        attempts: 2,
        lastError: 'Connection refused',
      });

      syncQueueService.retryItem.mockReturnValue({ success: true, message: 'Item akan di-retry' });

      const result = syncHealthDashboard.retryFailedItem('item-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Item akan di-retry');
      expect(result.itemId).toBe('item-1');
    });

    test('returns error when item not found', () => {
      syncDb.getSyncQueueItemById.mockReturnValue(null);

      const result = syncHealthDashboard.retryFailedItem('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Item tidak ditemukan');
    });

    test('returns error when item is not in failed status', () => {
      syncDb.getSyncQueueItemById.mockReturnValue({
        id: 'item-1',
        status: 'completed',
      });

      const result = syncHealthDashboard.retryFailedItem('item-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Tidak dapat retry');
    });
  });

  describe('retryAllFailed', () => {
    test('retries all failed items', () => {
      syncQueueService.retryAllFailed.mockReturnValue({
        success: true,
        message: '5 item gagal di-reset untuk retry',
        retriedCount: 5,
      });

      const result = syncHealthDashboard.retryAllFailed();

      expect(result.success).toBe(true);
      expect(result.message).toBe('5 item gagal di-reset untuk retry');
      expect(result.retriedCount).toBe(5);
    });

    test('handles no failed items to retry', () => {
      syncQueueService.retryAllFailed.mockReturnValue({
        success: true,
        message: 'Tidak ada item gagal untuk di-retry',
        retriedCount: 0,
      });

      const result = syncHealthDashboard.retryAllFailed();

      expect(result.success).toBe(true);
      expect(result.retriedCount).toBe(0);
    });
  });

  describe('getRetryConfig', () => {
    test('returns retry configuration with sequence', () => {
      retryService.getRetrySequence.mockReturnValue([1000, 2000, 4000, 8000, 16000]);
      retryService.formatDelay.mockImplementation((delayMs: number) => {
        if (delayMs < 1000) return `${delayMs}ms`;
        if (delayMs < 60000) return `${delayMs / 1000}s`;
        return `${delayMs / 60000}m`;
      });

      const config = syncHealthDashboard.getRetryConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(300000);
      expect(config.multiplier).toBe(2);
      expect(config.retrySequence).toEqual([1000, 2000, 4000, 8000, 16000]);
      expect(config.retrySequenceFormatted).toEqual(['1s', '2s', '4s', '8s', '16s']);
    });
  });

  describe('getQueueHealth', () => {
    test('returns healthy status when no issues', () => {
      syncQueueService.getQueueHealth.mockReturnValue({
        healthy: true,
        issues: [],
        warnings: ['Completed items cleanup recommended'],
      });

      const health = syncHealthDashboard.getQueueHealth();

      expect(health.healthy).toBe(true);
      expect(health.issues).toEqual([]);
      expect(health.warnings).toContain('Completed items cleanup recommended');
    });

    test('returns unhealthy status when issues present', () => {
      syncQueueService.getQueueHealth.mockReturnValue({
        healthy: false,
        issues: ['High number of failed items: 15'],
        warnings: [],
      });

      const health = syncHealthDashboard.getQueueHealth();

      expect(health.healthy).toBe(false);
      expect(health.issues).toContain('High number of failed items: 15');
    });
  });

  describe('getHealthDashboardData', () => {
    test('returns comprehensive health dashboard data', () => {
      syncQueueService.getQueueStats.mockReturnValue({
        pending: 10,
        inProgress: 2,
        failed: 3,
        completed: 100,
        total: 115,
        byModule: { kas: 5 },
        oldestPendingTimestamp: '2024-01-15T10:00:00Z',
      });

      syncDb.getAllSyncConfigs.mockReturnValue([]);
      syncQueueService.getQueueHealth.mockReturnValue({
        healthy: true,
        issues: [],
        warnings: [],
      });

      syncDb.inspectQueue.mockReturnValue({
        statistics: { pending: 0, inProgress: 0, failed: 3, completed: 0, total: 3, byModule: {}, oldestPendingTimestamp: null },
        recentItems: [],
        itemsByStatus: { pending: [], in_progress: [], failed: [], completed: [], error: [] },
        batches: [],
      });

      retryService.canRetry.mockReturnValue(true);
      retryService.calculateNextRetryDelay.mockReturnValue(1000);
      retryService.formatDelay.mockReturnValue('1s');

      const data = syncHealthDashboard.getHealthDashboardData();

      expect(data.stats.pending).toBe(10);
      expect(data.stats.failed).toBe(3);
      expect(data.health.healthy).toBe(true);
      expect(data.retryConfig.maxRetries).toBe(5);
      expect(data.failedItemsCount).toBe(0);
    });
  });
});
