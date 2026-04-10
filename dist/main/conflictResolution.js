"use strict";
/**
 * Conflict Resolution System for SoftwareSawit
 *
 * Implements comprehensive conflict resolution for local-first sync:
 * - Detects conflicts when local and remote have different versions
 * - Supports multiple resolution strategies: last-write-wins, merge, manual
 * - Logs all conflicts for audit purposes
 * - Provides UI hooks for manual resolution
 * - Preserves data integrity during resolution
 *
 * Conflict Detection:
 * - Compares local and remote versions of records
 * - Detects edit-edit conflicts (same record modified on both sides)
 * - Detects delete-edit conflicts (deleted on one side, edited on other)
 * - Uses timestamp comparison as primary detection method
 *
 * Resolution Strategies:
 * - 'last_write_wins': Latest timestamp automatically wins
 * - 'local_wins': Always prefer local version
 * - 'remote_wins': Always prefer remote version
 * - 'merge': Merge non-conflicting fields, flag conflicting ones
 * - 'manual': Queue for manual resolution via UI callback
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
exports.detectConflict = detectConflict;
exports.getConflictingFields = getConflictingFields;
exports.applyResolutionStrategy = applyResolutionStrategy;
exports.getPendingConflicts = getPendingConflicts;
exports.getRecentConflicts = getRecentConflicts;
exports.getConflictStats = getConflictStats;
exports.resolveConflictManually = resolveConflictManually;
exports.discardConflict = discardConflict;
exports.getConflictTypeLabel = getConflictTypeLabel;
exports.getStrategyLabel = getStrategyLabel;
exports.requiresManualResolution = requiresManualResolution;
exports.processQueueItemForConflict = processQueueItemForConflict;
exports.setResolutionStrategy = setResolutionStrategy;
exports.getResolutionStrategy = getResolutionStrategy;
const electron_log_1 = __importDefault(require("electron-log"));
const syncDb = __importStar(require("./syncDatabase"));
// ============ Conflict Detection ============
/**
 * Detect conflict between local and remote versions
 * Uses timestamp comparison and data comparison for detection
 */
function detectConflict(module, localVersion, remoteVersion) {
    const localTimestamp = new Date(localVersion.timestamp).getTime();
    const remoteTimestamp = new Date(remoteVersion.timestamp).getTime();
    // Check if remote record is marked as deleted
    if (remoteVersion.deleted) {
        // Delete vs Edit conflict - remote is deleted, local has changes
        if (localVersion.data && Object.keys(localVersion.data).length > 0) {
            return {
                hasConflict: true,
                conflictType: 'edit_delete',
                localVersion,
                remoteVersion,
            };
        }
        // If local is also deleted or empty, no conflict
        return {
            hasConflict: false,
            localVersion,
            remoteVersion,
        };
    }
    // Check if local record is marked as deleted (but remote has data = delete-edit conflict)
    if (localVersion.deleted) {
        // Delete vs Edit conflict - local is deleted, remote has edited
        if (remoteVersion.data && Object.keys(remoteVersion.data).length > 0) {
            return {
                hasConflict: true,
                conflictType: 'edit_delete',
                localVersion,
                remoteVersion,
            };
        }
        // If remote is also deleted or empty, no conflict
        return {
            hasConflict: false,
            localVersion,
            remoteVersion,
        };
    }
    // Check for edit-edit conflict using timestamp threshold
    const timestampDiff = Math.abs(localTimestamp - remoteTimestamp);
    const CONFLICT_THRESHOLD_MS = 1000; // 1 second threshold
    if (timestampDiff > CONFLICT_THRESHOLD_MS) {
        // Timestamps differ - potential conflict
        // But we also need to check if data actually differs
        const dataDiffers = hasDataConflict(localVersion.data, remoteVersion.data);
        if (dataDiffers) {
            // Determine conflict type
            const conflictType = 'edit_edit';
            return {
                hasConflict: true,
                conflictType,
                localVersion,
                remoteVersion,
            };
        }
    }
    // No conflict detected
    return {
        hasConflict: false,
        localVersion,
        remoteVersion,
    };
}
/**
 * Compare two data objects to detect field-level conflicts
 */
