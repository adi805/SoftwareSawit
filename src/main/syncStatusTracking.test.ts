/**
 * Tests for Sync Status Tracking Service (F012-BE)
 */

import * as syncStatusTracking from './syncStatusTracking';

describe('SyncStatusTracking', () => {
  describe('getSyncStatusChannel', () => {
    it('should return the correct IPC channel name', () => {
      const channel = syncStatusTracking.getSyncStatusChannel();
      expect(channel).toBe('sync:transactionStatusChanged');
    });
  });

  describe('getSyncStatusMessage', () => {
    it('should return Indonesian message for synced status', () => {
      const message = syncStatusTracking.getSyncStatusMessage('synced');
      expect(message).toBe('Tersinkronkan');
    });

    it('should return Indonesian message for pending status', () => {
      const message = syncStatusTracking.getSyncStatusMessage('pending');
      expect(message).toBe('Menunggu sync');
    });

    it('should return Indonesian message for failed status', () => {
      const message = syncStatusTracking.getSyncStatusMessage('failed');
      expect(message).toBe('Gagal sync');
    });

    it('should return Indonesian message for conflict status', () => {
      const message = syncStatusTracking.getSyncStatusMessage('conflict');
      expect(message).toBe('Konflik terdeteksi');
    });

    it('should return Indonesian message for in_progress status', () => {
      const message = syncStatusTracking.getSyncStatusMessage('in_progress');
      expect(message).toBe('Sedang sync');
    });
  });

  describe('getSyncStatusDisplay', () => {
    it('should return green color for synced status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('synced');
      expect(display.color).toBe('green');
      expect(display.icon).toBe('check-circle');
      expect(display.label).toBe('Synced');
    });

    it('should return yellow color for pending status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('pending');
      expect(display.color).toBe('yellow');
      expect(display.icon).toBe('clock');
      expect(display.label).toBe('Pending');
    });

    it('should return red color for failed status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('failed');
      expect(display.color).toBe('red');
      expect(display.icon).toBe('x-circle');
      expect(display.label).toBe('Failed');
    });

    it('should return orange color for conflict status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('conflict');
      expect(display.color).toBe('orange');
      expect(display.icon).toBe('alert-triangle');
      expect(display.label).toBe('Conflict');
    });

    it('should return blue color for in_progress status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('in_progress');
      expect(display.color).toBe('blue');
      expect(display.icon).toBe('sync');
      expect(display.label).toBe('Syncing');
    });

    it('should return gray color for unknown status', () => {
      const display = syncStatusTracking.getSyncStatusDisplay('unknown' as any);
      expect(display.color).toBe('gray');
      expect(display.icon).toBe('help-circle');
      expect(display.label).toBe('Unknown');
    });
  });

  describe('addSyncStatusColumns', () => {
    it('should return success for valid kas module', () => {
      const result = syncStatusTracking.addSyncStatusColumns('kas');
      expect(result.success).toBe(true);
    });

    it('should return success for valid bank module', () => {
      const result = syncStatusTracking.addSyncStatusColumns('bank');
      expect(result.success).toBe(true);
    });

    it('should return success for valid gudang module', () => {
      const result = syncStatusTracking.addSyncStatusColumns('gudang');
      expect(result.success).toBe(true);
    });
  });

  describe('onTransactionQueued', () => {
    it('should return failure for unknown module', () => {
      const result = syncStatusTracking.onTransactionQueued('unknown' as any, 'test-id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown module');
    });
  });

  describe('onTransactionSynced', () => {
    it('should return failure for unknown module', () => {
      const result = syncStatusTracking.onTransactionSynced('unknown' as any, 'test-id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown module');
    });
  });

  describe('onTransactionSyncFailed', () => {
    it('should return failure for unknown module', () => {
      const result = syncStatusTracking.onTransactionSyncFailed('unknown' as any, 'test-id', 'Test error');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown module');
    });
  });

  describe('onTransactionConflict', () => {
    it('should return failure for unknown module', () => {
      const result = syncStatusTracking.onTransactionConflict('unknown' as any, 'test-id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown module');
    });
  });

  describe('getTransactionSyncStatus', () => {
    it('should return null for unknown module', () => {
      const result = syncStatusTracking.getTransactionSyncStatus('unknown' as any, 'test-id');
      expect(result).toBeNull();
    });
  });

  describe('getTransactionsWithSyncStatus', () => {
    it('should return empty array for unknown module', () => {
      const result = syncStatusTracking.getTransactionsWithSyncStatus('unknown' as any);
      expect(result).toEqual([]);
    });
  });

  describe('resetSyncStatusForRetry', () => {
    it('should return failure for unknown module', () => {
      const result = syncStatusTracking.resetSyncStatusForRetry('unknown' as any, 'test-id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown module');
    });
  });
});

describe('SyncStatusTracking IPC Integration', () => {
  describe('channel name consistency', () => {
    it('should use consistent channel name across the service', () => {
      const channel = syncStatusTracking.getSyncStatusChannel();
      expect(channel).toBe('sync:transactionStatusChanged');
    });
  });
});
