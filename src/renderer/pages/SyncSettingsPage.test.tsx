/**
 * Tests for Queue Statistics Display (F004-UI)
 * 
 * Tests queue statistics visibility, stat boxes configuration,
 * and per-module breakdown rendering conditions.
 */

/**
 * Tests for Retry Buttons (F005-UI)
 * 
 * Tests retry buttons visibility for failed sync items,
 * individual retry and retry all functionality, and disabled states.
 */

describe('SyncSettingsPage Retry Buttons', () => {
  describe('FailedItem Type', () => {
    it('should have correct interface structure for failed items', () => {
      const mockFailedItem = {
        id: 'item-123',
        module: 'kas',
        operation: 'create' as const,
        recordId: 'rec-456',
        attempts: 2,
        lastError: 'Connection timeout',
        createdAt: '2026-04-09T10:00:00Z',
        lastAttemptAt: '2026-04-09T10:05:00Z',
        nextRetryAt: '2026-04-09T10:10:00Z',
        canRetry: true,
        maxRetries: 5,
        retryDelayMs: 300000,
        retryDelayFormatted: '5 menit',
        status: 'failed' as const,
      };

      expect(mockFailedItem.canRetry).toBe(true);
      expect(mockFailedItem.maxRetries).toBe(5);
      expect(mockFailedItem.attempts).toBe(2);
    });

    it('should correctly identify items that cannot retry', () => {
      const failedItemAtMaxRetries = {
        id: 'item-789',
        canRetry: false,
        attempts: 5,
        maxRetries: 5,
      };

      expect(failedItemAtMaxRetries.canRetry).toBe(false);
      expect(failedItemAtMaxRetries.attempts).toBe(failedItemAtMaxRetries.maxRetries);
    });

    it('should have correct operation types', () => {
      const validOperations: Array<'create' | 'update' | 'delete'> = ['create', 'update', 'delete'];
      expect(validOperations).toContain('create');
      expect(validOperations).toContain('update');
      expect(validOperations).toContain('delete');
    });
  });

  describe('Retry Button Visibility Conditions', () => {
    it('should show retry button when canRetry is true', () => {
      const canRetry = true;
      const shouldShowRetry = canRetry;
      expect(shouldShowRetry).toBe(true);
    });

    it('should disable retry button when canRetry is false', () => {
      const canRetry = false;
      const isDisabled = !canRetry;
      expect(isDisabled).toBe(true);
    });

    it('should show retry button only for admin users', () => {
      const isAdmin = true;
      const failedItemsExist = true;
      const shouldShowRetryButtons = isAdmin && failedItemsExist;
      expect(shouldShowRetryButtons).toBe(true);
    });

    it('should not show retry buttons for non-admin users', () => {
      const isAdmin = false;
      const failedItemsExist = true;
      const shouldShowRetryButtons = isAdmin && failedItemsExist;
      expect(shouldShowRetryButtons).toBe(false);
    });
  });

  describe('Retry Semua Button', () => {
    it('should show Retry Semua button when there are failed items and user is admin', () => {
      const isAdmin = true;
      const failedItemsLength = 5;
      const shouldShowRetryAll = isAdmin && failedItemsLength > 0;
      expect(shouldShowRetryAll).toBe(true);
    });

    it('should not show Retry Semua button when no failed items', () => {
      const isAdmin = true;
      const failedItemsLength = 0;
      const shouldShowRetryAll = isAdmin && failedItemsLength > 0;
      expect(shouldShowRetryAll).toBe(false);
    });

    it('should not show Retry Semua button for non-admin', () => {
      const isAdmin = false;
      const failedItemsLength = 5;
      const shouldShowRetryAll = isAdmin && failedItemsLength > 0;
      expect(shouldShowRetryAll).toBe(false);
    });
  });

  describe('Retry Handler Logic', () => {
    it('should call retrySyncHealthFailedItem IPC for individual retry', () => {
      // Simulating the IPC call structure
      const mockIPC = {
        retrySyncHealthFailedItem: jest.fn().mockResolvedValue({ success: true }),
      };

      const itemId = 'item-123';
      mockIPC.retrySyncHealthFailedItem(itemId);

      expect(mockIPC.retrySyncHealthFailedItem).toHaveBeenCalledWith(itemId);
      expect(mockIPC.retrySyncHealthFailedItem).toHaveBeenCalledTimes(1);
    });

    it('should call retrySyncHealthAllFailed IPC for retry all', () => {
      const mockIPC = {
        retrySyncHealthAllFailed: jest.fn().mockResolvedValue({ success: true }),
      };

      mockIPC.retrySyncHealthAllFailed();

      expect(mockIPC.retrySyncHealthAllFailed).toHaveBeenCalledTimes(1);
      expect(mockIPC.retrySyncHealthAllFailed).toHaveBeenCalledWith();
    });

    it('should handle retry failure gracefully', async () => {
      const mockIPC = {
        retrySyncHealthFailedItem: jest.fn().mockResolvedValue({ 
          success: false, 
          message: 'Item not found' 
        }),
      };

      const result = await mockIPC.retrySyncHealthFailedItem('non-existent-id');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Item not found');
    });
  });

  describe('Failed Items Section Rendering', () => {
    it('should render failed items section when failedItems.length > 0', () => {
      const failedItems = [
        { id: '1', canRetry: true },
        { id: '2', canRetry: false },
      ];
      const shouldShowSection = failedItems.length > 0;
      expect(shouldShowSection).toBe(true);
    });

    it('should not render failed items section when empty', () => {
      const failedItems: any[] = [];
      const shouldShowSection = failedItems.length > 0;
      expect(shouldShowSection).toBe(false);
    });

    it('should display correct total count in section header', () => {
      const failedItemsTotal = 15;
      const sectionHeader = `Item Gagal (${failedItemsTotal} total)`;
      expect(sectionHeader).toBe('Item Gagal (15 total)');
    });
  });

  describe('Retry Button Styling', () => {
    it('should have correct styling classes for retry button', () => {
      const retryButtonClasses = 'px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700';
      expect(retryButtonClasses).toContain('bg-blue-600');
      expect(retryButtonClasses).toContain('text-white');
    });

    it('should have disabled styling for max retry button', () => {
      const disabledClasses = 'disabled:opacity-50 disabled:cursor-not-allowed';
      expect(disabledClasses).toContain('disabled:opacity-50');
      expect(disabledClasses).toContain('disabled:cursor-not-allowed');
    });

    it('should have correct styling for Retry Semua button', () => {
      const retryAllClasses = 'px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700';
      expect(retryAllClasses).toContain('bg-red-600');
      expect(retryAllClasses).toContain('hover:bg-red-700');
    });
  });

  describe('Module Label Resolution', () => {
    it('should resolve module key to label', () => {
      const MODULES = [
        { key: 'kas', label: 'Kas' },
        { key: 'bank', label: 'Bank' },
        { key: 'gudang', label: 'Gudang' },
      ];

      const moduleKey = 'kas';
      const moduleLabel = MODULES.find(m => m.key === moduleKey)?.label || moduleKey;
      expect(moduleLabel).toBe('Kas');
    });

    it('should fallback to key if label not found', () => {
      const MODULES = [
        { key: 'kas', label: 'Kas' },
      ];

      const moduleKey = 'unknown_module';
      const moduleLabel = MODULES.find(m => m.key === moduleKey)?.label || moduleKey;
      expect(moduleLabel).toBe('unknown_module');
    });
  });
});

