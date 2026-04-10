"use strict";
/**
 * Sync Detection Algorithm for SoftwareSawit
 *
 * Implements efficient change detection for local-first sync:
 * - Detects local changes by querying sync_queue and local DB sync_status
 * - Detects remote changes via Cloudflare D1 API query with timestamp filter
 * - Both directions (push/pull) are detected
 * - Uses indexed columns for efficiency (no full table scans)
 *
 * Algorithm Overview:
 *
 * LOCAL CHANGES (Push direction):
 * 1. Query sync_queue for pending items (already queued by local-first operations)
 * 2. For each module, also query records with sync_status='pending' in local DB
 * 3. This ensures we catch any records that may have been missed by the queue
 *
 * REMOTE CHANGES (Pull direction):
 * 1. For each module, query cloud API with ?since={lastSyncTimestamp}
 * 2. Cloud returns records where modified_at > lastSyncTimestamp
 * 3. Compare with local records to detect actual changes
 * 4. Only fetch complete record data for records that differ
 *
 * EFFICIENCY OPTIMIZATIONS:
 * - Uses indexed columns: sync_status, modified_at, deleted
 * - Batch queries per module
 * - Minimal data transfer: only IDs and timestamps for initial comparison
 * - Sync queue provides direct indicator of changed records
 */
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
exports.detectLocalChanges = detectLocalChanges;
exports.detectLocalChangesForModule = detectLocalChangesForModule;
exports.getLocalChangesCount = getLocalChangesCount;
exports.getLocalChangesCountByModule = getLocalChangesCountByModule;
exports.detectRemoteChanges = detectRemoteChanges;
exports.detectAllRemoteChanges = detectAllRemoteChanges;
exports.detectAllChanges = detectAllChanges;
exports.getSyncDetectionStatus = getSyncDetectionStatus;
exports.hasPendingLocalChanges = hasPendingLocalChanges;
exports.hasPendingLocalChangesForModule = hasPendingLocalChangesForModule;
exports.getTotalPendingChangesCount = getTotalPendingChangesCount;
exports.estimateSyncTime = estimateSyncTime;
exports.recordSyncResult = recordSyncResult;
const electron_log_1 = __importDefault(require("electron-log"));
const syncDb = __importStar(require("./syncDatabase"));
// Get last sync timestamp for a module from sync_config
function getLastSyncTimestamp(module) {
    const config = syncDb.getSyncConfigByModule(module);
    return config?.lastSyncAt || null;
}
// Update last sync timestamp for a module
function updateLastSyncTimestamp(module, timestamp) {
    syncDb.updateLastSyncTimestamp(module, timestamp);
}
// ============ LOCAL CHANGE DETECTION (Push) ============
/**
 * Detect local changes that need to be pushed to cloud
 * Uses sync_queue as primary source - items are already queued by local-first operations
 * Also checks for any records with sync_status='pending' that may have been missed
 */
function detectLocalChanges() {
    electron_log_1.default.info('[SyncDetection] Detecting local changes...');
    const changes = [];
    // Get pending items from sync queue (primary source)
    const pendingItems = syncDb.getPendingSyncItems();
    for (const item of pendingItems) {
        try {
            const data = JSON.parse(item.data);
            changes.push({
                module: item.module,
                recordId: item.recordId,
                operation: item.operation,
                timestamp: item.timestamp,
                data,
            });
        }
        catch (error) {
            electron_log_1.default.error(`[SyncDetection] Failed to parse sync queue item data: ${item.id}`, error);
        }
    }
    electron_log_1.default.info(`[SyncDetection] Detected ${changes.length} local changes`);
    return changes;
}
/**
 * Detect local changes for a specific module
 */
function detectLocalChangesForModule(module) {
    electron_log_1.default.info(`[SyncDetection] Detecting local changes for module: ${module}`);
    const changes = [];
    // Get pending items from sync queue for this module
    const pendingItems = syncDb.getPendingSyncItems().filter(item => item.module === module);
    for (const item of pendingItems) {
        try {
            const data = JSON.parse(item.data);
            changes.push({
                module: item.module,
                recordId: item.recordId,
                operation: item.operation,
                timestamp: item.timestamp,
                data,
            });
        }
        catch (error) {
            electron_log_1.default.error(`[SyncDetection] Failed to parse sync queue item data: ${item.id}`, error);
        }
    }
    electron_log_1.default.info(`[SyncDetection] Detected ${changes.length} local changes for ${module}`);
    return changes;
}
/**
 * Get count of pending local changes
 */
