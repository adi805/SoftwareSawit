/**
 * Milestone 2: Sync Engine - Runtime Validation Tests
 * Runs inside Electron main process to validate sync engine assertions.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const RESULTS = {
  assertions: {},
  errors: [],
  setupIssues: []
};

function record(id, status, evidence, issue) {
  RESULTS.assertions[id] = { status, evidence, issue };
}

async function runTests() {
  try {
    // Wait for app ready
    await app.whenReady();

    // 1. Initialize databases
    const localDbMgr = require('./dist/main/localDatabaseManager');
    const syncDb = require('./dist/main/syncDatabase');
    const kasDb = require('./dist/main/kasDatabase');
    const bankDb = require('./dist/main/bankDatabase');
    const gudangDb = require('./dist/main/gudangDatabase');
    const coaDb = require('./dist/main/coaDatabase');
    const blokDb = require('./dist/main/blokDatabase');
    const userDb = require('./dist/main/userDatabase');

    try {
      await localDbMgr.localDatabaseManager.initAllDatabases();
    } catch (e) {
      RESULTS.setupIssues.push(`localDbMgr.initAllDatabases: ${e.message}`);
    }
    try {
      await userDb.initUserDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`userDb.initUserDatabase: ${e.message}`);
    }
    try {
      await coaDb.initCOADatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`coaDb.initCOADatabase: ${e.message}`);
    }
    try {
      await blokDb.initBlokDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`blokDb.initBlokDatabase: ${e.message}`);
    }
    try {
      await kasDb.initKasDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`kasDb.initKasDatabase: ${e.message}`);
    }
    try {
      await bankDb.initBankDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`bankDb.initBankDatabase: ${e.message}`);
    }
    try {
      await gudangDb.initGudangDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`gudangDb.initGudangDatabase: ${e.message}`);
    }
    try {
      await syncDb.initSyncDatabase();
    } catch (e) {
      RESULTS.setupIssues.push(`syncDb.initSyncDatabase: ${e.message}`);
    }

    // Import sync engine modules
    const syncDetection = require('./dist/main/syncDetection');
    const syncQueue = require('./dist/main/syncQueueService');
    const conflictResolution = require('./dist/main/conflictResolution');
    const batchSync = require('./dist/main/batchSyncService');
    const localFirstOps = require('./dist/main/localFirstOperations');

    // ==============================
    // VAL-SYNC-001: Sync Detection - Local Changes
    // ==============================
    try {
      syncQueue.clearQueue();
      const result = localFirstOps.createKasTransactionLocalFirst({
        transaction_type: 'Kas Masuk',
        transaction_date: '2026-04-08',
        amount: 100000,
        description: 'Test sync detection',
        coa_id: null,
        aspek_kerja_id: null,
        blok_id: null,
        created_by: 'test-user'
      });

      if (result.success && result.syncStatus === 'pending') {
        const localChanges = syncDetection.detectLocalChanges();
        const kasChanges = localChanges.filter(c => c.module === 'kas');
        if (kasChanges.length >= 1) {
          record('VAL-SYNC-001', 'pass', `Created kas transaction, detected ${kasChanges.length} local change(s), operation=${kasChanges[0].operation}`);
        } else {
          record('VAL-SYNC-001', 'fail', 'Created transaction but syncDetection.detectLocalChanges returned no kas changes', 'Sync queue exists but detection algorithm missed it');
        }
      } else {
        record('VAL-SYNC-001', 'fail', `createKasTransactionLocalFirst result: ${JSON.stringify(result)}`, 'Local-first operation failed');
      }
    } catch (e) {
      record('VAL-SYNC-001', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-002: Sync Detection - Cloud Changes
    // ==============================
    try {
      const remoteChanges = await syncDetection.detectRemoteChanges('kas', new Date().toISOString(), {
        apiBaseUrl: 'http://localhost:8787',
        authToken: 'test',
        deviceId: 'test-device'
      });
      // detectRemoteChanges is a mock returning empty array always
      // This is documented in the source code as mock implementation
      record('VAL-SYNC-002', 'fail', `detectRemoteChanges returned empty array (mock implementation)`, 'Remote change detection is mocked and does not make actual HTTP requests');
    } catch (e) {
      record('VAL-SYNC-002', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-003: Sync Queue - Batch Operations
    // ==============================
    try {
      syncQueue.clearQueue();
      const config = batchSync.getConfig();
      const batchResult = syncQueue.queueSyncBatch('kas', [
        { operation: 'create', recordId: 'batch-test-1', data: { amount: 100 } },
        { operation: 'create', recordId: 'batch-test-2', data: { amount: 200 } },
        { operation: 'create', recordId: 'batch-test-3', data: { amount: 300 } },
      ]);

      if (batchResult.success && batchResult.itemsAdded === 3 && batchResult.batchId) {
        const batch = syncQueue.getBatch(batchResult.batchId);
        if (batch && batch.items.length === 3) {
          record('VAL-SYNC-003', 'pass', `Batch created with ID ${batchResult.batchId}, contains ${batch.items.length} items. Default batchSize=${config.batchSize}`);
        } else {
          record('VAL-SYNC-003', 'fail', `Batch created but retrieval failed: ${JSON.stringify(batch)}`, 'Batch queueing succeeded but batch retrieval returned incomplete data');
        }
      } else {
        record('VAL-SYNC-003', 'fail', `Batch result: ${JSON.stringify(batchResult)}`, 'Batch queueing failed');
      }
    } catch (e) {
      record('VAL-SYNC-003', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-004: Sync Queue - Operation Ordering
    // ==============================
    try {
      syncQueue.clearQueue();
      const timestamp1 = new Date(Date.now() - 3000).toISOString();
      const timestamp2 = new Date(Date.now() - 2000).toISOString();
      const timestamp3 = new Date(Date.now() - 1000).toISOString();

      // Add items directly to queue with controlled timestamps
      syncDb.addToSyncQueue('kas', 'create', 'order-1', { step: 1 }, null);
      syncDb.addToSyncQueue('kas', 'update', 'order-1', { step: 2 }, null);
      syncDb.addToSyncQueue('kas', 'delete', 'order-1', { step: 3 }, null);

      const pending = syncDb.getPendingSyncItems().filter(i => i.recordId === 'order-1');
      const operations = pending.map(i => i.operation);

      if (operations.length === 3 && operations[0] === 'create' && operations[1] === 'update' && operations[2] === 'delete') {
        record('VAL-SYNC-004', 'pass', `Operations returned in FIFO order: ${operations.join(', ')}`);
      } else {
        record('VAL-SYNC-004', 'fail', `Operations order: ${operations.join(', ')}`, 'Sync queue did not maintain FIFO order');
      }
    } catch (e) {
      record('VAL-SYNC-004', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-005: Conflict Detection - Same Record Modified
    // ==============================
    try {
      const localVersion = { recordId: 'conflict-1', data: { fieldA: 'local' }, timestamp: new Date().toISOString() };
      const remoteVersion = { recordId: 'conflict-1', data: { fieldA: 'remote' }, timestamp: new Date(Date.now() - 5000).toISOString() };

      const detection = conflictResolution.detectConflict('kas', localVersion, remoteVersion);
      if (detection.hasConflict && detection.conflictType === 'edit_edit') {
        record('VAL-SYNC-005', 'pass', `Conflict detected: type=${detection.conflictType}, recordId=${detection.localVersion.recordId}`);
      } else {
        record('VAL-SYNC-005', 'fail', `Detection result: ${JSON.stringify(detection)}`, 'Conflict not detected when local and remote data differ');
      }
    } catch (e) {
      record('VAL-SYNC-005', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-006: Conflict Resolution - Local Wins
    // ==============================
    try {
      const conflict = {
        id: 'test-cf-1',
        module: 'kas',
        recordId: 'conflict-local',
        conflictType: 'edit_edit',
        localVersion: { recordId: 'conflict-local', data: { amount: 100 }, timestamp: new Date().toISOString() },
        remoteVersion: { recordId: 'conflict-local', data: { amount: 200 }, timestamp: new Date(Date.now() - 5000).toISOString() },
        resolutionStrategy: 'local_wins',
        needsManualResolution: false,
        createdAt: new Date().toISOString(),
      };
      const result = await conflictResolution.applyResolutionStrategy('kas', conflict, 'local_wins');
      if (result.success && result.resolution === 'local' && result.resolvedData && result.resolvedData.amount === 100) {
        record('VAL-SYNC-006', 'pass', `Local wins resolution applied successfully: ${JSON.stringify(result.resolvedData)}`);
      } else {
        record('VAL-SYNC-006', 'fail', `Resolution result: ${JSON.stringify(result)}`, 'Local wins strategy did not return local data');
      }
    } catch (e) {
      record('VAL-SYNC-006', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-007: Conflict Resolution - Cloud Wins
    // ==============================
    try {
      const conflict = {
        id: 'test-cf-2',
        module: 'kas',
        recordId: 'conflict-remote',
        conflictType: 'edit_edit',
        localVersion: { recordId: 'conflict-remote', data: { amount: 100 }, timestamp: new Date(Date.now() - 5000).toISOString() },
        remoteVersion: { recordId: 'conflict-remote', data: { amount: 200 }, timestamp: new Date().toISOString() },
        resolutionStrategy: 'remote_wins',
        needsManualResolution: false,
        createdAt: new Date().toISOString(),
      };
      const result = await conflictResolution.applyResolutionStrategy('kas', conflict, 'remote_wins');
      if (result.success && result.resolution === 'remote' && result.resolvedData && result.resolvedData.amount === 200) {
        record('VAL-SYNC-007', 'pass', `Remote wins resolution applied successfully: ${JSON.stringify(result.resolvedData)}`);
      } else {
        record('VAL-SYNC-007', 'fail', `Resolution result: ${JSON.stringify(result)}`, 'Remote wins strategy did not return remote data');
      }
    } catch (e) {
      record('VAL-SYNC-007', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-008: Conflict Resolution - Merge
    // ==============================
    try {
      const conflict = {
        id: 'test-cf-3',
        module: 'kas',
        recordId: 'conflict-merge',
        conflictType: 'edit_edit',
        localVersion: { recordId: 'conflict-merge', data: { fieldA: 'local-change', fieldB: 'same' }, timestamp: new Date().toISOString() },
        remoteVersion: { recordId: 'conflict-merge', data: { fieldA: 'remote-change', fieldB: 'same' }, timestamp: new Date(Date.now() - 5000).toISOString() },
        resolutionStrategy: 'merge',
        needsManualResolution: false,
        createdAt: new Date().toISOString(),
      };
      const result = await conflictResolution.applyResolutionStrategy('kas', conflict, 'merge');
      if (result.success && result.resolution === 'merged' && result.resolvedData) {
        const hasConflictFlag = result.resolvedData._conflictResolved === true;
        const hasFieldConflicts = Array.isArray(result.resolvedData._fieldConflicts);
        if (hasConflictFlag && hasFieldConflicts) {
          record('VAL-SYNC-008', 'pass', `Merge resolution produced merged data with _conflictResolved=true, fieldConflicts=${JSON.stringify(result.resolvedData._fieldConflicts)}`);
        } else {
          record('VAL-SYNC-008', 'fail', `Merged data missing flags: ${JSON.stringify(result.resolvedData)}`, 'Merge strategy did not add expected conflict metadata');
        }
      } else {
        record('VAL-SYNC-008', 'fail', `Resolution result: ${JSON.stringify(result)}`, 'Merge strategy failed');
      }
    } catch (e) {
      record('VAL-SYNC-008', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-009: Sync Status Tracking
    // ==============================
    try {
      syncQueue.clearQueue();
      localFirstOps.createKasTransactionLocalFirst({
        transaction_type: 'Kas Masuk',
        transaction_date: '2026-04-08',
        amount: 50000,
        description: 'Test status tracking',
        coa_id: null,
        aspek_kerja_id: null,
        blok_id: null,
        created_by: 'test-user'
      });

      const queueStatus = syncQueue.getQueueStats();
      const pendingItems = syncQueue.getPendingItems();
      const validStatuses = ['pending', 'in_progress', 'failed', 'completed'];
      const allValid = pendingItems.every(i => validStatuses.includes(i.status));

      if (queueStatus.pending >= 1 && allValid) {
        record('VAL-SYNC-009', 'pass', `Queue status tracking works: pending=${queueStatus.pending}, statuses=${pendingItems.map(i => i.status).join(', ')}`);
      } else {
        record('VAL-SYNC-009', 'fail', `queueStatus=${JSON.stringify(queueStatus)}, items=${JSON.stringify(pendingItems)}`, 'Invalid sync status tracking');
      }
    } catch (e) {
      record('VAL-SYNC-009', 'fail', null, e.message);
    }

    // ==============================
    // VAL-SYNC-010: Sync Log - Operation History
    // ==============================
    try {
      // The sync_log table exists in syncDatabase. We can inspect queue state.
      // Check that syncDatabase has sync_log table structure.
      const syncDbPath = path.join(app.getPath('userData'), 'data', 'sync.db');
      const syncDbFileExists = fs.existsSync(syncDbPath);

      // Query the sync_log table directly via syncDatabase if possible
      // syncDatabase doesn't expose a direct query function, but we can inspect the exported functions
      const hasSyncLog = typeof syncDb.logConflict === 'function';
      const hasInspectQueue = typeof syncDb.inspectQueue === 'function';
      const inspection = syncDb.inspectQueue();
      const hasStatistics = inspection && inspection.statistics;

      if (syncDbFileExists && hasSyncLog && hasInspectQueue && hasStatistics) {
        record('VAL-SYNC-010', 'pass', `Sync log infrastructure exists. sync.db exists=${syncDbFileExists}, inspectQueue available, statistics available`);
      } else {
        record('VAL-SYNC-010', 'fail', `syncDbFileExists=${syncDbFileExists}, hasSyncLog=${hasSyncLog}, hasInspectQueue=${hasInspectQueue}`, 'Sync log infrastructure incomplete');
      }
    } catch (e) {
      record('VAL-SYNC-010', 'fail', null, e.message);
    }

  } catch (e) {
    RESULTS.errors.push(`Fatal test error: ${e.message}`);
  }

  // Write results
  fs.writeFileSync(path.join(__dirname, 'sync-engine-test-results.json'), JSON.stringify(RESULTS, null, 2));
  console.log('Tests complete. Results saved to sync-engine-test-results.json');
  app.quit();
}

app.whenReady().then(runTests);