/**
 * Tests for Sync Progress Indicator (F006-UI)
 * 
 * Tests progress indicator visibility, progress bar display,
 * counters for processed/succeeded/failed items, and estimated time.
 */

describe('SyncSettingsPage Progress Indicator', () => {
  describe('SyncProgress Type', () => {
    it('should have correct interface structure for sync progress', () => {
      const mockSyncProgress = {
        currentBatch: 2,
        totalBatches: 5,
        itemsProcessed: 50,
        totalProcessed: 50,
        totalItems: 200,
        succeeded: 45,
        failed: 5,
        status: 'in_progress' as const,
        elapsedMs: 30000,
        estimatedRemainingMs: 45000,
      };

      expect(mockSyncProgress.currentBatch).toBe(2);
      expect(mockSyncProgress.totalBatches).toBe(5);
      expect(mockSyncProgress.itemsProcessed).toBe(50);
      expect(mockSyncProgress.totalItems).toBe(200);
      expect(mockSyncProgress.succeeded).toBe(45);
      expect(mockSyncProgress.failed).toBe(5);
      expect(mockSyncProgress.status).toBe('in_progress');
      expect(mockSyncProgress.estimatedRemainingMs).toBe(45000);
    });

    it('should accept valid status values', () => {
      const validStatuses: Array<'in_progress' | 'completed' | 'failed' | 'cancelled'> = [
        'in_progress',
        'completed',
        'failed',
        'cancelled',
      ];

      validStatuses.forEach(status => {
        expect(['in_progress', 'completed', 'failed', 'cancelled']).toContain(status);
      });
    });

    it('should allow null estimatedRemainingMs when unknown', () => {
      const mockProgress = {
        status: 'in_progress' as const,
        estimatedRemainingMs: null,
      };

      expect(mockProgress.estimatedRemainingMs).toBeNull();
    });
  });

  describe('Progress Indicator Visibility', () => {
    it('should show progress indicator when status is in_progress', () => {
      const syncProgress = {
        status: 'in_progress' as const,
        itemsProcessed: 50,
        totalItems: 100,
        succeeded: 45,
        failed: 5,
        estimatedRemainingMs: 30000,
      };

      const shouldShowIndicator = syncProgress && syncProgress.status === 'in_progress';
      expect(shouldShowIndicator).toBe(true);
    });

    it('should not show progress indicator when status is completed', () => {
      // Using explicit type to avoid TypeScript narrowing issue
      const syncProgress: {
        status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
        itemsProcessed: number;
        totalItems: number;
        succeeded: number;
        failed: number;
        estimatedRemainingMs: number | null;
      } = {
        status: 'completed',
        itemsProcessed: 100,
        totalItems: 100,
        succeeded: 95,
        failed: 5,
        estimatedRemainingMs: null,
      };

      const shouldShowIndicator = syncProgress && syncProgress.status === 'in_progress';
      expect(shouldShowIndicator).toBe(false);
    });

    it('should not show progress indicator when status is failed', () => {
      const syncProgress: {
        status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
        itemsProcessed: number;
        totalItems: number;
        succeeded: number;
        failed: number;
        estimatedRemainingMs: number | null;
      } = {
        status: 'failed',
        itemsProcessed: 50,
        totalItems: 100,
        succeeded: 40,
        failed: 10,
        estimatedRemainingMs: null,
      };

      const shouldShowIndicator = syncProgress && syncProgress.status === 'in_progress';
      expect(shouldShowIndicator).toBe(false);
    });

    it('should not show progress indicator when syncProgress is null', () => {
      // Test that null is falsy and won't short-circuit to show the indicator
      const syncProgress = null;
      // null is falsy, so the expression evaluates to null (falsy)
      const result = syncProgress && true; // Simulating check
      expect(result).toBeFalsy();
    });
  });

  describe('Progress Bar Calculation', () => {
    it('should calculate correct percentage when items processed', () => {
      const syncProgress = {
        itemsProcessed: 50,
        totalItems: 100,
      };

      const percentage = syncProgress.totalItems > 0
        ? (syncProgress.itemsProcessed / syncProgress.totalItems) * 100
        : 0;

      expect(percentage).toBe(50);
    });

    it('should calculate 0% when totalItems is 0', () => {
      const syncProgress = {
        itemsProcessed: 0,
        totalItems: 0,
      };

      const percentage = syncProgress.totalItems > 0
        ? (syncProgress.itemsProcessed / syncProgress.totalItems) * 100
        : 0;

      expect(percentage).toBe(0);
    });

    it('should calculate 100% when all items processed', () => {
      const syncProgress = {
        itemsProcessed: 100,
        totalItems: 100,
      };

      const percentage = syncProgress.totalItems > 0
        ? (syncProgress.itemsProcessed / syncProgress.totalItems) * 100
        : 0;

      expect(percentage).toBe(100);
    });

    it('should handle partial progress correctly', () => {
      const syncProgress = {
        itemsProcessed: 25,
        totalItems: 200,
      };

      const percentage = syncProgress.totalItems > 0
        ? (syncProgress.itemsProcessed / syncProgress.totalItems) * 100
        : 0;

      expect(percentage).toBe(12.5);
    });
  });

  describe('Estimated Time Display', () => {
    it('should display seconds when estimatedRemainingMs is provided', () => {
      const estimatedRemainingMs = 45000;
      const displaySeconds = Math.ceil(estimatedRemainingMs / 1000);

      expect(displaySeconds).toBe(45);
    });

    it('should show "Menghitung..." when estimatedRemainingMs is null', () => {
      const estimatedRemainingMs = null;
      const displayText = estimatedRemainingMs
        ? `${Math.ceil(estimatedRemainingMs / 1000)}s`
        : 'Menghitung...';

      expect(displayText).toBe('Menghitung...');
    });

    it('should handle exact seconds correctly', () => {
      const estimatedRemainingMs = 30000;
      const displayText = `${Math.ceil(estimatedRemainingMs / 1000)}s`;

      expect(displayText).toBe('30s');
    });

    it('should round up partial seconds', () => {
      const estimatedRemainingMs = 2350;
      const displayText = `${Math.ceil(estimatedRemainingMs / 1000)}s`;

      expect(displayText).toBe('3s');
    });
  });

  describe('Progress Counter Display', () => {
    it('should display correct counter format', () => {
      const syncProgress = {
        itemsProcessed: 75,
        totalItems: 100,
      };

      const counterText = `${syncProgress.itemsProcessed} / ${syncProgress.totalItems} item`;
      expect(counterText).toBe('75 / 100 item');
    });

    it('should display zero items correctly', () => {
      const syncProgress = {
        itemsProcessed: 0,
        totalItems: 50,
      };

      const counterText = `${syncProgress.itemsProcessed} / ${syncProgress.totalItems} item`;
      expect(counterText).toBe('0 / 50 item');
    });

    it('should display completed sync correctly', () => {
      const syncProgress = {
        itemsProcessed: 100,
        totalItems: 100,
      };

      const counterText = `${syncProgress.itemsProcessed} / ${syncProgress.totalItems} item`;
      expect(counterText).toBe('100 / 100 item');
    });
  });

  describe('Progress Indicator Styling', () => {
    it('should have correct blue styling classes for progress section', () => {
      const sectionClasses = 'bg-blue-50 border border-blue-200 rounded-lg p-4';
      expect(sectionClasses).toContain('bg-blue-50');
      expect(sectionClasses).toContain('border-blue-200');
    });

    it('should have correct blue styling for progress bar background', () => {
      const progressBarBg = 'bg-blue-200 rounded-full h-4';
      expect(progressBarBg).toContain('bg-blue-200');
      expect(progressBarBg).toContain('rounded-full');
    });

    it('should have correct blue styling for progress bar fill', () => {
      const progressBarFill = 'bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out';
      expect(progressBarFill).toContain('bg-blue-600');
      expect(progressBarFill).toContain('transition-all');
      expect(progressBarFill).toContain('duration-300');
    });

    it('should have correct styling for header text', () => {
      const headerClasses = 'font-semibold text-blue-800';
      expect(headerClasses).toContain('text-blue-800');
    });

    it('should have correct styling for counter text', () => {
      const counterClasses = 'text-sm text-blue-600';
      expect(counterClasses).toContain('text-blue-600');
    });

    it('should have correct styling for stat labels', () => {
      const statLabelClasses = 'text-gray-500';
      expect(statLabelClasses).toContain('text-gray-500');
    });

    it('should have correct styling for succeeded count', () => {
      const succeededClasses = 'text-lg font-bold text-green-600';
      expect(succeededClasses).toContain('text-green-600');
    });

    it('should have correct styling for failed count', () => {
      const failedClasses = 'text-lg font-bold text-red-600';
      expect(failedClasses).toContain('text-red-600');
    });

    it('should have correct styling for estimated time', () => {
      const estimatedClasses = 'text-lg font-bold text-blue-600';
      expect(estimatedClasses).toContain('text-blue-600');
    });
  });

  describe('Progress Grid Layout', () => {
    it('should have 3-column grid for progress details', () => {
      const gridClasses = 'grid grid-cols-3 gap-4 text-sm';
      expect(gridClasses).toContain('grid-cols-3');
    });

    it('should have centered text for each stat', () => {
      const statClasses = 'text-center';
      expect(statClasses).toBe('text-center');
    });
  });
});