function hasDataConflict(localData, remoteData) {
    const localKeys = Object.keys(localData).sort();
    const remoteKeys = Object.keys(remoteData).sort();
    // If keys are different, there's definitely a conflict
    if (JSON.stringify(localKeys) !== JSON.stringify(remoteKeys)) {
        return true;
    }
    // Compare values for each key
    for (const key of localKeys) {
        // Skip metadata fields
        if (isMetadataField(key))
            continue;
        const localValue = JSON.stringify(localData[key]);
        const remoteValue = JSON.stringify(remoteData[key]);
        if (localValue !== remoteValue) {
            return true;
        }
    }
    return false;
}
/**
 * Get list of conflicting fields between local and remote data
 */
function getConflictingFields(localData, remoteData) {
    const conflictingFields = [];
    const allKeys = new Set([
        ...Object.keys(localData),
        ...Object.keys(remoteData),
    ]);
    for (const key of allKeys) {
        // Skip metadata fields
        if (isMetadataField(key))
            continue;
        const localValue = JSON.stringify(localData[key]);
        const remoteValue = JSON.stringify(remoteData[key]);
        if (localValue !== remoteValue) {
            conflictingFields.push(key);
        }
    }
    return conflictingFields;
}
/**
 * Check if a field is a metadata field (not part of business data)
 */
function isMetadataField(field) {
    const metadataFields = [
        'id',
        '_id',
        'sync_status',
        'sync_timestamp',
        'modified_at',
        'created_at',
        'updated_at',
        'device_id',
        'modified_by',
        'version',
        'etag',
    ];
    return metadataFields.includes(field.toLowerCase());
}
// ============ Resolution Strategies ============
/**
 * Apply resolution strategy based on configuration
 */
async function applyResolutionStrategy(module, conflict, strategy, manualCallback) {
    electron_log_1.default.info(`[ConflictResolution] Applying strategy '${strategy}' for ${module}/${conflict.recordId}`);
    switch (strategy) {
        case 'last_write_wins':
            return resolveLastWriteWins(conflict);
        case 'local_wins':
            return resolveLocalWins(conflict);
        case 'remote_wins':
            return resolveRemoteWins(conflict);
        case 'merge':
            return resolveMerge(conflict);
        case 'manual':
            if (!manualCallback) {
                electron_log_1.default.error('[ConflictResolution] Manual resolution callback not provided');
                return {
                    success: false,
                    resolution: 'manual_pending',
                    message: 'Manual resolution callback not configured',
                };
            }
            return await resolveManually(module, conflict, manualCallback);
        default:
            electron_log_1.default.warn(`[ConflictResolution] Unknown strategy '${strategy}', falling back to last_write_wins`);
            return resolveLastWriteWins(conflict);
    }
}
/**
 * Last Write Wins - Latest timestamp automatically wins
 */
function resolveLastWriteWins(conflict) {
    const localTimestamp = new Date(conflict.localVersion.timestamp).getTime();
    const remoteTimestamp = new Date(conflict.remoteVersion.timestamp).getTime();
    if (localTimestamp >= remoteTimestamp) {
        return resolveLocalWins(conflict);
    }
    else {
        return resolveRemoteWins(conflict);
    }
}
/**
 * Local Wins - Always prefer local version
 */
function resolveLocalWins(conflict) {
    electron_log_1.default.info(`[ConflictResolution] Resolving with local version: ${conflict.recordId}`);
    // Log the conflict resolution
    const conflictId = logConflictResolution(conflict.module, conflict.recordId, conflict.localVersion.timestamp, conflict.remoteVersion.timestamp, 'local', conflict.conflictType);
    return {
        success: true,
        resolution: 'local',
        resolvedData: conflict.localVersion.data,
        message: 'Resolved with local version (local_wins strategy)',
        conflictId,
    };
}
/**
 * Remote Wins - Always prefer remote version
 */
function resolveRemoteWins(conflict) {
    electron_log_1.default.info(`[ConflictResolution] Resolving with remote version: ${conflict.recordId}`);
    // Log the conflict resolution
    const conflictId = logConflictResolution(conflict.module, conflict.recordId, conflict.localVersion.timestamp, conflict.remoteVersion.timestamp, 'remote', conflict.conflictType);
    return {
        success: true,
        resolution: 'remote',
        resolvedData: conflict.remoteVersion.deleted ? undefined : conflict.remoteVersion.data,
        message: 'Resolved with remote version (remote_wins strategy)',
        conflictId,
    };
}
/**
 * Merge Strategy - Merge non-conflicting fields, flag conflicts
 * Returns merged data with field conflicts highlighted
 */
