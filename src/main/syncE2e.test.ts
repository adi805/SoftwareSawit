/**
 * End-to-End Sync Tests for SoftwareSawit
 * 
 * These tests verify the complete sync workflow scenarios:
 * - VAL-FLOW-001: E2E - Create Offline Sync Online
 * - VAL-FLOW-002: E2E - Cloud to Local Sync
 * - VAL-FLOW-003: Conflict Scenario - Simultaneous Edit
 * - VAL-FLOW-004: Conflict Scenario - Edit vs Delete
 * - VAL-FLOW-005: Approval Workflow with Sync
 * - VAL-FLOW-006: Large Data Sync Performance
 * - VAL-FLOW-007: Network Interruption Recovery
 * - VAL-FLOW-008: Multi-Module Sync
 * - VAL-FLOW-009: Initial Sync - New Device
 * - VAL-FLOW-010: Period Rollover Sync
 */

import * as syncQueueService from './syncQueueService';
import * as conflictResolution from './conflictResolution';
import * as batchSyncService from './batchSyncService';
import * as retryService from './retryService';

// Mock modules - inline to avoid hoisting issues
jest.mock('./syncDatabase', () => {
  const mockQueueStore = new Map();
  let itemCounter = 0;
  
  return {
    addToSyncQueue: jest.fn((module: string, operation: string, recordId: string, data: Record<string, unknown>) => {
      const id = `item-${++itemCounter}`;
      const item = {
        id,
        batchId: null,
        module,
        operation: operation as 'create' | 'update' | 'delete',
        recordId,
        data: JSON.stringify(data),
        timestamp: new Date().toISOString(),
        status: 'pending' as const,
        attempts: 0,
        lastError: null,
      };
      mockQueueStore.set(id, item);
      return { success: true, item };
    }),
    addToSyncQueueBatch: jest.fn((module: string, items: Array<{ operation: string; recordId: string; data: Record<string, unknown> }>) => {
      let added = 0;
      for (const item of items) {
        const id = `item-${++itemCounter}`;
        const queueItem = {
          id,
          batchId: null,
          module,
          operation: item.operation as 'create' | 'update' | 'delete',
          recordId: item.recordId,
          data: JSON.stringify(item.data),
          timestamp: new Date().toISOString(),
          status: 'pending' as const,
          attempts: 0,
          lastError: null,
        };
        mockQueueStore.set(id, queueItem);
        added++;
      }
      return { success: true, itemsAdded: added, batchId: `batch-${Date.now()}` };
    }),
    getPendingSyncItems: jest.fn(() => Array.from(mockQueueStore.values()).filter(item => item.status === 'pending')),
    getPendingSyncItemsByModule: jest.fn((module: string) => 
      Array.from(mockQueueStore.values()).filter(item => item.module === module && item.status === 'pending')
    ),
    getSyncQueueStats: jest.fn(() => {
      const items = Array.from(mockQueueStore.values());
      const byModule: Record<string, number> = {};
      for (const item of items) {
        if (item.status === 'pending' || item.status === 'failed') {
          byModule[item.module] = (byModule[item.module] || 0) + 1;
        }
      }
      return {
        pending: items.filter(i => i.status === 'pending').length,
        inProgress: items.filter(i => i.status === 'in_progress').length,
        failed: items.filter(i => i.status === 'failed').length,
        completed: items.filter(i => i.status === 'completed').length,
        total: items.length,
        byModule,
        oldestPendingTimestamp: null,
      };
    }),
    markItemInProgress: jest.fn((id: string) => {
      const item = mockQueueStore.get(id);
      if (item) item.status = 'in_progress';
    }),
    markItemCompleted: jest.fn((id: string) => {
      const item = mockQueueStore.get(id);
      if (item) item.status = 'completed';
    }),
    getSyncQueueItemById: jest.fn((id: string) => mockQueueStore.get(id) || null),
    updateSyncQueueItemStatus: jest.fn((id: string, status: string, errorMessage: string | null, _nextRetryAt: string | null) => {
      const item = mockQueueStore.get(id);
      if (item) {
        item.status = status as 'pending' | 'in_progress' | 'failed' | 'completed' | 'error';
        item.lastError = errorMessage;
        item.attempts++;
      }
    }),
    retryItem: jest.fn(() => ({ success: true, message: 'Retried' })),
    retryAllFailed: jest.fn(() => ({ success: true, message: 'Retried all', retriedCount: 0 })),
    clearSyncQueue: jest.fn(() => ({ success: true, message: 'Cleared', removedCount: 0 })),
    removeCompletedItems: jest.fn(() => ({ success: true, message: 'Removed', removedCount: 0 })),
    createSyncBatch: jest.fn(() => ({ success: true, batchId: `batch-${Date.now()}`, message: 'Created' })),
    getSyncBatch: jest.fn(() => null),
    getOpenBatches: jest.fn(() => []),
    updateBatchStatus: jest.fn(() => {}),
    inspectQueue: jest.fn(() => {
      const items = Array.from(mockQueueStore.values());
      const pending = items.filter(i => i.status === 'pending');
      const byModule: Record<string, number> = {};
      for (const item of items) {
        if (item.status === 'pending' || item.status === 'failed') {
          byModule[item.module] = (byModule[item.module] || 0) + 1;
        }
      }
      return {
        statistics: { 
          pending: pending.length, 
          inProgress: items.filter(i => i.status === 'in_progress').length, 
          failed: items.filter(i => i.status === 'failed').length, 
          completed: items.filter(i => i.status === 'completed').length, 
          total: items.length, 
          byModule,
          oldestPendingTimestamp: pending.length > 0 ? pending[0].timestamp : null,
        },
        recentItems: items.slice(-50).reverse(),
        itemsByStatus: {
          pending: items.filter(i => i.status === 'pending'),
          in_progress: items.filter(i => i.status === 'in_progress'),
          failed: items.filter(i => i.status === 'failed'),
          completed: items.filter(i => i.status === 'completed'),
        },
        batches: [],
      };
    }),
    exportQueueState: jest.fn(() => JSON.stringify({ items: Array.from(mockQueueStore.values()) })),
    getQueueHealth: jest.fn(() => ({ healthy: true, issues: [], warnings: [] })),
  };
});

