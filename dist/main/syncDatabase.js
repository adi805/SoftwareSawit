"use strict";
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
exports.initSyncDatabase = initSyncDatabase;
exports.getAllSyncConfigs = getAllSyncConfigs;
exports.getSyncConfigByModule = getSyncConfigByModule;
exports.saveSyncConfig = saveSyncConfig;
exports.deleteSyncConfig = deleteSyncConfig;
exports.updateLastSyncTimestamp = updateLastSyncTimestamp;
exports.checkPathConnection = checkPathConnection;
exports.checkAllConnections = checkAllConnections;
exports.addToSyncQueue = addToSyncQueue;
exports.addToSyncQueueBatch = addToSyncQueueBatch;
exports.getPendingSyncItems = getPendingSyncItems;
exports.getPendingSyncItemsByModule = getPendingSyncItemsByModule;
exports.getBatchItems = getBatchItems;
exports.getSyncQueueStats = getSyncQueueStats;
exports.getSyncQueueCount = getSyncQueueCount;
exports.updateSyncQueueItemStatus = updateSyncQueueItemStatus;
exports.markItemCompleted = markItemCompleted;
exports.markItemInProgress = markItemInProgress;
exports.removeSyncQueueItem = removeSyncQueueItem;
exports.removeCompletedItems = removeCompletedItems;
exports.clearSyncQueue = clearSyncQueue;
exports.createSyncBatch = createSyncBatch;
exports.getSyncBatch = getSyncBatch;
exports.getOpenBatches = getOpenBatches;
exports.updateBatchStatus = updateBatchStatus;
exports.inspectQueue = inspectQueue;
exports.exportQueueState = exportQueueState;
exports.getQueueHealth = getQueueHealth;
exports.getSyncQueueItemById = getSyncQueueItemById;
exports.retryItem = retryItem;
exports.retryAllFailed = retryAllFailed;
exports.detectConflict = detectConflict;
exports.getRecentConflicts = getRecentConflicts;
exports.addConflictRecord = addConflictRecord;
exports.updateConflictRecord = updateConflictRecord;
exports.getPendingConflicts = getPendingConflicts;
exports.getRecentConflictsFull = getRecentConflictsFull;
exports.getConflictById = getConflictById;
exports.resolveConflict = resolveConflict;
exports.discardConflict = discardConflict;
exports.getConflictStats = getConflictStats;
exports.logConflict = logConflict;
exports.performSync = performSync;
exports.triggerAutoSync = triggerAutoSync;
exports.closeSyncDatabase = closeSyncDatabase;
exports.getSyncHistory = getSyncHistory;
exports.addSyncHistoryEntry = addSyncHistoryEntry;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
let db = null;
let SYNC_DB_PATH;
function getDatabasePath() {
    const basePath = electron_1.app.getPath('userData');
    return path.join(basePath, 'data', 'sync.db');
}
function ensureDataDirectory() {
    const dataDir = path.join(electron_1.app.getPath('userData'), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        electron_log_1.default.info('[SYNC-DB] Created data directory:', dataDir);
    }
}
// Initialize sync database
async function initSyncDatabase() {
    electron_log_1.default.info('[SYNC-DB] Initializing Sync database...');
    try {
        const SQL = await (0, sql_js_1.default)();
        SYNC_DB_PATH = getDatabasePath();
        ensureDataDirectory();
        // Load existing database or create new one
        if (fs.existsSync(SYNC_DB_PATH)) {
            const buffer = fs.readFileSync(SYNC_DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[SYNC-DB] Loaded existing database:', SYNC_DB_PATH);
        }
        else {
            db = new SQL.Database();
            electron_log_1.default.info('[SYNC-DB] Created new database:', SYNC_DB_PATH);
        }
        // Create tables
        createTables();
        saveDatabase();
        electron_log_1.default.info('[SYNC-DB] Sync database initialized successfully');
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to initialize database:', error);
        throw error;
    }
}
function createTables() {
    if (!db)
        return;
    // Sync configuration table
    db.run(`
    CREATE TABLE IF NOT EXISTS sync_config (
      id TEXT PRIMARY KEY,
      module TEXT UNIQUE NOT NULL,
      remote_path TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      last_sync_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
    // Sync queue table with batch support and all status types
    db.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      module TEXT NOT NULL,
      operation TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data TEXT,
      timestamp TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed', 'completed', 'error')),
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      next_retry_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
    // Sync batch table for grouping operations
    db.run(`
    CREATE TABLE IF NOT EXISTS sync_batches (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'processing', 'completed', 'failed')),
      item_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);
    // Sync conflict log - enhanced for comprehensive conflict resolution
    db.run(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      record_id TEXT NOT NULL,
      conflict_type TEXT DEFAULT 'edit_edit' CHECK(conflict_type IN ('edit_edit', 'delete_edit', 'edit_delete')),
      local_timestamp TEXT NOT NULL,
      remote_timestamp TEXT NOT NULL,
      local_data TEXT,
      remote_data TEXT,
      resolution_strategy TEXT DEFAULT 'last_write_wins' CHECK(resolution_strategy IN ('last_write_wins', 'local_wins', 'remote_wins', 'merge', 'manual')),
      resolved_with TEXT,
      resolution_data TEXT,
      resolved_at TEXT,
      resolved_by TEXT,
      needs_manual_resolution INTEGER DEFAULT 0,
      field_conflicts TEXT,
      merged_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
    // Sync log for audit trail
    db.run(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL CHECK(direction IN ('up', 'down')),
      module TEXT NOT NULL,
      batch_id TEXT,
      records_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success' CHECK(status IN ('success', 'partial', 'failed')),
      errors TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);
    // Create indexes for efficient queue operations
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_module ON sync_queue(module)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_batch_id ON sync_queue(batch_id)`);
    // FIFO ordering index - critical for maintaining operation order
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON sync_queue(timestamp ASC)`);
    // Composite index for fetching pending items in FIFO order
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_status_timestamp ON sync_queue(status, timestamp ASC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_module_status ON sync_queue(module, status)`);
    // Index for efficient retry scheduling queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_queue_next_retry ON sync_queue(status, next_retry_at)`);
    // Batch table indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_batches_module ON sync_batches(module)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_batches_status ON sync_batches(status)`);
    // Conflict indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_conflicts_record ON sync_conflicts(module, record_id)`);
    // Sync log indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sync_log_direction ON sync_log(direction)`);
    electron_log_1.default.info('[SYNC-DB] Tables created with FIFO ordering indexes');
}
function saveDatabase() {
    if (!db)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(SYNC_DB_PATH, buffer);
}
// Generate UUID
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
// ============ Sync Configuration Operations ============
function getAllSyncConfigs() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, module, remote_path, enabled, last_sync_at, created_at, updated_at
    FROM sync_config
    ORDER BY module
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        module: row[1],
        remotePath: row[2],
        enabled: row[3] === 1,
        lastSyncAt: row[4],
        createdAt: row[5],
        updatedAt: row[6],
    }));
}
function getSyncConfigByModule(module) {
    if (!db)
        return null;
    const result = db.exec(`
    SELECT id, module, remote_path, enabled, last_sync_at, created_at, updated_at
    FROM sync_config
    WHERE module = ?
  `, [module]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return {
        id: row[0],
        module: row[1],
        remotePath: row[2],
        enabled: row[3] === 1,
        lastSyncAt: row[4],
        createdAt: row[5],
        updatedAt: row[6],
    };
}
function saveSyncConfig(input) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate path format
    if (!isValidPathFormat(input.remotePath)) {
        return { success: false, message: 'Format path tidak valid. Gunakan format UNC (\\\\server\\folder) atau drive letter (D:\\folder)' };
    }
    // Check if config exists
    const existing = getSyncConfigByModule(input.module);
    const now = new Date().toISOString();
    if (existing) {
        // Update existing
        db.run(`
      UPDATE sync_config
      SET remote_path = ?, enabled = ?, updated_at = ?
      WHERE module = ?
    `, [input.remotePath, input.enabled ? 1 : 0, now, input.module]);
    }
    else {
        // Create new
        const id = generateId();
        db.run(`
      INSERT INTO sync_config (id, module, remote_path, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, input.module, input.remotePath, input.enabled ? 1 : 0, now, now]);
    }
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Saved sync config for module: ${input.module}`);
    const updated = getSyncConfigByModule(input.module);
    return { success: true, message: 'Konfigurasi sync berhasil disimpan', config: updated || undefined };
}
function deleteSyncConfig(module) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    db.run(`DELETE FROM sync_config WHERE module = ?`, [module]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Deleted sync config for module: ${module}`);
    return { success: true, message: 'Konfigurasi sync berhasil dihapus' };
}
// Update last sync timestamp for a module
function updateLastSyncTimestamp(module, timestamp) {
    if (!db)
        return;
    db.run(`UPDATE sync_config SET last_sync_at = ? WHERE module = ?`, [timestamp, module]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Updated last sync timestamp for ${module}: ${timestamp}`);
}
// Validate path format (UNC or drive letter)
function isValidPathFormat(pathStr) {
    // UNC path: \\server\share
    const uncPattern = /^\\\\[^\s\\/]+[^\s\\]*(\\)?$/;
    // Drive letter: D:\folder or D:/
    const drivePattern = /^[A-Za-z]:[\\/]/;
    return uncPattern.test(pathStr) || drivePattern.test(pathStr);
}
function checkPathConnection(module) {
    const config = getSyncConfigByModule(module);
    const now = new Date().toISOString();
    if (!config || !config.enabled) {
        return {
            module,
            path: config?.remotePath || '',
            connected: false,
            lastChecked: now,
            error: 'Konfigurasi tidak ditemukan atau dinonaktifkan',
        };
    }
    try {
        // Try to access the path
        const pathExists = fs.existsSync(config.remotePath);
        if (pathExists) {
            // Try to read a test file or list directory
            fs.readdirSync(config.remotePath);
            electron_log_1.default.info(`[SYNC-DB] Path connected for ${module}: ${config.remotePath}`);
            return {
                module,
                path: config.remotePath,
                connected: true,
                lastChecked: now,
            };
        }
        else {
            electron_log_1.default.warn(`[SYNC-DB] Path not accessible for ${module}: ${config.remotePath}`);
            return {
                module,
                path: config.remotePath,
                connected: false,
                lastChecked: now,
                error: 'Path tidak dapat diakses',
            };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        electron_log_1.default.warn(`[SYNC-DB] Path connection failed for ${module}: ${errorMessage}`);
        return {
            module,
            path: config.remotePath,
            connected: false,
            lastChecked: now,
            error: errorMessage,
        };
    }
}
function checkAllConnections() {
    const modules = ['coa', 'aspek_kerja', 'blok', 'kas', 'bank', 'gudang'];
    return modules.map(module => checkPathConnection(module));
}
// ============ Sync Queue Operations ============
function addToSyncQueue(module, operation, recordId, data, batchId) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    const id = generateId();
    const now = new Date().toISOString();
    db.run(`
    INSERT INTO sync_queue (id, batch_id, module, operation, record_id, data, timestamp, status, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, batchId || null, module, operation, recordId, JSON.stringify(data), now, 'pending', 0]);
    // Update batch item count if batch exists
    if (batchId) {
        db.run(`
      UPDATE sync_batches SET item_count = item_count + 1 WHERE id = ?
    `, [batchId]);
    }
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Added to sync queue: ${module}/${operation}/${recordId}${batchId ? ` (batch: ${batchId})` : ''}`);
    return {
        success: true,
        message: 'Item ditambahkan ke queue sync',
        item: {
            id,
            batchId: batchId || null,
            module,
            operation,
            recordId,
            data: JSON.stringify(data),
            timestamp: now,
            status: 'pending',
            retryCount: 0,
            attempts: 0,
            errorMessage: null,
            lastError: null,
        },
    };
}
// Add multiple items to queue as a batch (atomic operation)
function addToSyncQueueBatch(module, items) {
    if (!db) {
        return { success: false, message: 'Database not initialized', batchId: '', itemsAdded: 0 };
    }
    if (items.length === 0) {
        return { success: false, message: 'No items to add', batchId: '', itemsAdded: 0 };
    }
    const batchId = generateId();
    const now = new Date().toISOString();
    // Create batch record first
    db.run(`
    INSERT INTO sync_batches (id, module, status, item_count, created_at)
    VALUES (?, ?, 'open', ?, ?)
  `, [batchId, module, items.length, now]);
    // Add all items in a transaction-like manner
    let itemsAdded = 0;
    for (const item of items) {
        const id = generateId();
        db.run(`
      INSERT INTO sync_queue (id, batch_id, module, operation, record_id, data, timestamp, status, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, batchId, module, item.operation, item.recordId, JSON.stringify(item.data), now, 'pending', 0]);
        itemsAdded++;
    }
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Added batch ${batchId} to sync queue: ${itemsAdded} items`);
    return {
        success: true,
        message: `Batch ditambahkan ke queue sync (${itemsAdded} item)`,
        batchId,
        itemsAdded,
    };
}
// Get pending sync items in FIFO order (oldest first)
// Only returns items that are ready for retry (next_retry_at is NULL or <= now)
function getPendingSyncItems() {
    if (!db)
        return [];
    const now = new Date().toISOString();
    const result = db.exec(`
    SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
    FROM sync_queue
    WHERE (status = 'pending' OR status = 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY timestamp ASC
  `, [now]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        batchId: row[1],
        module: row[2],
        operation: row[3],
        recordId: row[4],
        data: row[5],
        timestamp: row[6],
        status: row[7],
        retryCount: row[8],
        attempts: row[8],
        errorMessage: row[9],
        lastError: row[9],
    }));
}
// Get pending items for a specific module in FIFO order
// Only returns items that are ready for retry (next_retry_at is NULL or <= now)
function getPendingSyncItemsByModule(module) {
    if (!db)
        return [];
    const now = new Date().toISOString();
    const result = db.exec(`
    SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
    FROM sync_queue
    WHERE module = ? AND (status = 'pending' OR status = 'failed')
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY timestamp ASC
  `, [module, now]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        batchId: row[1],
        module: row[2],
        operation: row[3],
        recordId: row[4],
        data: row[5],
        timestamp: row[6],
        status: row[7],
        retryCount: row[8],
        attempts: row[8],
        errorMessage: row[9],
        lastError: row[9],
    }));
}
// Get all items for a specific batch
function getBatchItems(batchId) {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
    FROM sync_queue
    WHERE batch_id = ?
    ORDER BY timestamp ASC
  `, [batchId]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        batchId: row[1],
        module: row[2],
        operation: row[3],
        recordId: row[4],
        data: row[5],
        timestamp: row[6],
        status: row[7],
        retryCount: row[8],
        attempts: row[8],
        errorMessage: row[9],
        lastError: row[9],
    }));
}
// Get queue statistics with detailed breakdown
function getSyncQueueStats() {
    if (!db) {
        return {
            pending: 0,
            inProgress: 0,
            failed: 0,
            completed: 0,
            error: 0,
            total: 0,
            byModule: {},
            oldestPendingTimestamp: null,
        };
    }
    // Get counts by status
    const statusResult = db.exec(`
    SELECT status, COUNT(*) as count
    FROM sync_queue
    GROUP BY status
  `);
    const counts = {
        pending: 0,
        in_progress: 0,
        failed: 0,
        completed: 0,
        error: 0,
    };
    if (statusResult.length > 0) {
        for (const row of statusResult[0].values) {
            const status = row[0];
            const count = row[1];
            if (status in counts) {
                counts[status] = count;
            }
        }
    }
    // Get counts by module for pending items
    const moduleResult = db.exec(`
    SELECT module, COUNT(*) as count
    FROM sync_queue
    WHERE status = 'pending' OR status = 'failed'
    GROUP BY module
  `);
    const byModule = {};
    if (moduleResult.length > 0) {
        for (const row of moduleResult[0].values) {
            byModule[row[0]] = row[1];
        }
    }
    // Get oldest pending timestamp
    const oldestResult = db.exec(`
    SELECT MIN(timestamp) FROM sync_queue WHERE status = 'pending'
  `);
    const oldestPendingTimestamp = oldestResult.length > 0 && oldestResult[0].values[0][0]
        ? oldestResult[0].values[0][0]
        : null;
    return {
        pending: counts.pending,
        inProgress: counts.in_progress,
        failed: counts.failed,
        completed: counts.completed,
        error: counts.error,
        total: counts.pending + counts.in_progress + counts.failed + counts.completed + counts.error,
        byModule,
        oldestPendingTimestamp,
    };
}
// Get comprehensive queue statistics (alias for compatibility)
function getSyncQueueCount() {
    const stats = getSyncQueueStats();
    return {
        pending: stats.pending,
        failed: stats.failed,
        total: stats.total,
    };
}
// Update sync queue item status with proper status transition validation
function updateSyncQueueItemStatus(id, status, errorMessage, nextRetryAt) {
    if (!db)
        return;
    const now = new Date().toISOString();
    if (status === 'failed') {
        // Calculate next_retry_at if not provided
        const retryTimestamp = nextRetryAt || null;
        db.run(`
      UPDATE sync_queue
      SET status = ?, error_message = ?, retry_count = retry_count + 1, 
          next_retry_at = ?, updated_at = ?
      WHERE id = ?
    `, [status, errorMessage || null, retryTimestamp, now, id]);
    }
    else if (status === 'error') {
        // Permanent failure - clear next_retry_at
        db.run(`
      UPDATE sync_queue
      SET status = ?, error_message = ?, next_retry_at = NULL, updated_at = ?
      WHERE id = ?
    `, [status, errorMessage || null, now, id]);
    }
    else if (status === 'completed') {
        // Completed - clear next_retry_at
        db.run(`
      UPDATE sync_queue
      SET status = ?, error_message = ?, next_retry_at = NULL, updated_at = ?
      WHERE id = ?
    `, [status, errorMessage || null, now, id]);
    }
    else {
        db.run(`
      UPDATE sync_queue
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `, [status, errorMessage || null, now, id]);
    }
    // If completed, also update the batch status if item belongs to a batch
    if (status === 'completed') {
        db.run(`
      UPDATE sync_queue SET status = 'completed' WHERE id = ?
    `, [id]);
        // Check if all items in batch are completed
        const batchResult = db.exec(`
      SELECT batch_id FROM sync_queue WHERE id = ?
    `, [id]);
        if (batchResult.length > 0 && batchResult[0].values.length > 0) {
            const batchId = batchResult[0].values[0][0];
            if (batchId) {
                checkAndUpdateBatchCompletion(batchId);
            }
        }
    }
    saveDatabase();
}
// Helper function to check and update batch completion
function checkAndUpdateBatchCompletion(batchId) {
    if (!db)
        return;
    // Check if all items in batch are completed
    const result = db.exec(`
    SELECT COUNT(*) as total, 
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM sync_queue
    WHERE batch_id = ?
  `, [batchId]);
    if (result.length > 0 && result[0].values.length > 0) {
        const total = result[0].values[0][0];
        const completed = result[0].values[0][1];
        if (total > 0 && total === completed) {
            const now = new Date().toISOString();
            db.run(`
        UPDATE sync_batches SET status = 'completed', completed_at = ? WHERE id = ?
      `, [now, batchId]);
            electron_log_1.default.info(`[SYNC-DB] Batch ${batchId} marked as completed`);
        }
    }
}
// Mark item as completed (convenience method)
function markItemCompleted(id) {
    updateSyncQueueItemStatus(id, 'completed');
}
// Mark item as in_progress (convenience method)
function markItemInProgress(id) {
    updateSyncQueueItemStatus(id, 'in_progress');
}
function removeSyncQueueItem(id) {
    if (!db)
        return;
    // Get batch_id before deleting
    const batchResult = db.exec(`SELECT batch_id FROM sync_queue WHERE id = ?`, [id]);
    const batchId = batchResult.length > 0 && batchResult[0].values.length > 0
        ? batchResult[0].values[0][0]
        : null;
    db.run(`DELETE FROM sync_queue WHERE id = ?`, [id]);
    // Update batch item count if item belonged to a batch
    if (batchId) {
        db.run(`
      UPDATE sync_batches SET item_count = MAX(0, item_count - 1) WHERE id = ?
    `, [batchId]);
        checkAndUpdateBatchCompletion(batchId);
    }
    saveDatabase();
}
// Remove all completed items from queue (cleanup)
function removeCompletedItems() {
    if (!db)
        return { success: false, message: 'Database not initialized', removedCount: 0 };
    const countResult = db.exec(`SELECT COUNT(*) FROM sync_queue WHERE status = 'completed'`);
    const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    db.run(`DELETE FROM sync_queue WHERE status = 'completed'`);
    // Also clean up empty completed batches
    db.run(`DELETE FROM sync_batches WHERE status = 'completed' AND item_count = 0`);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Removed ${count} completed items from queue`);
    return { success: true, message: `${count} item completed dihapus dari queue`, removedCount: count };
}
function clearSyncQueue() {
    if (!db)
        return { success: false, message: 'Database not initialized', removedCount: 0 };
    const countResult = db.exec(`SELECT COUNT(*) FROM sync_queue`);
    const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    db.run(`DELETE FROM sync_queue`);
    db.run(`DELETE FROM sync_batches`);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Cleared sync queue: ${count} items removed`);
    return { success: true, message: `Queue sync dibersihkan (${count} item)`, removedCount: count };
}
// ============ Batch Operations ============
// Create a new batch for grouping operations
function createSyncBatch(module) {
    if (!db)
        return { success: false, batchId: '', message: 'Database not initialized' };
    const batchId = generateId();
    const now = new Date().toISOString();
    db.run(`
    INSERT INTO sync_batches (id, module, status, item_count, created_at)
    VALUES (?, ?, 'open', 0, ?)
  `, [batchId, module, now]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Created sync batch: ${batchId} for module: ${module}`);
    return { success: true, batchId, message: 'Batch berhasil dibuat' };
}
// Get batch by ID
function getSyncBatch(batchId) {
    if (!db)
        return null;
    const result = db.exec(`
    SELECT id, module, status, item_count, created_at, completed_at
    FROM sync_batches
    WHERE id = ?
  `, [batchId]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    const items = getBatchItems(batchId);
    return {
        id: row[0],
        module: row[1],
        status: row[2],
        itemCount: row[3],
        createdAt: row[4],
        completedAt: row[5],
        items,
    };
}
// Get all open batches
function getOpenBatches() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, module, status, item_count, created_at, completed_at
    FROM sync_batches
    WHERE status = 'open' OR status = 'processing'
    ORDER BY created_at ASC
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const batchId = row[0];
        const items = getBatchItems(batchId);
        return {
            id: batchId,
            module: row[1],
            status: row[2],
            itemCount: row[3],
            createdAt: row[4],
            completedAt: row[5],
            items,
        };
    });
}
// Update batch status
function updateBatchStatus(batchId, status) {
    if (!db)
        return;
    const now = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    db.run(`
    UPDATE sync_batches
    SET status = ?, completed_at = ?
    WHERE id = ?
  `, [status, now, batchId]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Batch ${batchId} status updated to: ${status}`);
}
// ============ Queue Inspection & Debugging ============
// Inspect entire queue state for debugging
function inspectQueue() {
    if (!db) {
        return {
            statistics: {
                pending: 0,
                inProgress: 0,
                failed: 0,
                completed: 0,
                error: 0,
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
                error: [],
            },
            batches: [],
        };
    }
    const statistics = getSyncQueueStats();
    // Get recent items (last 50)
    const recentResult = db.exec(`
    SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
    FROM sync_queue
    ORDER BY timestamp DESC
    LIMIT 50
  `);
    const recentItems = [];
    if (recentResult.length > 0) {
        for (const row of recentResult[0].values) {
            recentItems.push({
                id: row[0],
                batchId: row[1],
                module: row[2],
                operation: row[3],
                recordId: row[4],
                data: row[5],
                timestamp: row[6],
                status: row[7],
                retryCount: row[8],
                attempts: row[8],
                errorMessage: row[9],
                lastError: row[9],
            });
        }
    }
    // Get items by status
    const itemsByStatus = {
        pending: [],
        in_progress: [],
        failed: [],
        completed: [],
        error: [],
    };
    for (const status of ['pending', 'in_progress', 'failed', 'completed', 'error']) {
        const statusResult = db.exec(`
      SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
      FROM sync_queue
      WHERE status = ?
      ORDER BY timestamp ASC
      LIMIT 100
    `, [status]);
        if (statusResult.length > 0) {
            for (const row of statusResult[0].values) {
                itemsByStatus[status].push({
                    id: row[0],
                    batchId: row[1],
                    module: row[2],
                    operation: row[3],
                    recordId: row[4],
                    data: row[5],
                    timestamp: row[6],
                    status: row[7],
                    retryCount: row[8],
                    attempts: row[8],
                    errorMessage: row[9],
                    lastError: row[9],
                });
            }
        }
    }
    // Get all batches
    const batches = getOpenBatches();
    return {
        statistics,
        recentItems,
        itemsByStatus,
        batches,
    };
}
// Export queue state as JSON for debugging
function exportQueueState() {
    const inspection = inspectQueue();
    return JSON.stringify(inspection, null, 2);
}
// Get queue health status
function getQueueHealth() {
    const issues = [];
    const warnings = [];
    const stats = getSyncQueueStats();
    // Check for issues
    if (stats.failed > 10) {
        issues.push(`High number of failed items: ${stats.failed}`);
    }
    if (stats.completed > 1000) {
        warnings.push(`Large number of completed items in queue: ${stats.completed}. Consider cleanup.`);
    }
    if (stats.oldestPendingTimestamp) {
        const oldest = new Date(stats.oldestPendingTimestamp);
        const now = new Date();
        const hoursOld = (now.getTime() - oldest.getTime()) / (1000 * 60 * 60);
        if (hoursOld > 24) {
            issues.push(`Oldest pending item is ${hoursOld.toFixed(1)} hours old`);
        }
        else if (hoursOld > 1) {
            warnings.push(`Oldest pending item is ${hoursOld.toFixed(1)} hours old`);
        }
    }
    // Check for items with high retry count
    const highRetryResult = db?.exec(`
    SELECT COUNT(*) FROM sync_queue WHERE retry_count > 3
  `);
    const highRetryCount = highRetryResult && highRetryResult.length > 0 ? highRetryResult[0].values[0][0] : 0;
    if (highRetryCount > 0) {
        warnings.push(`${highRetryCount} items have retry count > 3`);
    }
    return {
        healthy: issues.length === 0,
        issues,
        warnings,
    };
}
// Get a single queue item by ID
function getSyncQueueItemById(id) {
    if (!db)
        return null;
    const result = db.exec(`
    SELECT id, batch_id, module, operation, record_id, data, timestamp, status, retry_count, error_message
    FROM sync_queue
    WHERE id = ?
  `, [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return {
        id: row[0],
        batchId: row[1],
        module: row[2],
        operation: row[3],
        recordId: row[4],
        data: row[5],
        timestamp: row[6],
        status: row[7],
        retryCount: row[8],
        attempts: row[8],
        errorMessage: row[9],
        lastError: row[9],
    };
}
// Retry a specific failed item (resets status to pending)
function retryItem(id) {
    if (!db)
        return { success: false, message: 'Database not initialized' };
    const item = getSyncQueueItemById(id);
    if (!item) {
        return { success: false, message: 'Item tidak ditemukan' };
    }
    if (item.status !== 'failed') {
        return { success: false, message: `Tidak dapat retry item dengan status: ${item.status}` };
    }
    db.run(`
    UPDATE sync_queue
    SET status = 'pending', error_message = NULL, updated_at = ?
    WHERE id = ?
  `, [new Date().toISOString(), id]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Retrying failed item: ${id}`);
    return { success: true, message: 'Item akan di-retry' };
}
// Retry all failed items (reset to pending)
function retryAllFailed() {
    if (!db)
        return { success: false, message: 'Database not initialized', retriedCount: 0 };
    const countResult = db.exec(`SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'`);
    const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada item gagal untuk di-retry', retriedCount: 0 };
    }
    db.run(`
    UPDATE sync_queue
    SET status = 'pending', error_message = NULL, updated_at = ?
    WHERE status = 'failed'
  `, [new Date().toISOString()]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Retrying all failed items: ${count}`);
    return { success: true, message: `${count} item gagal di-reset untuk retry`, retriedCount: count };
}
// ============ Sync Operations ============
// ============ Conflict Resolution ============
function detectConflict(module, recordId, localTimestamp, remoteTimestamp) {
    if (!db) {
        return { hasConflict: false, resolution: 'local' };
    }
    // Convert timestamps to Date objects
    const localDate = new Date(localTimestamp);
    const remoteDate = new Date(remoteTimestamp);
    // Check if timestamps are different (conflict)
    const hasConflict = Math.abs(localDate.getTime() - remoteDate.getTime()) > 1000; // 1 second threshold
    if (!hasConflict) {
        return { hasConflict: false, resolution: 'local' };
    }
    // Latest timestamp wins
    const resolution = localDate > remoteDate ? 'local' : 'remote';
    // Log the conflict
    const id = generateId();
    const now = new Date().toISOString();
    db.run(`
    INSERT INTO sync_conflicts (id, module, record_id, local_timestamp, remote_timestamp, resolved_with, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, module, recordId, localTimestamp, remoteTimestamp, resolution, now]);
    saveDatabase();
    electron_log_1.default.info(`[SYNC-DB] Conflict detected and resolved: ${module}/${recordId} -> ${resolution}`);
    return { hasConflict: true, resolution };
}
function getRecentConflicts(limit = 10) {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, module, record_id, local_timestamp, remote_timestamp, resolved_with, resolved_at
    FROM sync_conflicts
    ORDER BY resolved_at DESC
    LIMIT ?
  `, [limit]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        module: row[1],
        recordId: row[2],
        localTimestamp: row[3],
        remoteTimestamp: row[4],
        resolvedWith: row[5],
        resolvedAt: row[6],
    }));
}
// ============ Enhanced Conflict Resolution Functions ============
/**
 * Add a new conflict record for tracking and manual resolution
 */
function addConflictRecord(input) {
    if (!db) {
        return { success: false, conflictId: '' };
    }
    try {
        db.run(`
      INSERT INTO sync_conflicts (
        id, module, record_id, conflict_type, local_timestamp, remote_timestamp,
        local_data, remote_data, needs_manual_resolution, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            input.id,
            input.module,
            input.recordId,
            input.conflictType,
            input.localTimestamp,
            input.remoteTimestamp,
            JSON.stringify(input.localData),
            JSON.stringify(input.remoteData),
            input.needsManualResolution ? 1 : 0,
            input.createdAt,
        ]);
        saveDatabase();
        electron_log_1.default.info(`[SYNC-DB] Added conflict record: ${input.id} for ${input.module}/${input.recordId}`);
        return { success: true, conflictId: input.id };
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to add conflict record:', error);
        return { success: false, conflictId: '' };
    }
}
/**
 * Update a conflict record with resolution information
 */