function resolveMerge(conflict) {
    electron_log_1.default.info(`[ConflictResolution] Performing merge for: ${conflict.recordId}`);
    const mergedData = {};
    const fieldConflicts = getConflictingFields(conflict.localVersion.data, conflict.remoteVersion.data);
    // For each field, prefer local version (can be configured)
    // but still merge all fields
    const allKeys = new Set([
        ...Object.keys(conflict.localVersion.data),
        ...Object.keys(conflict.remoteVersion.data),
    ]);
    for (const key of allKeys) {
        // Skip metadata fields
        if (isMetadataField(key))
            continue;
        const localValue = conflict.localVersion.data[key];
        const remoteValue = conflict.remoteVersion.data[key];
        // Check if this specific field conflicts
        const hasConflict = JSON.stringify(localValue) !== JSON.stringify(remoteValue);
        if (hasConflict) {
            // For conflicting fields, prefer local (could be configurable)
            mergedData[key] = localValue;
            electron_log_1.default.info(`[ConflictResolution] Field '${key}' conflicts, using local value`);
        }
        else {
            // No conflict, use whichever is available
            mergedData[key] = localValue ?? remoteValue;
        }
    }
    // Mark merged data with conflict info
    mergedData['_conflictResolved'] = true;
    mergedData['_fieldConflicts'] = fieldConflicts;
    mergedData['_mergedAt'] = new Date().toISOString();
    // Log the merge resolution
    const conflictId = logConflictResolution(conflict.module, conflict.recordId, conflict.localVersion.timestamp, conflict.remoteVersion.timestamp, 'merged', conflict.conflictType);
    return {
        success: true,
        resolution: 'merged',
        resolvedData: mergedData,
        message: `Merged with ${fieldConflicts.length} field conflicts`,
        conflictId,
    };
}
/**
 * Manual Resolution - Queue for UI resolution
 */
async function resolveManually(module, conflict, callback) {
    electron_log_1.default.info(`[ConflictResolution] Queuing for manual resolution: ${module}/${conflict.recordId}`);
    try {
        // Create conflict record in database for UI to pick up
        const conflictId = createConflictRecord(module, conflict);
        // Call the manual resolution callback
        const result = await callback(conflict);
        if (result.success && conflictId) {
            // Only update if resolution was actually provided (not 'manual_pending')
            if (result.resolution !== 'manual_pending') {
                updateConflictRecordResolution(conflictId, result.resolution, result.resolvedData);
            }
        }
        return result;
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Manual resolution failed:', error);
        return {
            success: false,
            resolution: 'manual_pending',
            message: 'Manual resolution failed: ' + (error instanceof Error ? error.message : String(error)),
        };
    }
}
// ============ Conflict Logging ============
/**
 * Log conflict resolution to database for audit
 */
function logConflictResolution(module, recordId, localTimestamp, remoteTimestamp, resolvedWith, conflictType) {
    const id = generateId();
    const now = new Date().toISOString();
    try {
        // Get the database instance from syncDb if it has a method to run raw SQL
        // For now, we'll use the existing syncDb.logConflict if available
        if ('logConflict' in syncDb && typeof syncDb.logConflict === 'function') {
            syncDb.logConflict({
                id,
                module,
                recordId,
                localTimestamp,
                remoteTimestamp,
                resolvedWith,
                conflictType,
                resolvedAt: now,
            });
        }
        else {
            // Fallback: log to application log
            electron_log_1.default.info(`[CONFLICT_LOG] ${id}|${module}|${recordId}|${conflictType}|${resolvedWith}|${localTimestamp}|${remoteTimestamp}|${now}`);
        }
        electron_log_1.default.info(`[ConflictResolution] Logged conflict resolution: ${id}`);
        return id;
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to log conflict resolution:', error);
        return id;
    }
}
/**
 * Create a conflict record for manual resolution UI
 */
function createConflictRecord(module, conflict) {
    const id = generateId();
    const now = new Date().toISOString();
    try {
        // Store in sync_conflicts table
        // This allows UI to query and display pending conflicts
        if (syncDb.addConflictRecord) {
            syncDb.addConflictRecord({
                id,
                module,
                recordId: conflict.recordId,
                localTimestamp: conflict.localVersion.timestamp,
                remoteTimestamp: conflict.remoteVersion.timestamp,
                localData: conflict.localVersion.data,
                remoteData: conflict.remoteVersion.data,
                conflictType: conflict.conflictType,
                needsManualResolution: true,
                createdAt: now,
            });
        }
        electron_log_1.default.info(`[ConflictResolution] Created conflict record: ${id}`);
        return id;
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to create conflict record:', error);
        return id;
    }
}
/**
 * Update conflict record with resolution
 */