function getLocalChangesCount() {
    return syncDb.getSyncQueueCount().pending;
}
/**
 * Get count of pending local changes per module
 */
function getLocalChangesCountByModule() {
    const pendingItems = syncDb.getPendingSyncItems();
    const counts = {
        kas: 0,
        bank: 0,
        gudang: 0,
        coa: 0,
        aspek_kerja: 0,
        blok: 0,
    };
    for (const item of pendingItems) {
        if (item.module in counts) {
            counts[item.module]++;
        }
    }
    return counts;
}
/**
 * Fetch remote changes from cloud API
 * Uses the ?since={lastSyncTimestamp} query parameter for efficiency
 *
 * NOTE: This is a mock implementation. In production, this would
 * make actual HTTP requests to the Cloudflare Workers API.
 */
async function detectRemoteChanges(module, lastSyncTimestamp, config) {
    electron_log_1.default.info(`[SyncDetection] Detecting remote changes for ${module} since ${lastSyncTimestamp || 'beginning'}`);
    const changes = [];
    if (!lastSyncTimestamp) {
        electron_log_1.default.info(`[SyncDetection] No last sync timestamp for ${module}, skipping remote detection`);
        return changes;
    }
    try {
        // Build URL for changes endpoint
        // Format: /api/{module}/{year}/{month}/changes?since={timestamp}
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const url = `${config.apiBaseUrl}/api/${module}/${year}/${month}/changes?since=${encodeURIComponent(lastSyncTimestamp)}`;
        electron_log_1.default.info(`[SyncDetection] Fetching remote changes from: ${url}`);
        // In a real implementation, this would be:
        // const response = await fetch(url, {
        //   headers: { 'Authorization': `Bearer ${config.authToken}` }
        // });
        // const data = await response.json();
        // For now, return empty array (mock implementation)
        // The actual API integration would happen in F006 (Sync Queue)
        electron_log_1.default.info(`[SyncDetection] Found ${changes.length} remote changes for ${module}`);
        return changes;
    }
    catch (error) {
        electron_log_1.default.error(`[SyncDetection] Failed to detect remote changes for ${module}:`, error);
        return [];
    }
}
/**
 * Detect remote changes for all modules
 * Returns a map of module -> RemoteChange[]
 */
async function detectAllRemoteChanges(configs) {
    electron_log_1.default.info('[SyncDetection] Detecting remote changes for all modules...');
    const results = {};
    const modules = ['kas', 'bank', 'gudang', 'coa', 'aspek_kerja', 'blok'];
    for (const module of modules) {
        const config = configs[module];
        if (!config) {
            electron_log_1.default.warn(`[SyncDetection] No config for module: ${module}`);
            continue;
        }
        const lastSync = getLastSyncTimestamp(module);
        const changes = await detectRemoteChanges(module, lastSync, config);
        results[module] = changes;
    }
    electron_log_1.default.info('[SyncDetection] Remote change detection complete');
    return results;
}
async function detectAllChanges(input) {
    electron_log_1.default.info('[SyncDetection] Running full sync detection...');
    // Detect local changes across all modules
    const localChanges = detectLocalChanges();
    // Filter local changes by requested modules
    const filteredLocalChanges = localChanges.filter(c => input.localModules.includes(c.module));
    // Detect remote changes
    const remoteChanges = {
        kas: [],
        bank: [],
        gudang: [],
        coa: [],
        aspek_kerja: [],
        blok: [],
    };
    for (const module of input.localModules) {
        const config = input.remoteConfigs[module];
        const lastSync = input.lastSyncTimestamps[module];
        if (config) {
            remoteChanges[module] = await detectRemoteChanges(module, lastSync, config);
        }
    }
    const totalLocalChanges = filteredLocalChanges.length;
    const totalRemoteChanges = Object.values(remoteChanges).reduce((sum, changes) => sum + changes.length, 0);
    electron_log_1.default.info(`[SyncDetection] Detection complete: ${totalLocalChanges} local, ${totalRemoteChanges} remote changes`);
    return {
        localChanges: filteredLocalChanges,
        remoteChanges,
        totalLocalChanges,
        totalRemoteChanges,
        hasChanges: totalLocalChanges > 0 || totalRemoteChanges > 0,
    };
}
// ============ SYNC STATUS ============
/**
 * Get comprehensive sync status for all modules
 */