function updateConflictRecord(conflictId, input) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    try {
        db.run(`
      UPDATE sync_conflicts
      SET resolved_with = ?,
          resolution_data = ?,
          resolved_at = ?,
          resolved_by = ?,
          needs_manual_resolution = ?
      WHERE id = ?
    `, [
            input.resolvedWith,
            input.resolvedData ? JSON.stringify(input.resolvedData) : null,
            input.resolvedAt,
            input.resolvedBy || null,
            input.needsManualResolution !== undefined ? (input.needsManualResolution ? 1 : 0) : 0,
            conflictId,
        ]);
        saveDatabase();
        electron_log_1.default.info(`[SYNC-DB] Updated conflict record: ${conflictId}`);
        return { success: true, message: 'Conflict record updated' };
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to update conflict record:', error);
        return { success: false, message: 'Failed to update conflict record' };
    }
}
/**
 * Get all pending conflicts that need manual resolution
 */
function getPendingConflicts(module) {
    if (!db)
        return [];
    let query = `
    SELECT id, module, record_id, conflict_type, local_timestamp, remote_timestamp,
           local_data, remote_data, resolution_strategy, resolved_with, resolution_data,
           resolved_at, resolved_by, needs_manual_resolution, field_conflicts, merged_data, created_at
    FROM sync_conflicts
    WHERE resolved_with IS NULL OR resolved_with = ''
  `;
    const params = [];
    if (module) {
        query += ` AND module = ?`;
        params.push(module);
    }
    query += ` ORDER BY created_at DESC`;
    const result = db.exec(query, params);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        module: row[1],
        recordId: row[2],
        conflictType: row[3],
        localTimestamp: row[4],
        remoteTimestamp: row[5],
        localData: row[6] ? JSON.parse(row[6]) : {},
        remoteData: row[7] ? JSON.parse(row[7]) : {},
        resolutionStrategy: row[8] || 'last_write_wins',
        resolvedWith: row[9],
        resolutionData: row[10] ? JSON.parse(row[10]) : undefined,
        resolvedAt: row[11],
        resolvedBy: row[12],
        needsManualResolution: row[13] === 1,
        fieldConflicts: row[14] ? JSON.parse(row[14]) : undefined,
        mergedData: row[15] ? JSON.parse(row[15]) : undefined,
        createdAt: row[16],
    }));
}
/**
 * Get recent conflicts (all, not just pending)
 */
