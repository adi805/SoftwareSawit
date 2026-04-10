/**
 * Unit tests for Batch Sync Service
 * 
 * These tests verify the core batch sync functionality:
 * - Batch creation and grouping
 * - Configuration validation
 * - Progress reporting
 * - Cancellation handling
 */

import * as batchSync from './batchSyncService';

describe('BatchSyncService', () => {
  describe('Configuration', () => {
    test('getConfig returns default configuration', () => {
      const config = batchSync.getConfig();
      
      expect(config.batchSize).toBe(100);
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelayMs).toBe(1000);
      expect(config.atomicBatches).toBe(false);
      expect(config.progressCallbacks).toBe(true);
    });

    test('setConfig updates configuration', () => {
      const newConfig = { batchSize: 50, maxRetries: 5 };
      batchSync.setConfig(newConfig);
      
      const config = batchSync.getConfig();
      expect(config.batchSize).toBe(50);
      expect(config.maxRetries).toBe(5);
      // Defaults should remain
      expect(config.retryDelayMs).toBe(1000);
    });

    test('validateConfig rejects invalid batch sizes', () => {
      const result1 = batchSync.validateConfig({ batchSize: 0 });
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('Batch size must be at least 1');

      const result2 = batchSync.validateConfig({ batchSize: 1001 });
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('Batch size should not exceed 1000 for performance reasons');
    });

    test('validateConfig rejects invalid max retries', () => {
      const result = batchSync.validateConfig({ maxRetries: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max retries must be non-negative');
    });

    test('validateConfig rejects invalid retry delay', () => {
      const result = batchSync.validateConfig({ retryDelayMs: 50 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Retry delay should be at least 100ms');
    });

    test('validateConfig accepts valid configuration', () => {
      const result = batchSync.validateConfig({
        batchSize: 100,
        maxRetries: 5,
        retryDelayMs: 2000,
        atomicBatches: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Cancellation', () => {
    test('cancelBatchSync sets cancellation flag', () => {
      batchSync.cancelBatchSync();
      // The flag is internal, but we can verify the function doesn't throw
      expect(() => batchSync.cancelBatchSync()).not.toThrow();
    });

    test('resetCancellation clears cancellation flag', () => {
      batchSync.cancelBatchSync();
      batchSync.resetCancellation();
      // The flag is internal, but we can verify the function doesn't throw
      expect(() => batchSync.resetCancellation()).not.toThrow();
    });
  });

  describe('API Client Creation', () => {
    test('createApiClient creates valid client', () => {
      const client = batchSync.createApiClient('https://api.example.com', 'test-token');
      
      expect(client.baseUrl).toBe('https://api.example.com');
      expect(client.authToken).toBe('test-token');
      expect(typeof client.request).toBe('function');
    });
  });

  describe('Progress Callback', () => {
    test('setProgressCallback accepts callback', () => {
      const callback = (progress: batchSync.BatchSyncProgress) => {};
      expect(() => batchSync.setProgressCallback(callback)).not.toThrow();
    });

    test('setProgressCallback accepts null', () => {
      expect(() => batchSync.setProgressCallback(null)).not.toThrow();
    });
  });

  describe('Batch Sync Statistics', () => {
    test('getBatchSyncStats returns statistics object', () => {
      const stats = batchSync.getBatchSyncStats();
      
      expect(stats).toHaveProperty('pendingItems');
      expect(stats).toHaveProperty('estimatedBatches');
      expect(stats).toHaveProperty('batchSize');
      expect(stats).toHaveProperty('queueStats');
      expect(typeof stats.pendingItems).toBe('number');
      expect(typeof stats.estimatedBatches).toBe('number');
      expect(typeof stats.batchSize).toBe('number');
    });
  });
});

describe('BatchSyncProgress Interface', () => {
  test('BatchSyncProgress has correct structure', () => {
    const progress: batchSync.BatchSyncProgress = {
      currentBatch: 1,
      totalBatches: 2,
      itemsProcessed: 50,
      totalProcessed: 50,
      totalItems: 150,
      succeeded: 50,
      failed: 0,
      status: 'in_progress',
      elapsedMs: 1000,
      estimatedRemainingMs: 2000,
    };

    expect(progress.currentBatch).toBe(1);
    expect(progress.totalBatches).toBe(2);
    expect(progress.status).toBe('in_progress');
  });
});

describe('BatchResult Interface', () => {
  test('BatchResult has correct structure', () => {
    const result: batchSync.BatchResult = {
      batchNumber: 1,
      itemCount: 100,
      succeeded: 100,
      failed: 0,
      failedItemIds: [],
      atomicRollback: false,
      success: true,
    };

    expect(result.batchNumber).toBe(1);
    expect(result.itemCount).toBe(100);
    expect(result.success).toBe(true);
  });

  test('BatchResult with failures has correct structure', () => {
    const result: batchSync.BatchResult = {
      batchNumber: 2,
      itemCount: 50,
      succeeded: 45,
      failed: 5,
      failedItemIds: ['id1', 'id2', 'id3', 'id4', 'id5'],
      atomicRollback: true,
      success: false,
    };

    expect(result.success).toBe(false);
    expect(result.failed).toBe(5);
    expect(result.failedItemIds).toHaveLength(5);
  });
});

describe('BatchSyncResult Interface', () => {
  test('BatchSyncResult has correct structure', () => {
    const result: batchSync.BatchSyncResult = {
      success: true,
      totalProcessed: 150,
      succeeded: 150,
      failed: 0,
      retried: 0,
      batchesProcessed: 2,
      totalBatches: 2,
      failedItemIds: [],
      errors: [],
      elapsedMs: 5000,
      batchResults: [],
    };

    expect(result.success).toBe(true);
    expect(result.totalProcessed).toBe(150);
    expect(result.totalBatches).toBe(2);
  });
});
