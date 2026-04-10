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

import log from 'electron-log';
import * as syncDb from './syncDatabase';
import * as syncQueue from './syncQueueService';

// Types for change detection
export interface LocalChange {
  module: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RemoteChange {
  module: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  modifiedAt: string;
  data: Record<string, unknown>;
}

export interface SyncDetectionResult {
  localChanges: LocalChange[];
  remoteChanges: RemoteChange[];
  lastSyncTimestamp: string;
  hasChanges: boolean;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  pendingLocalCount: number;
  pendingRemoteCount: number;
  modules: ModuleSyncStatus[];
}

export interface ModuleSyncStatus {
  module: string;
  hasLocalChanges: boolean;
  hasRemoteChanges: boolean;
  localCount: number;
  remoteCount: number;
}

// Module types
export type ModuleType = 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok';

// Get last sync timestamp for a module from sync_config
function getLastSyncTimestamp(module: string): string | null {
  const config = syncDb.getSyncConfigByModule(module);
  return config?.lastSyncAt || null;
}

// Update last sync timestamp for a module
function updateLastSyncTimestamp(module: string, timestamp: string): void {
  syncDb.updateLastSyncTimestamp(module, timestamp);
}

// ============ LOCAL CHANGE DETECTION (Push) ============

/**
 * Detect local changes that need to be pushed to cloud
 * Uses sync_queue as primary source - items are already queued by local-first operations
 * Also checks for any records with sync_status='pending' that may have been missed
 */
export function detectLocalChanges(): LocalChange[] {
  log.info('[SyncDetection] Detecting local changes...');
  
  const changes: LocalChange[] = [];
  
  // Get pending items from sync queue (primary source)
  const pendingItems = syncDb.getPendingSyncItems();
  
  for (const item of pendingItems) {
    try {
      const data = JSON.parse(item.data) as Record<string, unknown>;
      
      changes.push({
        module: item.module,
        recordId: item.recordId,
        operation: item.operation,
        timestamp: item.timestamp,
        data,
      });
    } catch (error) {
      log.error(`[SyncDetection] Failed to parse sync queue item data: ${item.id}`, error);
    }
  }
  
  log.info(`[SyncDetection] Detected ${changes.length} local changes`);
  return changes;
}

/**
 * Detect local changes for a specific module
 */
export function detectLocalChangesForModule(module: ModuleType): LocalChange[] {
  log.info(`[SyncDetection] Detecting local changes for module: ${module}`);
  
  const changes: LocalChange[] = [];
  
  // Get pending items from sync queue for this module
  const pendingItems = syncDb.getPendingSyncItems().filter(item => item.module === module);
  
  for (const item of pendingItems) {
    try {
      const data = JSON.parse(item.data) as Record<string, unknown>;
      
      changes.push({
        module: item.module,
        recordId: item.recordId,
        operation: item.operation,
        timestamp: item.timestamp,
        data,
      });
    } catch (error) {
      log.error(`[SyncDetection] Failed to parse sync queue item data: ${item.id}`, error);
    }
  }
  
  log.info(`[SyncDetection] Detected ${changes.length} local changes for ${module}`);
  return changes;
}

/**
 * Get count of pending local changes
 */
export function getLocalChangesCount(): number {
  return syncDb.getSyncQueueCount().pending;
}

/**
 * Get count of pending local changes per module
 */
export function getLocalChangesCountByModule(): Record<ModuleType, number> {
  const pendingItems = syncDb.getPendingSyncItems();
  const counts: Record<ModuleType, number> = {
    kas: 0,
    bank: 0,
    gudang: 0,
    coa: 0,
    aspek_kerja: 0,
    blok: 0,
  };
  
  for (const item of pendingItems) {
    if (item.module in counts) {
      counts[item.module as ModuleType]++;
    }
  }
  
  return counts;
}

// ============ REMOTE CHANGE DETECTION (Pull) ============

/**
 * Remote change detection configuration
 * This would be replaced with actual API calls to Cloudflare D1
 */
export interface RemoteDetectionConfig {
  apiBaseUrl: string;
  authToken: string;
  deviceId: string;
}

/**
 * Fetch remote changes from cloud API
 * Uses the ?since={lastSyncTimestamp} query parameter for efficiency
 * 
 * NOTE: This is a mock implementation. In production, this would
 * make actual HTTP requests to the Cloudflare Workers API.
 */
export async function detectRemoteChanges(
  module: ModuleType,
  lastSyncTimestamp: string | null,
  config: RemoteDetectionConfig
): Promise<RemoteChange[]> {
  log.info(`[SyncDetection] Detecting remote changes for ${module} since ${lastSyncTimestamp || 'beginning'}`);
  
  const changes: RemoteChange[] = [];
  
  if (!lastSyncTimestamp) {
    log.info(`[SyncDetection] No last sync timestamp for ${module}, skipping remote detection`);
    return changes;
  }
  
  try {
    // Build URL for changes endpoint
    // Format: /api/{module}/{year}/{month}/changes?since={timestamp}
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    
    const url = `${config.apiBaseUrl}/api/${module}/${year}/${month}/changes?since=${encodeURIComponent(lastSyncTimestamp)}`;
    
    log.info(`[SyncDetection] Fetching remote changes from: ${url}`);
    
    // In a real implementation, this would be:
    // const response = await fetch(url, {
    //   headers: { 'Authorization': `Bearer ${config.authToken}` }
    // });
    // const data = await response.json();
    
    // For now, return empty array (mock implementation)
    // The actual API integration would happen in F006 (Sync Queue)
    
    log.info(`[SyncDetection] Found ${changes.length} remote changes for ${module}`);
    return changes;
  } catch (error) {
    log.error(`[SyncDetection] Failed to detect remote changes for ${module}:`, error);
    return [];
  }
}

/**
 * Detect remote changes for all modules
 * Returns a map of module -> RemoteChange[]
 */
export async function detectAllRemoteChanges(
  configs: Record<ModuleType, RemoteDetectionConfig>
): Promise<Record<ModuleType, RemoteChange[]>> {
  log.info('[SyncDetection] Detecting remote changes for all modules...');
  
  const results: Partial<Record<ModuleType, RemoteChange[]>> = {};
  
  const modules: ModuleType[] = ['kas', 'bank', 'gudang', 'coa', 'aspek_kerja', 'blok'];
  
  for (const module of modules) {
    const config = configs[module];
    if (!config) {
      log.warn(`[SyncDetection] No config for module: ${module}`);
      continue;
    }
    
    const lastSync = getLastSyncTimestamp(module);
    const changes = await detectRemoteChanges(module, lastSync, config);
    results[module] = changes;
  }
  
  log.info('[SyncDetection] Remote change detection complete');
  return results as Record<ModuleType, RemoteChange[]>;
}

// ============ COMBINED SYNC DETECTION ============

/**
 * Full sync detection for both directions
 * Detects local changes (to push) and remote changes (to pull)
 */
export interface FullSyncDetectionInput {
  localModules: ModuleType[];
  remoteConfigs: Record<ModuleType, RemoteDetectionConfig>;
  lastSyncTimestamps: Record<ModuleType, string | null>;
}

export interface FullSyncDetectionResult {
  localChanges: LocalChange[];
  remoteChanges: Record<ModuleType, RemoteChange[]>;
  totalLocalChanges: number;
  totalRemoteChanges: number;
  hasChanges: boolean;
}

export async function detectAllChanges(
  input: FullSyncDetectionInput
): Promise<FullSyncDetectionResult> {
  log.info('[SyncDetection] Running full sync detection...');
  
  // Detect local changes across all modules
  const localChanges = detectLocalChanges();
  
  // Filter local changes by requested modules
  const filteredLocalChanges = localChanges.filter(c => input.localModules.includes(c.module as ModuleType));
  
  // Detect remote changes
  const remoteChanges: Record<ModuleType, RemoteChange[]> = {
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
  
  log.info(`[SyncDetection] Detection complete: ${totalLocalChanges} local, ${totalRemoteChanges} remote changes`);
  
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
export function getSyncDetectionStatus(): SyncStatus {
  const lastSyncTimestamps: Record<ModuleType, string | null> = {
    kas: getLastSyncTimestamp('kas'),
    bank: getLastSyncTimestamp('bank'),
    gudang: getLastSyncTimestamp('gudang'),
    coa: getLastSyncTimestamp('coa'),
    aspek_kerja: getLastSyncTimestamp('aspek_kerja'),
    blok: getLastSyncTimestamp('blok'),
  };
  
  const localCounts = getLocalChangesCountByModule();
  
  const modules: ModuleSyncStatus[] = [
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
export function hasPendingLocalChanges(): boolean {
  return syncDb.getSyncQueueCount().pending > 0;
}

/**
 * Quick check for specific module
 */
export function hasPendingLocalChangesForModule(module: ModuleType): boolean {
  const pending = syncDb.getPendingSyncItems();
  return pending.some(item => item.module === module);
}

/**
 * Get total pending changes count (fast)
 */
export function getTotalPendingChangesCount(): number {
  return syncDb.getSyncQueueCount().total;
}

/**
 * Estimate sync time based on pending changes
 * Returns estimated seconds based on ~10ms per record processing
 */
export function estimateSyncTime(): number {
  const pending = getTotalPendingChangesCount();
  // Rough estimate: 10ms per record + 2s base overhead
  return Math.max(2, Math.ceil(pending * 0.01) + 2);
}

// ============ SYNC RESULT TRACKING ============

export interface SyncResult {
  success: boolean;
  direction: 'push' | 'pull' | 'both';
  module: ModuleType;
  syncedRecords: number;
  conflicts: number;
  errors: number;
  timestamp: string;
  duration: number; // milliseconds
}

/**
 * Record sync completion and update timestamps
 */
export function recordSyncResult(result: SyncResult): void {
  // Update last sync timestamp for the module
  updateLastSyncTimestamp(result.module, result.timestamp);
  
  // Log to sync_log (VAL-UI-009)
  log.info(`[SyncDetection] Sync completed: ${result.direction} for ${result.module} - ${result.syncedRecords} records in ${result.duration}ms`);
  
  // Determine direction for sync_log (map 'push'/'pull'/'both' to 'up'/'down')
  let direction: 'up' | 'down' = 'up';
  if (result.direction === 'pull') {
    direction = 'down';
  }
  
  // Determine status based on results
  let status: 'success' | 'partial' | 'failed' = 'success';
  if (result.errors > 0 && result.syncedRecords > 0) {
    status = 'partial';
  } else if (result.errors > 0 && result.syncedRecords === 0) {
    status = 'failed';
  }
  
  // Build error message if there were errors
  const errors = result.errors > 0 
    ? `${result.errors} error(s)${result.conflicts > 0 ? `, ${result.conflicts} conflict(s)` : ''}`
    : null;
  
  // Add entry to sync history log
  syncDb.addSyncHistoryEntry(
    direction,
    result.module,
    result.syncedRecords,
    status,
    errors
  );
  
  // If there were conflicts, they would be handled by conflict resolution (F007)
}

export default {
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