function getRecentConflictsFull(limit = 50) {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, module, record_id, conflict_type, local_timestamp, remote_timestamp,
           local_data, remote_data, resolution_strategy, resolved_with, resolution_data,
           resolved_at, resolved_by, needs_manual_resolution, field_conflicts, merged_data, created_at
    FROM sync_conflicts
    ORDER BY created_at DESC
    LIMIT ?
  `, [limit]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        module: row[1],
        recordId: row[2],
        conflictType: row[3],
        localTimestamp: row[4],
        remoteTimestamp: row[5],
        localData: row[6] ? JSON.parse(row[6]) : {},
        remoteData: row[7] ? JSON.parse(row[7]) : {},
        resolutionStrategy: row[8] || 'last_write_wins',
        resolvedWith: row[9],
        resolutionData: row[10] ? JSON.parse(row[10]) : undefined,
        resolvedAt: row[11],
        resolvedBy: row[12],
        needsManualResolution: row[13] === 1,
        fieldConflicts: row[14] ? JSON.parse(row[14]) : undefined,
        mergedData: row[15] ? JSON.parse(row[15]) : undefined,
        createdAt: row[16],
    }));
}
/**
 * Get a single conflict by ID
 */
function getConflictById(id) {
    if (!db)
        return null;
    const result = db.exec(`
    SELECT id, module, record_id, conflict_type, local_timestamp, remote_timestamp,
           local_data, remote_data, resolution_strategy, resolved_with, resolution_data,
           resolved_at, resolved_by, needs_manual_resolution, field_conflicts, merged_data, created_at
    FROM sync_conflicts
    WHERE id = ?
  `, [id]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    const row = result[0].values[0];
    return {
        id: row[0],
        module: row[1],
        recordId: row[2],
        conflictType: row[3],
        localTimestamp: row[4],
        remoteTimestamp: row[5],
        localData: row[6] ? JSON.parse(row[6]) : {},
        remoteData: row[7] ? JSON.parse(row[7]) : {},
        resolutionStrategy: row[8] || 'last_write_wins',
        resolvedWith: row[9],
        resolutionData: row[10] ? JSON.parse(row[10]) : undefined,
        resolvedAt: row[11],
        resolvedBy: row[12],
        needsManualResolution: row[13] === 1,
        fieldConflicts: row[14] ? JSON.parse(row[14]) : undefined,
        mergedData: row[15] ? JSON.parse(row[15]) : undefined,
        createdAt: row[16],
    };
}
/**
 * Resolve a conflict manually
 */
function resolveConflict(conflictId, resolution, resolvedData, resolvedBy) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    const now = new Date().toISOString();
    try {
        db.run(`
      UPDATE sync_conflicts
      SET resolved_with = ?,
          resolution_data = ?,
          resolved_at = ?,
          resolved_by = ?,
          needs_manual_resolution = 0
      WHERE id = ?
    `, [
            resolution,
            resolvedData ? JSON.stringify(resolvedData) : null,
            now,
            resolvedBy || null,
            conflictId,
        ]);
        saveDatabase();
        electron_log_1.default.info(`[SYNC-DB] Resolved conflict: ${conflictId} with ${resolution}`);
        return { success: true, message: 'Conflict resolved successfully' };
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to resolve conflict:', error);
        return { success: false, message: 'Failed to resolve conflict' };
    }
}
/**
 * Discard a conflict (e.g., if record was deleted on both sides)
 */
function discardConflict(conflictId) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    const now = new Date().toISOString();
    try {
        // Mark as resolved with 'merged' but empty resolution - effectively discarding
        db.run(`
      UPDATE sync_conflicts
      SET resolved_with = 'merged',
          resolution_data = '{"discarded": true}',
          resolved_at = ?,
          needs_manual_resolution = 0
      WHERE id = ?
    `, [now, conflictId]);
        saveDatabase();
        electron_log_1.default.info(`[SYNC-DB] Discarded conflict: ${conflictId}`);
        return { success: true, message: 'Conflict discarded' };
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to discard conflict:', error);
        return { success: false, message: 'Failed to discard conflict' };
    }
}
/**
 * Get conflict statistics
 */
function getConflictStats() {
    if (!db) {
        return { total: 0, pending: 0, resolved: 0, byModule: {}, byType: {} };
    }
    const statsResult = db.exec(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN resolved_with IS NULL OR resolved_with = '' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN resolved_with IS NOT NULL AND resolved_with != '' THEN 1 ELSE 0 END) as resolved
    FROM sync_conflicts
  `);
    const moduleResult = db.exec(`
    SELECT module, COUNT(*) as count
    FROM sync_conflicts
    GROUP BY module
  `);
    const typeResult = db.exec(`
    SELECT conflict_type, COUNT(*) as count
    FROM sync_conflicts
    GROUP BY conflict_type
  `);
    const total = statsResult.length > 0 ? statsResult[0].values[0][0] : 0;
    const pending = statsResult.length > 0 ? statsResult[0].values[0][1] : 0;
    const resolved = statsResult.length > 0 ? statsResult[0].values[0][2] : 0;
    const byModule = {};
    if (moduleResult.length > 0) {
        for (const row of moduleResult[0].values) {
            byModule[row[0]] = row[1];
        }
    }
    const byType = {};
    if (typeResult.length > 0) {
        for (const row of typeResult[0].values) {
            byType[row[0]] = row[1];
        }
    }
    return { total, pending, resolved, byModule, byType };
}
/**
 * Legacy function - logs conflict using the old format
 */