function updateConflictRecordResolution(conflictId, resolution, resolvedData) {
    try {
        if (syncDb.updateConflictRecord) {
            syncDb.updateConflictRecord(conflictId, {
                resolvedWith: resolution,
                resolvedData,
                resolvedAt: new Date().toISOString(),
            });
        }
        electron_log_1.default.info(`[ConflictResolution] Updated conflict record: ${conflictId}`);
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to update conflict record:', error);
    }
}
// ============ Conflict Query ============
/**
 * Get all pending conflicts that need manual resolution
 */
function getPendingConflicts(module) {
    try {
        if (syncDb.getPendingConflicts) {
            const conflicts = syncDb.getPendingConflicts(module);
            return conflicts.map(mapToConflictRecord);
        }
        return [];
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to get pending conflicts:', error);
        return [];
    }
}
/**
 * Get recent conflict history
 */
function getRecentConflicts(limit = 50) {
    try {
        if (syncDb.getRecentConflictsFull) {
            const conflicts = syncDb.getRecentConflictsFull(limit);
            return conflicts.map(mapToConflictRecord);
        }
        return [];
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to get recent conflicts:', error);
        return [];
    }
}
/**
 * Get conflict statistics
 */
function getConflictStats() {
    try {
        const pending = getPendingConflicts();
        const recent = getRecentConflicts(1000);
        const stats = {
            total: recent.length,
            pendingManual: pending.length,
            resolvedLocal: recent.filter(c => c.resolvedWith === 'local').length,
            resolvedRemote: recent.filter(c => c.resolvedWith === 'remote').length,
            resolvedMerged: recent.filter(c => c.resolvedWith === 'merged').length,
            byModule: {},
        };
        // Count by module
        for (const conflict of recent) {
            stats.byModule[conflict.module] = (stats.byModule[conflict.module] || 0) + 1;
        }
        return stats;
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to get conflict stats:', error);
        return {
            total: 0,
            pendingManual: 0,
            resolvedLocal: 0,
            resolvedRemote: 0,
            resolvedMerged: 0,
            byModule: {},
        };
    }
}
/**
 * Map database conflict to ConflictRecord type
 */
function mapToConflictRecord(dbConflict) {
    return {
        id: dbConflict.id,
        module: dbConflict.module,
        recordId: dbConflict.recordId,
        conflictType: dbConflict.conflictType,
        localVersion: {
            recordId: dbConflict.recordId,
            data: dbConflict.localData,
            timestamp: dbConflict.localTimestamp,
        },
        remoteVersion: {
            recordId: dbConflict.recordId,
            data: dbConflict.remoteData,
            timestamp: dbConflict.remoteTimestamp,
        },
        resolutionStrategy: dbConflict.resolutionStrategy || 'last_write_wins',
        resolvedWith: dbConflict.resolvedWith,
        resolutionData: dbConflict.resolutionData,
        resolvedAt: dbConflict.resolvedAt,
        needsManualResolution: dbConflict.needsManualResolution ?? false,
        createdAt: dbConflict.createdAt,
    };
}
// ============ Conflict Queue Management ============
/**
 * Mark a conflict as resolved via manual resolution
 */
function resolveConflictManually(conflictId, resolution, resolvedData, resolvedBy) {
    try {
        if (syncDb.resolveConflict) {
            syncDb.resolveConflict(conflictId, resolution, resolvedData, resolvedBy);
        }
        electron_log_1.default.info(`[ConflictResolution] Manually resolved conflict: ${conflictId} -> ${resolution}`);
        return { success: true, message: 'Conflict resolved successfully' };
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to resolve conflict manually:', error);
        return {
            success: false,
            message: 'Failed to resolve conflict: ' + (error instanceof Error ? error.message : String(error)),
        };
    }
}
/**
 * Discard a conflict (e.g., if record was deleted on both sides)
 */
function discardConflict(conflictId) {
    try {
        if (syncDb.discardConflict) {
            syncDb.discardConflict(conflictId);
        }
        electron_log_1.default.info(`[ConflictResolution] Discarded conflict: ${conflictId}`);
        return { success: true, message: 'Conflict discarded' };
    }
    catch (error) {
        electron_log_1.default.error('[ConflictResolution] Failed to discard conflict:', error);
        return {
            success: false,
            message: 'Failed to discard conflict: ' + (error instanceof Error ? error.message : String(error)),
        };
    }
}
// ============ Utilities ============
/**
 * Generate unique ID for conflicts
 */