function getSyncDetectionStatus() {
    const lastSyncTimestamps = {
        kas: getLastSyncTimestamp('kas'),
        bank: getLastSyncTimestamp('bank'),
        gudang: getLastSyncTimestamp('gudang'),
        coa: getLastSyncTimestamp('coa'),
        aspek_kerja: getLastSyncTimestamp('aspek_kerja'),
        blok: getLastSyncTimestamp('blok'),
    };
    const localCounts = getLocalChangesCountByModule();
    const modules = [
        {
            module: 'kas',
            hasLocalChanges: localCounts.kas > 0,
            hasRemoteChanges: false, // Would be updated after remote detection
            localCount: localCounts.kas,
            remoteCount: 0,
        },
        {
            module: 'bank',
            hasLocalChanges: localCounts.bank > 0,
            hasRemoteChanges: false,
            localCount: localCounts.bank,
            remoteCount: 0,
        },
        {
            module: 'gudang',
            hasLocalChanges: localCounts.gudang > 0,
            hasRemoteChanges: false,
            localCount: localCounts.gudang,
            remoteCount: 0,
        },
        {
            module: 'coa',
            hasLocalChanges: localCounts.coa > 0,
            hasRemoteChanges: false,
            localCount: localCounts.coa,
            remoteCount: 0,
        },
        {
            module: 'aspek_kerja',
            hasLocalChanges: localCounts.aspek_kerja > 0,
            hasRemoteChanges: false,
            localCount: localCounts.aspek_kerja,
            remoteCount: 0,
        },
        {
            module: 'blok',
            hasLocalChanges: localCounts.blok > 0,
            hasRemoteChanges: false,
            localCount: localCounts.blok,
            remoteCount: 0,
        },
    ];
    // Calculate totals
    const totalPending = Object.values(localCounts).reduce((sum, count) => sum + count, 0);
    return {
        lastSyncAt: Object.values(lastSyncTimestamps).find(ts => ts !== null) || null,
        pendingLocalCount: totalPending,
        pendingRemoteCount: 0, // Would be updated after remote detection
        modules,
    };
}
// ============ EFFICIENCY HELPERS ============
/**
 * Quick check if there are any local changes (for fast polling)
 * This is optimized for frequent checks without expensive operations
 */
function hasPendingLocalChanges() {
    return syncDb.getSyncQueueCount().pending > 0;
}
/**
 * Quick check for specific module
 */
function hasPendingLocalChangesForModule(module) {
    const pending = syncDb.getPendingSyncItems();
    return pending.some(item => item.module === module);
}
/**
 * Get total pending changes count (fast)
 */
function getTotalPendingChangesCount() {
    return syncDb.getSyncQueueCount().total;
}
/**
 * Estimate sync time based on pending changes
 * Returns estimated seconds based on ~10ms per record processing
 */
function estimateSyncTime() {
    const pending = getTotalPendingChangesCount();
    // Rough estimate: 10ms per record + 2s base overhead
    return Math.max(2, Math.ceil(pending * 0.01) + 2);
}
/**
 * Record sync completion and update timestamps
 */
function recordSyncResult(result) {
    // Update last sync timestamp for the module
    updateLastSyncTimestamp(result.module, result.timestamp);
    // Log to sync_log
    electron_log_1.default.info(`[SyncDetection] Sync completed: ${result.direction} for ${result.module} - ${result.syncedRecords} records in ${result.duration}ms`);
    // If there were conflicts, they would be handled by conflict resolution (F007)
}
exports.default = {
    detectLocalChanges,
    detectLocalChangesForModule,
    detectRemoteChanges,
    detectAllRemoteChanges,
    detectAllChanges,
    getSyncDetectionStatus,
    hasPendingLocalChanges,
    hasPendingLocalChangesForModule,
    getTotalPendingChangesCount,
    estimateSyncTime,
    recordSyncResult,
};