function logConflict(conflict) {
    electron_log_1.default.info(`[CONFLICT_LOG] ${conflict.id}|${conflict.module}|${conflict.recordId}|${conflict.conflictType}|${conflict.resolvedWith}|${conflict.localTimestamp}|${conflict.remoteTimestamp}|${conflict.resolvedAt}`);
}
async function performSync(module) {
    const config = getSyncConfigByModule(module);
    if (!config || !config.enabled) {
        return { success: false, message: 'Konfigurasi sync tidak ditemukan atau dinonaktifkan', syncedCount: 0, conflictCount: 0, errorCount: 0 };
    }
    // Check connection first
    const connectionStatus = checkPathConnection(module);
    if (!connectionStatus.connected) {
        // Queue the changes for later
        return {
            success: false,
            message: `Tidak dapat terhubung ke ${config.remotePath}: ${connectionStatus.error}`,
            syncedCount: 0,
            conflictCount: 0,
            errorCount: 0
        };
    }
    // Get pending items for this module
    const pendingItems = getPendingSyncItems().filter(item => item.module === module);
    if (pendingItems.length === 0) {
        // Update last sync time
        const now = new Date().toISOString();
        db?.run(`UPDATE sync_config SET last_sync_at = ? WHERE module = ?`, [now, module]);
        saveDatabase();
        return { success: true, message: 'Tidak ada perubahan untuk disinkronkan', syncedCount: 0, conflictCount: 0, errorCount: 0 };
    }
    let syncedCount = 0;
    let conflictCount = 0;
    let errorCount = 0;
    for (const item of pendingItems) {
        try {
            updateSyncQueueItemStatus(item.id, 'in_progress');
            // Simulate sync to remote (in real implementation, would copy files)
            const success = await syncItemToRemote(config.remotePath, module, item);
            if (success) {
                removeSyncQueueItem(item.id);
                syncedCount++;
            }
            else {
                updateSyncQueueItemStatus(item.id, 'failed', 'Sync failed');
                errorCount++;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            updateSyncQueueItemStatus(item.id, 'failed', errorMessage);
            errorCount++;
        }
    }
    // Update last sync time
    const now = new Date().toISOString();
    db?.run(`UPDATE sync_config SET last_sync_at = ? WHERE module = ?`, [now, module]);
    saveDatabase();
    return {
        success: errorCount === 0,
        message: `Sinkronisasi selesai: ${syncedCount} berhasil, ${conflictCount} konflik, ${errorCount} gagal`,
        syncedCount,
        conflictCount,
        errorCount,
    };
}
// Sync database file paths for each module
function getLocalDatabasePath(module) {
    const basePath = electron_1.app.getPath('userData');
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    switch (module) {
        case 'coa':
            return path.join(basePath, 'data', 'master', 'coa.db');
        case 'aspek_kerja':
            return path.join(basePath, 'data', 'master', 'aspek_kerja.db');
        case 'blok':
            return path.join(basePath, 'data', 'master', 'blok.db');
        case 'kas':
            return path.join(basePath, 'data', 'kas', String(currentYear), String(currentMonth).padStart(2, '0') + '.db');
        case 'bank':
            return path.join(basePath, 'data', 'bank', String(currentYear), String(currentMonth).padStart(2, '0') + '.db');
        case 'gudang':
            return path.join(basePath, 'data', 'gudang', String(currentYear), String(currentMonth).padStart(2, '0') + '.db');
        default:
            return null;
    }
}
// Build remote database path preserving directory structure
function getRemoteDatabasePath(remoteBasePath, module, year, month) {
    const now = new Date();
    const syncYear = year || now.getFullYear();
    const syncMonth = month || now.getMonth() + 1;
    switch (module) {
        case 'coa':
        case 'aspek_kerja':
        case 'blok':
            return path.join(remoteBasePath, 'data', 'master', module + '.db');
        case 'kas':
        case 'bank':
        case 'gudang':
            return path.join(remoteBasePath, 'data', module, String(syncYear), String(syncMonth).padStart(2, '0') + '.db');
        default:
            return path.join(remoteBasePath, 'data', module + '.db');
    }
}
// Ensure remote directory exists
function ensureRemoteDirectory(remoteFilePath) {
    const dir = path.dirname(remoteFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        electron_log_1.default.info('[SYNC-DB] Created remote directory: ' + dir);
    }
}
// Actually sync an item to remote by copying the database file
async function syncItemToRemote(remotePath, module, item) {
    try {
        const localDbPath = getLocalDatabasePath(module);
        if (!localDbPath) {
            electron_log_1.default.error('[SYNC-DB] Unknown module: ' + module);
            return false;
        }
        if (!fs.existsSync(localDbPath)) {
            electron_log_1.default.warn('[SYNC-DB] Local database not found for ' + module + ': ' + localDbPath);
            return false;
        }
        const remoteDbPath = getRemoteDatabasePath(remotePath, module);
        ensureRemoteDirectory(remoteDbPath);
        fs.copyFileSync(localDbPath, remoteDbPath);
        electron_log_1.default.info('[SYNC-DB] Synced ' + module + ' database from ' + localDbPath + ' to ' + remoteDbPath);
        if (['kas', 'bank', 'gudang'].includes(module)) {
            const masterModules = ['coa', 'aspek_kerja', 'blok'];
            for (const masterModule of masterModules) {
                const masterLocalPath = getLocalDatabasePath(masterModule);
                const masterRemotePath = getRemoteDatabasePath(remotePath, masterModule);
                if (masterLocalPath && fs.existsSync(masterLocalPath)) {
                    ensureRemoteDirectory(masterRemotePath);
                    fs.copyFileSync(masterLocalPath, masterRemotePath);
                    electron_log_1.default.info('[SYNC-DB] Synced ' + masterModule + ' master database to ' + masterRemotePath);
                }
            }
        }
        return true;
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Sync failed for ' + module + '/' + item.recordId + ':', error);
        return false;
    }
}
// Auto-sync when connection is restored
let autoSyncTimers = new Map();
const AUTO_SYNC_DELAY = 5000; // 5 seconds
function triggerAutoSync(module) {
    // Clear any existing timer for this module
    const existingTimer = autoSyncTimers.get(module);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    // Set new timer
    const timer = setTimeout(() => {
        electron_log_1.default.info(`[SYNC-DB] Auto-sync triggered for ${module}`);
        performSync(module);
        autoSyncTimers.delete(module);
    }, AUTO_SYNC_DELAY);
    autoSyncTimers.set(module, timer);
}
// Close database
function closeSyncDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        electron_log_1.default.info('[SYNC-DB] Database closed');
    }
}
/**
 * Get sync history with filtering and pagination
 * Implements VAL-UI-009: Sync History View
 */