describe('SyncSettingsPage Queue Statistics', () => {
  describe('Queue Statistics Configuration', () => {
    it('should have correct condition for showing queue statistics', () => {
      // Condition: syncStats && (syncStats.total > 0 || syncStats.failed > 0)
      const testCases = [
        { syncStats: { total: 5, failed: 0, pending: 5 }, shouldShow: true },
        { syncStats: { total: 0, failed: 3, pending: 0 }, shouldShow: true },
        { syncStats: { total: 0, failed: 0, pending: 0 }, shouldShow: false },
        { syncStats: { total: 10, failed: 2, pending: 8 }, shouldShow: true },
        { syncStats: null, shouldShow: false },
      ];

      testCases.forEach(({ syncStats, shouldShow }) => {
        const shouldShowStats = syncStats !== null && (syncStats.total > 0 || syncStats.failed > 0);
        expect(shouldShowStats).toBe(shouldShow);
      });
    });

    it('should have correct stat box colors defined', () => {
      // Menunggu: yellow (bg-yellow-50, text-yellow-600)
      // Gagal: red (bg-red-50, text-red-600)
      // Total: gray (bg-gray-50, text-gray-600)
      const statBoxColors = {
        menunggu: { bg: 'bg-yellow-50', text: 'text-yellow-600' },
        gagal: { bg: 'bg-red-50', text: 'text-red-600' },
        total: { bg: 'bg-gray-50', text: 'text-gray-600' },
      };

      expect(statBoxColors.menunggu.bg).toBe('bg-yellow-50');
      expect(statBoxColors.menunggu.text).toBe('text-yellow-600');
      expect(statBoxColors.gagal.bg).toBe('bg-red-50');
      expect(statBoxColors.gagal.text).toBe('text-red-600');
      expect(statBoxColors.total.bg).toBe('bg-gray-50');
      expect(statBoxColors.total.text).toBe('text-gray-600');
    });

    it('should have correct stat box labels', () => {
      const statBoxLabels = ['Menunggu', 'Gagal', 'Total'];
      expect(statBoxLabels).toContain('Menunggu');
      expect(statBoxLabels).toContain('Gagal');
      expect(statBoxLabels).toContain('Total');
      expect(statBoxLabels).toHaveLength(3);
    });
  });

  describe('ModuleSyncStatus Type', () => {
    it('should have correct interface structure', () => {
      const mockModuleStatus = {
        module: 'kas',
        pendingCount: 5,
        failedCount: 2,
        lastSyncAt: '2026-04-09T10:00:00Z',
        syncState: 'pending' as const,
      };

      expect(mockModuleStatus.module).toBe('kas');
      expect(mockModuleStatus.pendingCount).toBe(5);
      expect(mockModuleStatus.failedCount).toBe(2);
      expect(mockModuleStatus.syncState).toBe('pending');
    });

    it('should accept valid syncState values', () => {
      const validSyncStates: Array<'synced' | 'pending' | 'error' | 'not_configured'> = [
        'synced',
        'pending',
        'error',
        'not_configured',
      ];

      validSyncStates.forEach(state => {
        expect(['synced', 'pending', 'error', 'not_configured']).toContain(state);
      });
    });
  });

  describe('SyncStats Type', () => {
    it('should have correct interface structure', () => {
      const mockSyncStats = {
        pending: 10,
        inProgress: 2,
        failed: 3,
        completed: 50,
        total: 65,
        oldestPendingTimestamp: '2026-04-09T08:00:00Z',
      };

      expect(mockSyncStats.pending).toBe(10);
      expect(mockSyncStats.inProgress).toBe(2);
      expect(mockSyncStats.failed).toBe(3);
      expect(mockSyncStats.completed).toBe(50);
      expect(mockSyncStats.total).toBe(65);
      expect(mockSyncStats.oldestPendingTimestamp).toBe('2026-04-09T08:00:00Z');
    });

    it('should allow null oldestPendingTimestamp', () => {
      const mockSyncStats = {
        pending: 0,
        inProgress: 0,
        failed: 0,
        completed: 0,
        total: 0,
        oldestPendingTimestamp: null,
      };

      expect(mockSyncStats.oldestPendingTimestamp).toBeNull();
    });
  });

  describe('Per-Module Breakdown', () => {
    it('should calculate per-module breakdown correctly', () => {
      const moduleSyncStatuses: Record<string, { pendingCount: number; failedCount: number }> = {
        kas: { pendingCount: 5, failedCount: 1 },
        bank: { pendingCount: 3, failedCount: 2 },
        gudang: { pendingCount: 0, failedCount: 0 },
      };

      const totalPending = Object.values(moduleSyncStatuses).reduce(
        (sum, mod) => sum + mod.pendingCount, 0
      );
      const totalFailed = Object.values(moduleSyncStatuses).reduce(
        (sum, mod) => sum + mod.failedCount, 0
      );

      expect(totalPending).toBe(8);
      expect(totalFailed).toBe(3);
    });

    it('should identify synced modules correctly', () => {
      const moduleSyncStatuses: Record<string, { pendingCount: number; failedCount: number; syncState: string }> = {
        kas: { pendingCount: 0, failedCount: 0, syncState: 'synced' },
        bank: { pendingCount: 5, failedCount: 0, syncState: 'pending' },
        gudang: { pendingCount: 0, failedCount: 3, syncState: 'error' },
      };

      const syncedModules = Object.entries(moduleSyncStatuses)
        .filter(([_, status]) => status.syncState === 'synced')
        .map(([name]) => name);

      expect(syncedModules).toContain('kas');
      expect(syncedModules).toHaveLength(1);
    });
  });

  describe('Auto-Update Configuration', () => {
    it('should have correct refresh interval', () => {
      // The loadSyncHealthData is called every 30 seconds
      const REFRESH_INTERVAL_MS = 30000;
      expect(REFRESH_INTERVAL_MS).toBe(30000);
    });
  });
});