function generateId() {
    return 'cf-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}
/**
 * Get human-readable conflict type label
 */
function getConflictTypeLabel(conflictType) {
    switch (conflictType) {
        case 'edit_edit':
            return 'Edit-Edit Conflict';
        case 'delete_edit':
            return 'Delete-Edit Conflict';
        case 'edit_delete':
            return 'Edit-Delete Conflict';
        default:
            return 'Unknown Conflict';
    }
}
/**
 * Get human-readable resolution strategy label
 */
function getStrategyLabel(strategy) {
    switch (strategy) {
        case 'last_write_wins':
            return 'Last Write Wins';
        case 'local_wins':
            return 'Local Version Wins';
        case 'remote_wins':
            return 'Remote Version Wins';
        case 'merge':
            return 'Merge (Auto-merge non-conflicting fields)';
        case 'manual':
            return 'Manual Resolution Required';
        default:
            return 'Unknown Strategy';
    }
}
/**
 * Check if conflict requires manual resolution
 */
function requiresManualResolution(conflictType, strategy) {
    return strategy === 'manual' || conflictType === 'edit_delete';
}
// ============ Integration with Sync Queue ============
/**
 * Process queue item and detect conflicts before sync
 * Called by sync queue service before uploading
 */
async function processQueueItemForConflict(module, queueItem, remoteTimestamp) {
    const localTimestamp = queueItem.timestamp;
    // If no remote timestamp, no conflict possible
    if (!remoteTimestamp) {
        return {
            shouldSync: true,
            conflictDetected: false,
        };
    }
    const localData = JSON.parse(queueItem.data);
    const localVersion = {
        recordId: queueItem.recordId,
        data: localData,
        timestamp: localTimestamp,
    };
    const remoteVersion = {
        recordId: queueItem.recordId,
        data: {}, // Would be fetched from remote
        timestamp: remoteTimestamp,
    };
    const detectionResult = detectConflict(module, localVersion, remoteVersion);
    if (!detectionResult.hasConflict) {
        return {
            shouldSync: true,
            conflictDetected: false,
        };
    }
    // Conflict detected - create conflict record
    const conflict = {
        id: generateId(),
        module,
        recordId: queueItem.recordId,
        conflictType: detectionResult.conflictType,
        localVersion,
        remoteVersion,
        resolutionStrategy: getDefaultStrategy(),
        needsManualResolution: getDefaultStrategy() === 'manual',
        createdAt: new Date().toISOString(),
    };
    electron_log_1.default.warn(`[ConflictResolution] Conflict detected: ${module}/${queueItem.recordId}`);
    // Apply default resolution strategy
    const strategy = getDefaultStrategy();
    const resolutionResult = await applyResolutionStrategy(module, conflict, strategy);
    return {
        shouldSync: resolutionResult.success,
        conflictDetected: true,
        conflictRecord: conflict,
        resolutionResult,
    };
}
/**
 * Get default resolution strategy (can be configured)
 */
function getDefaultStrategy() {
    // Could be read from config
    return 'last_write_wins';
}
/**
 * Set resolution strategy for a module or globally
 */
let globalStrategy = 'last_write_wins';
const moduleStrategies = {};
function setResolutionStrategy(strategy, module) {
    if (module) {
        moduleStrategies[module] = strategy;
        electron_log_1.default.info(`[ConflictResolution] Set strategy for module ${module}: ${strategy}`);
    }
    else {
        globalStrategy = strategy;
        electron_log_1.default.info(`[ConflictResolution] Set global strategy: ${strategy}`);
    }
}
function getResolutionStrategy(module) {
    if (module && moduleStrategies[module]) {
        return moduleStrategies[module];
    }
    return globalStrategy;
}
// ============ Export ============
exports.default = {
    // Detection
    detectConflict,
    getConflictingFields,
    // Resolution
    applyResolutionStrategy,
    resolveConflictManually,
    discardConflict,
    // Query
    getPendingConflicts,
    getRecentConflicts,
    getConflictStats,
    // Strategy management
    setResolutionStrategy,
    getResolutionStrategy,
    requiresManualResolution,
    // Utilities
    getConflictTypeLabel,
    getStrategyLabel,
};