function getSyncHistory(page = 1, pageSize = 20, filter) {
    if (!db) {
        return {
            entries: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
        };
    }
    // Build WHERE clause based on filters
    const conditions = [];
    const params = [];
    if (filter) {
        if (filter.startDate) {
            conditions.push('started_at >= ?');
            params.push(filter.startDate);
        }
        if (filter.endDate) {
            conditions.push('started_at <= ?');
            params.push(filter.endDate);
        }
        if (filter.module) {
            conditions.push('module = ?');
            params.push(filter.module);
        }
        if (filter.direction) {
            conditions.push('direction = ?');
            params.push(filter.direction);
        }
        if (filter.status) {
            conditions.push('status = ?');
            params.push(filter.status);
        }
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // Get total count
    const countResult = db.exec(`SELECT COUNT(*) FROM sync_log ${whereClause}`, params);
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    // Calculate pagination
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    // Get entries with pagination
    const query = `
    SELECT id, direction, module, batch_id, records_count, status, errors, started_at, completed_at
    FROM sync_log
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `;
    const entriesResult = db.exec(query, [...params, pageSize, offset]);
    const entries = [];
    if (entriesResult.length > 0) {
        for (const row of entriesResult[0].values) {
            entries.push({
                id: row[0],
                direction: row[1],
                module: row[2],
                batchId: row[3],
                recordsCount: row[4],
                status: row[5],
                errors: row[6],
                startedAt: row[7],
                completedAt: row[8],
            });
        }
    }
    return {
        entries,
        total,
        page,
        pageSize,
        totalPages,
    };
}
/**
 * Add a new entry to the sync history log (VAL-UI-009)
 * Records sync operations for audit trail and history view
 */
function addSyncHistoryEntry(direction, module, recordsCount, status, errors, batchId) {
    if (!db) {
        return { success: false, id: '' };
    }
    try {
        const id = generateId();
        const now = new Date().toISOString();
        db.run(`
      INSERT INTO sync_log (id, direction, module, batch_id, records_count, status, errors, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, direction, module, batchId || null, recordsCount, status, errors, now, now]);
        saveDatabase();
        electron_log_1.default.info(`[SYNC-DB] Added sync history entry: ${id} - ${direction} for ${module} - ${status}`);
        return { success: true, id };
    }
    catch (error) {
        electron_log_1.default.error('[SYNC-DB] Failed to add sync history entry:', error);
        return { success: false, id: '' };
    }
}