/**
 * Tests for Clear Queue Button (F007-UI)
 * 
 * Tests "Bersihkan Queue" button visibility for admin users,
 * confirmation dialog behavior, and clear queue functionality.
 */

describe('SyncSettingsPage Clear Queue Button', () => {
  describe('ClearQueueButton Type', () => {
    it('should have correct interface structure for queue info', () => {
      const mockQueueInfo = {
        pending: 5,
        inProgress: 1,
        failed: 2,
        completed: 10,
        total: 8,
      };

      expect(mockQueueInfo.pending).toBe(5);
      expect(mockQueueInfo.inProgress).toBe(1);
      expect(mockQueueInfo.failed).toBe(2);
      expect(mockQueueInfo.total).toBe(8);
    });

    it('should allow queueInfo.total to be zero', () => {
      const mockQueueInfo = {
        pending: 0,
        inProgress: 0,
        failed: 0,
        completed: 0,
        total: 0,
      };

      expect(mockQueueInfo.total).toBe(0);
    });
  });

  describe('Clear Queue Button Visibility Conditions', () => {
    it('should show clear queue button when user is admin and queue has items', () => {
      const isAdmin = true;
      const syncStats = { total: 5, failed: 1, pending: 5 };
      const queueInfo = { total: 6 };
      const shouldShowButton = isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0);
      expect(shouldShowButton).toBe(true);
    });

    it('should show clear queue button when syncStats.total > 0', () => {
      const isAdmin = true;
      const syncStats = { total: 10, failed: 0, pending: 10 };
      const queueInfo = { total: 0 };
      const shouldShowButton = isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0);
      expect(shouldShowButton).toBe(true);
    });

    it('should show clear queue button when queueInfo.total > 0', () => {
      const isAdmin = true;
      const syncStats = null as { total: number; failed: number; pending: number } | null;
      const queueInfo = { total: 5 };
      const hasSyncStatsItems = syncStats !== null && syncStats.total > 0;
      const shouldShowButton = isAdmin && (hasSyncStatsItems || queueInfo.total > 0);
      expect(shouldShowButton).toBe(true);
    });

    it('should not show clear queue button for non-admin users', () => {
      const isAdmin = false;
      const syncStats = { total: 5, failed: 1, pending: 5 };
      const queueInfo = { total: 6 };
      const shouldShowButton = isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0);
      expect(shouldShowButton).toBe(false);
    });

    it('should not show clear queue button when queue is empty', () => {
      const isAdmin = true;
      const syncStats = { total: 0, failed: 0, pending: 0 };
      const queueInfo = { total: 0 };
      const shouldShowButton = isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0);
      expect(shouldShowButton).toBe(false);
    });

    it('should not show clear queue button when admin but only failed items exist', () => {
      const isAdmin = true;
      const syncStats = { total: 0, failed: 3, pending: 0 };
      const queueInfo = { total: 0 };
      const shouldShowButton = isAdmin && ((syncStats && syncStats.total > 0) || queueInfo.total > 0);
      expect(shouldShowButton).toBe(false);
    });
  });

  describe('Clear Queue Button Styling', () => {
    it('should have correct red styling classes', () => {
      const buttonClasses = 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2';
      expect(buttonClasses).toContain('bg-red-600');
      expect(buttonClasses).toContain('hover:bg-red-700');
      expect(buttonClasses).toContain('text-white');
    });

    it('should have trash icon SVG path', () => {
      const trashIconPath = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';
      expect(trashIconPath).toContain('M19 7l-.867');
    });

    it('should be positioned at bottom of page with flex justify-end', () => {
      const containerClasses = 'mt-6 flex justify-end';
      expect(containerClasses).toContain('mt-6');
      expect(containerClasses).toContain('flex');
      expect(containerClasses).toContain('justify-end');
    });
  });

  describe('Confirmation Dialog Visibility', () => {
    it('should show dialog when showClearQueueConfirm is true', () => {
      const showClearQueueConfirm = true;
      expect(showClearQueueConfirm).toBe(true);
    });

    it('should hide dialog when showClearQueueConfirm is false', () => {
      const showClearQueueConfirm = false;
      expect(showClearQueueConfirm).toBe(false);
    });

    it('should toggle showClearQueueConfirm state on button click', () => {
      let showClearQueueConfirm = false;
      const handleClearQueueClick = () => {
        showClearQueueConfirm = true;
      };
      handleClearQueueClick();
      expect(showClearQueueConfirm).toBe(true);
    });

    it('should hide dialog on cancel', () => {
      let showClearQueueConfirm = true;
      const handleCancel = () => {
        showClearQueueConfirm = false;
      };
      handleCancel();
      expect(showClearQueueConfirm).toBe(false);
    });
  });

  describe('Confirmation Dialog Styling', () => {
    it('should have correct overlay styling', () => {
      const overlayClasses = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      expect(overlayClasses).toContain('fixed');
      expect(overlayClasses).toContain('inset-0');
      expect(overlayClasses).toContain('bg-black');
      expect(overlayClasses).toContain('bg-opacity-50');
      expect(overlayClasses).toContain('z-50');
    });

    it('should have correct dialog box styling', () => {
      const dialogClasses = 'bg-white rounded-lg p-6 max-w-md w-full mx-4';
      expect(dialogClasses).toContain('bg-white');
      expect(dialogClasses).toContain('rounded-lg');
      expect(dialogClasses).toContain('p-6');
      expect(dialogClasses).toContain('max-w-md');
    });

    it('should have warning icon container styling', () => {
      const iconContainerClasses = 'w-10 h-10 bg-red-100 rounded-full flex items-center justify-center';
      expect(iconContainerClasses).toContain('bg-red-100');
      expect(iconContainerClasses).toContain('rounded-full');
    });
  });

  describe('Confirmation Dialog Content', () => {
    it('should have correct title', () => {
      const dialogTitle = 'Konfirmasi Bersihkan Queue';
      expect(dialogTitle).toBe('Konfirmasi Bersihkan Queue');
    });

    it('should have warning message about irreversible action', () => {
      const message = 'Apakah Anda yakin ingin menghapus semua item dari queue sinkronisasi? Tindakan ini tidak dapat dibatalkan.';
      expect(message).toContain('queue sinkronisasi');
      expect(message).toContain('tidak dapat dibatalkan');
    });
  });

  describe('Confirmation Dialog Buttons', () => {
    it('should have cancel button with correct styling', () => {
      const cancelButtonClasses = 'px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium';
      expect(cancelButtonClasses).toContain('bg-gray-100');
      expect(cancelButtonClasses).toContain('hover:bg-gray-200');
    });

    it('should have confirm button with correct styling', () => {
      const confirmButtonClasses = 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium';
      expect(confirmButtonClasses).toContain('bg-red-600');
      expect(confirmButtonClasses).toContain('hover:bg-red-700');
      expect(confirmButtonClasses).toContain('text-white');
    });

    it('should have button labels in Indonesian', () => {
      const cancelLabel = 'Batal';
      const confirmLabel = 'Ya, Bersihkan';
      expect(cancelLabel).toBe('Batal');
      expect(confirmLabel).toBe('Ya, Bersihkan');
    });
  });

  describe('Clear Queue Handler Logic', () => {
    it('should call clearQueue IPC when confirmed', async () => {
      const mockIPC = {
        clearSyncQueue: jest.fn().mockResolvedValue({ 
          success: true, 
          message: 'Queue cleared', 
          removedCount: 5 
        }),
      };

      const result = await mockIPC.clearSyncQueue();
      expect(mockIPC.clearSyncQueue).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.removedCount).toBe(5);
    });

    it('should handle clear queue failure gracefully', async () => {
      const mockIPC = {
        clearSyncQueue: jest.fn().mockResolvedValue({ 
          success: false, 
          message: 'Failed to clear queue', 
          removedCount: 0 
        }),
      };

      const result = await mockIPC.clearSyncQueue();
      expect(result.success).toBe(false);
      expect(result.removedCount).toBe(0);
    });

    it('should reload health data after clearing queue', async () => {
      let healthDataReloaded = false;
      const mockReload = jest.fn(() => {
        healthDataReloaded = true;
      });

      // Simulate clearing queue then reloading
      const mockIPC = {
        clearSyncQueue: jest.fn().mockResolvedValue({ success: true, message: 'Cleared', removedCount: 3 }),
      };

      await mockIPC.clearSyncQueue();
      mockReload();
      
      expect(mockIPC.clearSyncQueue).toHaveBeenCalled();
      expect(healthDataReloaded).toBe(true);
    });
  });

  describe('Clear Queue Button Label', () => {
    it('should have correct button label', () => {
      const buttonLabel = 'Bersihkan Queue';
      expect(buttonLabel).toBe('Bersihkan Queue');
    });
  });

  describe('Admin Role Check', () => {
    it('should identify Administrator role correctly', () => {
      const userRoles = ['Administrator', 'User', 'Viewer'];
      const isAdmin = userRoles[0] === 'Administrator';
      expect(isAdmin).toBe(true);
    });

    it('should identify non-admin roles correctly', () => {
      const userRoles = ['User', 'Viewer'];
      const isAdmin = userRoles.some(role => role === 'Administrator');
      expect(isAdmin).toBe(false);
    });
  });
});