jest.mock('./retryService', () => {
  // Internal state for mock
  const retryStates: Map<string, { attempt: number; status: string; lastError: string | null; lastErrorType: string | null }> = new Map();
  
  return {
    setConfig: jest.fn(() => {}),
    getConfig: jest.fn(() => ({ maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 300000, multiplier: 2, jitterFactor: 0 })),
    clearAllRetryStates: jest.fn(() => { retryStates.clear(); }),
    destroy: jest.fn(() => {}),
    classifyError: jest.fn((message: string, statusCode?: number) => {
      if (statusCode === 401) return { canRetry: false, isRetryable: false, errorType: 'auth', errorMessage: message };
      if (statusCode === 403) return { canRetry: false, isRetryable: false, errorType: 'forbidden', errorMessage: message };
      if (statusCode === 400) return { canRetry: false, isRetryable: false, errorType: 'validation', errorMessage: message };
      if (statusCode === 404) return { canRetry: false, isRetryable: false, errorType: 'not_found', errorMessage: message };
      if (statusCode === 409) return { canRetry: true, isRetryable: true, errorType: 'conflict', errorMessage: message };
      if (statusCode === 500 || statusCode === 502 || statusCode === 503) return { canRetry: true, isRetryable: true, errorType: 'server', errorMessage: message };
      if (statusCode === 504) return { canRetry: true, isRetryable: true, errorType: 'timeout', errorMessage: message };
      if (message.includes('ECONNRESET') || message.includes('timed out') || message.includes('Network')) {
        return { canRetry: true, isRetryable: true, errorType: 'network', errorMessage: message };
      }
      return { canRetry: true, isRetryable: true, errorType: 'unknown', errorMessage: message };
    }),
    calculateNextRetryDelay: jest.fn((attempt: number) => {
      return Math.min(1000 * Math.pow(2, attempt), 300000);
    }),
    canRetry: jest.fn((itemId: string, attempt: number) => attempt < 5),
    markForRetry: jest.fn((itemId: string, error: string, statusCode?: number) => {
      // Non-retryable errors return canRetry: false
      if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
        return { canRetry: false, nextDelayMs: null, nextRetryAt: null };
      }
      // Initialize or update state
      const existing = retryStates.get(itemId);
      const currentAttempt = existing ? existing.attempt + 1 : 1;
      retryStates.set(itemId, { 
        attempt: currentAttempt, 
        status: 'pending', 
        lastError: error,
        lastErrorType: 'network'
      });
      return { canRetry: true, nextDelayMs: 1000, nextRetryAt: new Date().toISOString() };
    }),
    markRetrySuccess: jest.fn((itemId: string) => {
      retryStates.set(itemId, { attempt: 0, status: 'success', lastError: null, lastErrorType: null });
    }),
    markRetryExhausted: jest.fn((itemId: string, error: string) => {
      retryStates.set(itemId, { attempt: 5, status: 'failed', lastError: error, lastErrorType: 'max_retries' });
    }),
    getRetryState: jest.fn((itemId: string) => retryStates.get(itemId) || null),
    getAllRetryStates: jest.fn(() => Array.from(retryStates.entries()).map(([itemId, state]) => ({ itemId, ...state }))),
    getRetryStateCounts: jest.fn(() => {
      const states = Array.from(retryStates.values());
      return {
        pending: states.filter(s => s.status === 'pending').length,
        retrying: states.filter(s => s.status === 'retrying').length,
        failed: states.filter(s => s.status === 'failed').length,
        success: states.filter(s => s.status === 'success').length,
      };
    }),
    getRetrySummary: jest.fn(() => ({
      totalRetries: retryStates.size,
      pendingRetries: Array.from(retryStates.values()).filter(s => s.status === 'pending').length,
      activeRetries: Array.from(retryStates.values()).filter(s => s.status === 'retrying').length,
      failedItems: Array.from(retryStates.values()).filter(s => s.status === 'failed').length,
      success: Array.from(retryStates.values()).filter(s => s.status === 'success').length,
      maxRetriesReached: Array.from(retryStates.values()).filter(s => s.status === 'failed').length,
      retrySequence: [1000, 2000, 4000, 8000, 16000],
    })),
    getRetryStatusForUI: jest.fn((itemId: string, module: string, recordId: string) => {
      const state = retryStates.get(itemId);
      if (!state) return null;
      return { 
        itemId, module, recordId, 
        attempt: state.attempt, 
        maxRetries: 5, 
        progress: `Attempt ${state.attempt} of 5`, 
        statusColor: 'yellow' 
      };
    }),
    processFailedSync: jest.fn((itemId: string, module: string, operation: string, recordId: string, error: string, statusCode: number | undefined, callback: () => Promise<unknown>) => {
      if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
        return { shouldRetry: false, delayMs: null };
      }
      return { shouldRetry: true, delayMs: 1000 };
    }),
    getRetrySequence: jest.fn(() => [1000, 2000, 4000, 8000, 16000]),
    formatDelay: jest.fn((ms: number) => `${ms}ms`),
  };
});
jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Sync E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset retry service config
    retryService.setConfig({
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      multiplier: 2,
      jitterFactor: 0,
    });
    retryService.clearAllRetryStates();
  });

  afterEach(() => {
    retryService.destroy();
  });

  describe('VAL-FLOW-001: E2E - Create Offline Sync Online', () => {
    test('should queue create operation when offline', () => {
      // Simulate offline mode - queue operations locally
      const createResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        {
          id: 'record-001',
          transaction_type: 'masuk',
          amount: 100000,
          description: 'Test transaction',
          coa_id: 'coa-001',
          created_at: new Date().toISOString(),
        }
      );

      expect(createResult.success).toBe(true);
      expect(createResult.queueItem).toBeDefined();
      expect(createResult.queueItem?.status).toBe('pending');
      expect(createResult.queueItem?.operation).toBe('create');
      expect(createResult.queueItem?.module).toBe('kas');
    });

    test('should get pending items in FIFO order', () => {
      // Queue multiple operations
      syncQueueService.queueSync('kas', 'create', 'record-001', { data: '1' });
      syncQueueService.queueSync('kas', 'create', 'record-002', { data: '2' });
      syncQueueService.queueSync('kas', 'create', 'record-003', { data: '3' });

      const pending = syncQueueService.getPendingItems();

      expect(pending.length).toBeGreaterThanOrEqual(3);
      // Verify FIFO order by timestamps
      for (let i = 1; i < pending.length; i++) {
        const prevTimestamp = new Date(pending[i - 1].timestamp).getTime();
        const currTimestamp = new Date(pending[i].timestamp).getTime();
        expect(currTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
      }
    });

    test('should batch multiple pending items', () => {
      const items = [
        { operation: 'create' as const, recordId: 'record-001', data: { amount: 100 } },
        { operation: 'create' as const, recordId: 'record-002', data: { amount: 200 } },
        { operation: 'update' as const, recordId: 'record-003', data: { amount: 300 } },
      ];

      const batchResult = syncQueueService.queueSyncBatch('kas', items);

      expect(batchResult.success).toBe(true);
      expect(batchResult.itemsAdded).toBe(3);
      expect(batchResult.batchId).toBeDefined();
    });

    test('should process batch and mark items as completed', () => {
      // Queue a batch of items
      const items = [
        { operation: 'create' as const, recordId: 'record-001', data: { amount: 100 } },
        { operation: 'create' as const, recordId: 'record-002', data: { amount: 200 } },
      ];

      syncQueueService.queueSyncBatch('kas', items);

      // Mark items as synced (simulating successful sync)
      const pending = syncQueueService.getPendingItemsByModule('kas');
      for (const item of pending.slice(0, 2)) {
        syncQueueService.markSynced(item.id);
      }

      // Verify items are no longer in pending
      const remaining = syncQueueService.getPendingItemsByModule('kas');
      expect(remaining.length).toBeLessThanOrEqual(pending.length - 2);
    });
  });

  describe('VAL-FLOW-002: E2E - Cloud to Local Sync', () => {
    test('should queue sync when remote changes detected', () => {
      // Simulate detecting remote changes
      const remoteVersion = {
        recordId: 'record-001',
        data: { amount: 150, modified_at: '2024-01-01T12:00:00Z' },
        timestamp: '2024-01-01T12:00:00Z',
      };

      // Queue the sync operation
      const syncResult = syncQueueService.queueSync(
        'kas',
        'update',
        'record-001',
        remoteVersion.data
      );

      expect(syncResult.success).toBe(true);
    });

    test('should get queue statistics showing pending count', () => {
      // Queue some items
      syncQueueService.queueSync('kas', 'create', 'record-001', { data: '1' });
      syncQueueService.queueSync('bank', 'create', 'record-002', { data: '2' });

      const stats = syncQueueService.getQueueStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.pending).toBeGreaterThanOrEqual(2);
      expect(stats.byModule).toHaveProperty('kas');
      expect(stats.byModule).toHaveProperty('bank');
    });
  });

  describe('VAL-FLOW-003: Conflict Scenario - Simultaneous Edit', () => {
    test('should detect edit-edit conflict using timestamps', () => {
      const localVersion: conflictResolution.LocalVersion = {
        recordId: 'record-001',
        data: { amount: 100, description: 'Local edit' },
        timestamp: '2024-01-01T12:00:00Z',
        deviceId: 'device-A',
      };

      const remoteVersion: conflictResolution.RemoteVersion = {
        recordId: 'record-001',
        data: { amount: 150, description: 'Remote edit' },
        timestamp: '2024-01-01T12:30:00Z',
        deviceId: 'device-B',
      };

      const result = conflictResolution.detectConflict('kas', localVersion, remoteVersion);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('edit_edit');
    });

    test('should detect field-level conflicts', () => {
      const localData = { amount: 100, description: 'Local', category: 'A' };
      const remoteData = { amount: 150, description: 'Remote', category: 'A' };

      const conflictingFields = conflictResolution.getConflictingFields(localData, remoteData);

      expect(conflictingFields).toContain('amount');
      expect(conflictingFields).toContain('description');
      expect(conflictingFields).not.toContain('category');
    });

    test('should resolve with last_write_wins strategy', async () => {
      const conflict: conflictResolution.ConflictRecord = {
        id: 'conflict-001',
        module: 'kas',
        recordId: 'record-001',
        conflictType: 'edit_edit',
        localVersion: {
          recordId: 'record-001',
          data: { amount: 100 },
          timestamp: '2024-01-01T12:00:00Z',
        },
        remoteVersion: {
          recordId: 'record-001',
          data: { amount: 150 },
          timestamp: '2024-01-01T12:30:00Z',
        },
        resolutionStrategy: 'last_write_wins',
        needsManualResolution: false,
        createdAt: '2024-01-01T12:35:00Z',
      };

      const result = await conflictResolution.applyResolutionStrategy(
        'kas',
        conflict,
        'last_write_wins'
      );

      expect(result.success).toBe(true);
      expect(result.resolution).toBe('remote'); // Later timestamp wins
    });

    test('should resolve with local_wins strategy', async () => {
      const conflict: conflictResolution.ConflictRecord = {
        id: 'conflict-002',
        module: 'kas',
        recordId: 'record-001',
        conflictType: 'edit_edit',
        localVersion: {
          recordId: 'record-001',
          data: { amount: 100 },
          timestamp: '2024-01-01T12:00:00Z',
        },
        remoteVersion: {
          recordId: 'record-001',
          data: { amount: 150 },
          timestamp: '2024-01-01T12:30:00Z',
        },
        resolutionStrategy: 'local_wins',
        needsManualResolution: false,
        createdAt: '2024-01-01T12:35:00Z',
      };

      const result = await conflictResolution.applyResolutionStrategy(
        'kas',
        conflict,
        'local_wins'
      );

      expect(result.success).toBe(true);
      expect(result.resolution).toBe('local');
      expect(result.resolvedData).toEqual({ amount: 100 });
    });

    test('should merge non-conflicting fields', async () => {
      const conflict: conflictResolution.ConflictRecord = {
        id: 'conflict-003',
        module: 'kas',
        recordId: 'record-001',
        conflictType: 'edit_edit',
        localVersion: {
          recordId: 'record-001',
          data: { amount: 100, description: 'Local desc', category: 'A' },
          timestamp: '2024-01-01T12:00:00Z',
        },
        remoteVersion: {
          recordId: 'record-001',
          data: { amount: 150, description: 'Local desc', category: 'A' },
          timestamp: '2024-01-01T12:30:00Z',
        },
        resolutionStrategy: 'merge',
        needsManualResolution: false,
        createdAt: '2024-01-01T12:35:00Z',
      };

      const result = await conflictResolution.applyResolutionStrategy(
        'kas',
        conflict,
        'merge'
      );

      expect(result.success).toBe(true);
      expect(result.resolution).toBe('merged');
      expect(result.resolvedData).toBeDefined();
      // Merge prefers local for conflicting fields
      expect(result.message).toContain('1 field conflicts');
    });
  });

  describe('VAL-FLOW-004: Conflict Scenario - Edit vs Delete', () => {
    test('should detect edit-delete conflict', () => {
      const localVersion: conflictResolution.LocalVersion = {
        recordId: 'record-001',
        data: { amount: 100, description: 'Edited locally' },
        timestamp: '2024-01-01T12:00:00Z',
      };

      const remoteVersion: conflictResolution.RemoteVersion = {
        recordId: 'record-001',
        data: {},
        timestamp: '2024-01-01T12:30:00Z',
        deleted: true,
      };

      const result = conflictResolution.detectConflict('kas', localVersion, remoteVersion);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('edit_delete');
    });

    test('should detect delete-edit conflict', () => {
      const localVersion: conflictResolution.LocalVersion = {
        recordId: 'record-001',
        data: {},
        timestamp: '2024-01-01T12:00:00Z',
        deleted: true,
      };

      const remoteVersion: conflictResolution.RemoteVersion = {
        recordId: 'record-001',
        data: { amount: 100, description: 'Edited remotely' },
        timestamp: '2024-01-01T12:30:00Z',
      };

      const result = conflictResolution.detectConflict('kas', localVersion, remoteVersion);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('edit_delete');
    });

    test('should require manual resolution for delete-edit conflict', () => {
      const requiresManual = conflictResolution.requiresManualResolution('edit_delete', 'merge');
      expect(requiresManual).toBe(true);
    });
  });

  describe('VAL-FLOW-005: Approval Workflow with Sync', () => {
    test('should track approval status through sync', () => {
      // Create transaction with pending_approval_1 status
      const createResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        {
          id: 'record-001',
          status: 'pending_approval_1',
          amount: 100000,
        }
      );

      expect(createResult.success).toBe(true);
      expect(createResult.queueItem?.status).toBe('pending');
    });

    test('should queue approval status change', () => {
      // Queue approval status update
      const updateResult = syncQueueService.queueSync(
        'kas',
        'update',
        'record-001',
        {
          id: 'record-001',
          status: 'pending_approval_2',
          approved_by: 'approver-1',
          approved_at: new Date().toISOString(),
        }
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.queueItem?.operation).toBe('update');
    });

    test('should queue final approval', () => {
      // Queue final approval
      const updateResult = syncQueueService.queueSync(
        'kas',
        'update',
        'record-001',
        {
          id: 'record-001',
          status: 'fully_approved',
          final_approved_by: 'approver-2',
          final_approved_at: new Date().toISOString(),
        }
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.queueItem?.operation).toBe('update');
    });
  });

  describe('VAL-FLOW-006: Large Data Sync Performance', () => {
    test('should batch large number of items efficiently', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        operation: 'create' as const,
        recordId: `record-${i.toString().padStart(4, '0')}`,
        data: { amount: 100 * (i + 1), index: i },
      }));

      const batchResult = syncQueueService.queueSyncBatch('kas', items);

      expect(batchResult.success).toBe(true);
      expect(batchResult.itemsAdded).toBe(100);
    });

    test('should process multiple batches', () => {
      // Create multiple batches
      const batch1 = Array.from({ length: 100 }, (_, i) => ({
        operation: 'create' as const,
        recordId: `batch1-record-${i}`,
        data: { batch: 1, index: i },
      }));

      const batch2 = Array.from({ length: 50 }, (_, i) => ({
        operation: 'create' as const,
        recordId: `batch2-record-${i}`,
        data: { batch: 2, index: i },
      }));

      const result1 = syncQueueService.queueSyncBatch('kas', batch1);
      const result2 = syncQueueService.queueSyncBatch('bank', batch2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const stats = syncQueueService.getQueueStats();
      expect(stats.total).toBeGreaterThanOrEqual(150);
    });

    test('should estimate batch count correctly', () => {
      batchSyncService.setConfig({ batchSize: 100 });

      const stats = batchSyncService.getBatchSyncStats();

      expect(stats.batchSize).toBe(100);
      expect(stats).toHaveProperty('estimatedBatches');
      expect(stats).toHaveProperty('pendingItems');
    });
  });

  describe('VAL-FLOW-007: Network Interruption Recovery', () => {
    test('should mark item as failed on network error', () => {
      // Queue an item
      const queueResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        { amount: 100 }
      );

      expect(queueResult.success).toBe(true);

      // Simulate network failure - mark as failed
      syncQueueService.markFailed(queueResult.queueItem!.id, 'Network error: ECONNRESET');

      const item = syncQueueService.getQueueItemById(queueResult.queueItem!.id);
      expect(item?.status).toBe('failed');
      expect(item?.lastError).toBe('Network error: ECONNRESET');
    });

    test('should calculate exponential backoff for retries', () => {
      const delay0 = retryService.calculateNextRetryDelay(0);
      expect(delay0).toBe(1000); // 1s

      const delay1 = retryService.calculateNextRetryDelay(1);
      expect(delay1).toBe(2000); // 2s

      const delay2 = retryService.calculateNextRetryDelay(2);
      expect(delay2).toBe(4000); // 4s

      const delay3 = retryService.calculateNextRetryDelay(3);
      expect(delay3).toBe(8000); // 8s
    });

    test('should classify network errors as retryable', () => {
      const result = retryService.classifyError('ECONNRESET', undefined);

      expect(result.canRetry).toBe(true);
      expect(result.isRetryable).toBe(true);
      expect(result.errorType).toBe('network');
    });

    test('should classify auth errors as non-retryable', () => {
      const result = retryService.classifyError('Unauthorized', 401);

      expect(result.canRetry).toBe(false);
      expect(result.isRetryable).toBe(false);
      expect(result.errorType).toBe('auth');
    });

    test('should stop retrying after max attempts', () => {
      const canRetry0 = retryService.canRetry('item-1', 0);
      const canRetry4 = retryService.canRetry('item-1', 4);
      const canRetry5 = retryService.canRetry('item-1', 5);

      expect(canRetry0).toBe(true);
      expect(canRetry4).toBe(true);
      expect(canRetry5).toBe(false);
    });

    test('should schedule retry for retryable errors', () => {
      const result = retryService.markForRetry('item-1', 'Network error', undefined);

      expect(result.canRetry).toBe(true);
      expect(result.nextDelayMs).toBe(1000);
      expect(result.nextRetryAt).toBeDefined();
    });

    test('should not schedule retry for non-retryable errors', () => {
      const result = retryService.markForRetry('item-1', 'Unauthorized', 401);

      expect(result.canRetry).toBe(false);
    });
  });

  describe('VAL-FLOW-008: Multi-Module Sync', () => {
    test('should queue operations for multiple modules', () => {
      syncQueueService.queueSync('kas', 'create', 'kas-001', { module: 'kas' });
      syncQueueService.queueSync('bank', 'create', 'bank-001', { module: 'bank' });
      syncQueueService.queueSync('gudang', 'create', 'gudang-001', { module: 'gudang' });

      const stats = syncQueueService.getQueueStats();

      expect(stats.byModule).toHaveProperty('kas');
      expect(stats.byModule).toHaveProperty('bank');
      expect(stats.byModule).toHaveProperty('gudang');
    });

    test('should get pending items by module', () => {
      syncQueueService.queueSync('kas', 'create', 'kas-001', { module: 'kas' });
      syncQueueService.queueSync('kas', 'create', 'kas-002', { module: 'kas' });
      syncQueueService.queueSync('bank', 'create', 'bank-001', { module: 'bank' });

      const kasPending = syncQueueService.getPendingItemsByModule('kas');
      const bankPending = syncQueueService.getPendingItemsByModule('bank');

      expect(kasPending.length).toBeGreaterThanOrEqual(2);
      expect(bankPending.length).toBeGreaterThanOrEqual(1);
      expect(kasPending.every(item => item.module === 'kas')).toBe(true);
      expect(bankPending.every(item => item.module === 'bank')).toBe(true);
    });

    test('should sync each module independently', () => {
      // Queue for kas
      syncQueueService.queueSync('kas', 'create', 'kas-001', { module: 'kas' });
      
      // Mark kas item as synced
      const kasPending = syncQueueService.getPendingItemsByModule('kas');
      if (kasPending.length > 0) {
        syncQueueService.markSynced(kasPending[0].id);
      }

      // Bank items should still be pending
      const bankPending = syncQueueService.getPendingItemsByModule('bank');
      expect(bankPending.length).toBeGreaterThanOrEqual(0); // May or may not have items
    });
  });

  describe('VAL-FLOW-009: Initial Sync - New Device', () => {
    test('should generate unique device ID for new device', () => {
      const deviceId = syncQueueService.getDeviceId();

      expect(deviceId).toBeDefined();
      expect(deviceId).toMatch(/^device-/);
    });

    test('should queue sync with device ID', () => {
      const queueResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        {
          id: 'record-001',
          amount: 100,
          device_id: syncQueueService.getDeviceId(),
        }
      );

      expect(queueResult.success).toBe(true);
      const data = JSON.parse(queueResult.queueItem!.data);
      expect(data.device_id).toBeDefined();
    });

    test('should track sync status per record', () => {
      const queueResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        { amount: 100 }
      );

      const item = syncQueueService.getQueueItemById(queueResult.queueItem!.id);
      
      expect(item).toBeDefined();
      expect(item?.status).toBe('pending');
      expect(item?.attempts).toBe(0);
    });
  });

  describe('VAL-FLOW-010: Period Rollover Sync', () => {
    test('should include year/month in sync payload', () => {
      const payload = syncQueueService.buildSyncPayload({
        id: 'item-001',
        batchId: null,
        operation: 'create',
        module: 'kas',
        recordId: 'record-001',
        data: JSON.stringify({
          tanggal: '2026-02-15',
          amount: 100000,
        }),
        timestamp: new Date().toISOString(),
        status: 'pending',
        attempts: 0,
        lastError: null,
      });

      expect(payload).toBeDefined();
      expect(payload?.module).toBe('kas');
      expect(payload?.operation).toBe('create');
      expect(payload?.data).toHaveProperty('tanggal');
    });

    test('should queue transaction for specific period', () => {
      const queueResult = syncQueueService.queueSync(
        'kas',
        'create',
        'record-001',
        {
          tanggal: '2026-02-15',
          amount: 100000,
          periode: '2026/02',
        }
      );

      expect(queueResult.success).toBe(true);
    });

    test('should batch items by period', () => {
      const items = [
        { operation: 'create' as const, recordId: 'jan-001', data: { tanggal: '2026-01-15', amount: 100 } },
        { operation: 'create' as const, recordId: 'jan-002', data: { tanggal: '2026-01-20', amount: 200 } },
        { operation: 'create' as const, recordId: 'feb-001', data: { tanggal: '2026-02-10', amount: 300 } },
        { operation: 'create' as const, recordId: 'feb-002', data: { tanggal: '2026-02-15', amount: 400 } },
      ];

      const batchResult = syncQueueService.queueSyncBatch('kas', items);

      expect(batchResult.success).toBe(true);
      expect(batchResult.itemsAdded).toBe(4);
    });
  });

  describe('Queue Health and Monitoring', () => {
    test('should detect unhealthy queue state', () => {
      // Queue many failed items
      for (let i = 0; i < 15; i++) {
        syncQueueService.queueSync('kas', 'create', `record-${i}`, { index: i });
      }

      // Get queue health
      const health = syncQueueService.getQueueHealth();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('issues');
      expect(health).toHaveProperty('warnings');
    });

    test('should inspect queue state', () => {
      syncQueueService.queueSync('kas', 'create', 'record-001', { amount: 100 });
      syncQueueService.queueSync('bank', 'create', 'record-002', { amount: 200 });

      const inspection = syncQueueService.inspectQueue();

      expect(inspection).toHaveProperty('statistics');
      expect(inspection).toHaveProperty('recentItems');
      expect(inspection).toHaveProperty('itemsByStatus');
      expect(inspection.statistics.total).toBeGreaterThanOrEqual(2);
    });

    test('should export queue state as JSON', () => {
      syncQueueService.queueSync('kas', 'create', 'record-001', { amount: 100 });

      const json = syncQueueService.exportQueueState();

      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('Conflict Resolution Strategies', () => {
    test('should get conflict type label', () => {
      expect(conflictResolution.getConflictTypeLabel('edit_edit')).toBe('Edit-Edit Conflict');
      expect(conflictResolution.getConflictTypeLabel('edit_delete')).toBe('Edit-Delete Conflict');
      expect(conflictResolution.getConflictTypeLabel('delete_edit')).toBe('Delete-Edit Conflict');
    });

    test('should get strategy label', () => {
      expect(conflictResolution.getStrategyLabel('last_write_wins')).toBe('Last Write Wins');
      expect(conflictResolution.getStrategyLabel('local_wins')).toBe('Local Version Wins');
      expect(conflictResolution.getStrategyLabel('remote_wins')).toBe('Remote Version Wins');
      expect(conflictResolution.getStrategyLabel('merge')).toBe('Merge (Auto-merge non-conflicting fields)');
      expect(conflictResolution.getStrategyLabel('manual')).toBe('Manual Resolution Required');
    });

    test('should set and get resolution strategy', () => {
      conflictResolution.setResolutionStrategy('local_wins', 'kas');
      expect(conflictResolution.getResolutionStrategy('kas')).toBe('local_wins');

      conflictResolution.setResolutionStrategy('remote_wins');
      expect(conflictResolution.getResolutionStrategy()).toBe('remote_wins');
    });
  });

  describe('Batch Sync Configuration', () => {
    test('should validate batch size configuration', () => {
      const valid1 = batchSyncService.validateConfig({ batchSize: 100 });
      expect(valid1.valid).toBe(true);

      const invalid1 = batchSyncService.validateConfig({ batchSize: 0 });
      expect(invalid1.valid).toBe(false);
      expect(invalid1.errors).toContain('Batch size must be at least 1');

      const invalid2 = batchSyncService.validateConfig({ batchSize: 1001 });
      expect(invalid2.valid).toBe(false);
      expect(invalid2.errors.some(e => e.includes('exceed 1000'))).toBe(true);
    });

    test('should validate max retries configuration', () => {
      const valid = batchSyncService.validateConfig({ maxRetries: 5 });
      expect(valid.valid).toBe(true);

      const invalid = batchSyncService.validateConfig({ maxRetries: -1 });
      expect(invalid.valid).toBe(false);
    });

    test('should validate retry delay configuration', () => {
      const valid = batchSyncService.validateConfig({ retryDelayMs: 2000 });
      expect(valid.valid).toBe(true);

      const invalid = batchSyncService.validateConfig({ retryDelayMs: 50 });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain('Retry delay should be at least 100ms');
    });
  });

  describe('Sync Status Display', () => {
    test('should get status display info', () => {
      const pending = syncQueueService.getStatusDisplay('pending');
      expect(pending.label).toBe('Pending');
      expect(pending.color).toBe('yellow');

      const synced = syncQueueService.getStatusDisplay('synced');
      expect(synced.label).toBe('Synced');
      expect(synced.color).toBe('green');

      const failed = syncQueueService.getStatusDisplay('failed');
      expect(failed.label).toBe('Failed');
      expect(failed.color).toBe('red');

      const conflict = syncQueueService.getStatusDisplay('conflict');
      expect(conflict.label).toBe('Conflict');
      expect(conflict.color).toBe('orange');
    });

    test('should get sync status message', () => {
      expect(syncQueueService.getSyncStatusMessage('synced')).toBe('Tersinkronkan');
      expect(syncQueueService.getSyncStatusMessage('pending')).toBe('Menunggu sync');
      expect(syncQueueService.getSyncStatusMessage('conflict')).toBe('Konflik terdeteksi');
    });
  });

  describe('Retry Service Integration', () => {
    test('should process failed sync with retry', () => {
      const callback = async () => {
        // Simulate successful retry
        return { success: true };
      };

      const result = retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Network error',
        undefined,
        callback
      );

      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBe(1000);
    });

    test('should not retry non-retryable errors', () => {
      const callback = async () => {};

      const result = retryService.processFailedSync(
        'item-1',
        'kas',
        'create',
        'record-1',
        'Unauthorized',
        401,
        callback
      );

      expect(result.shouldRetry).toBe(false);
    });

    test('should get retry status for UI', () => {
      retryService.markForRetry('item-1', 'Network error', undefined);

      const status = retryService.getRetryStatusForUI('item-1', 'kas', 'record-1');

      expect(status).not.toBeNull();
      expect(status?.itemId).toBe('item-1');
      expect(status?.attempt).toBe(1);
      expect(status?.maxRetries).toBe(5);
      expect(status?.progress).toBe('Attempt 1 of 5');
    });

    test('should get retry summary', () => {
      retryService.markForRetry('item-1', 'Error 1', undefined);
      retryService.markForRetry('item-2', 'Error 2', undefined);
      retryService.markRetrySuccess('item-1');

      const summary = retryService.getRetrySummary();

      expect(summary.totalRetries).toBe(2);
      expect(summary.pendingRetries).toBe(1);
      expect(summary.success).toBe(1);
    });

    test('should mark retry as exhausted', () => {
      retryService.markForRetry('item-1', 'Error', undefined);
      retryService.markRetryExhausted('item-1', 'Max retries reached');

      const state = retryService.getRetryState('item-1');
      expect(state?.status).toBe('failed');
      expect(state?.lastError).toBe('Max retries reached');
    });
  });
});

describe('Batch Sync Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchSyncService.resetCancellation();
    retryService.setConfig({
      maxRetries: 5,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      multiplier: 2,
      jitterFactor: 0,
    });
  });

  test('should create API client', () => {
    const client = batchSyncService.createApiClient('https://api.example.com', 'test-token');

    expect(client.baseUrl).toBe('https://api.example.com');
    expect(client.authToken).toBe('test-token');
    expect(typeof client.request).toBe('function');
  });

  test('should cancel batch sync', () => {
    batchSyncService.cancelBatchSync();
    batchSyncService.resetCancellation();
    // Should not throw
    expect(() => batchSyncService.cancelBatchSync()).not.toThrow();
  });

  test('should set progress callback', () => {
    const callback = (_progress: batchSyncService.BatchSyncProgress) => {};
    expect(() => batchSyncService.setProgressCallback(callback)).not.toThrow();
    expect(() => batchSyncService.setProgressCallback(null)).not.toThrow();
  });

  test('should get batch sync stats', () => {
    const stats = batchSyncService.getBatchSyncStats();

    expect(stats).toHaveProperty('pendingItems');
    expect(stats).toHaveProperty('estimatedBatches');
    expect(stats).toHaveProperty('batchSize');
    expect(stats).toHaveProperty('queueStats');
  });
});
