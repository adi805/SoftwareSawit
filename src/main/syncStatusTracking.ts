/**
 * Sync Status Tracking Service for SoftwareSawit
 * 
 * Implements sync status tracking for transactions:
 * - Tracks sync_status, sync_attempts, last_sync_at, sync_error on transactions
 * - Updates status when sync queue operations complete
 * - Provides IPC handlers for real-time renderer updates
 * 
 * This service extends the sync queue to track status at the transaction level,
 * enabling per-transaction sync status display in the UI.
 */

import log from 'electron-log';
import { BrowserWindow } from 'electron';
import * as syncQueueService from './syncQueueService';
import * as kasDb from './kasDatabase';
import * as bankDb from './bankDatabase';
import * as gudangDb from './gudangDatabase';

// Sync status types for transactions
export type TransactionSyncStatus = 'synced' | 'pending' | 'failed' | 'conflict' | 'in_progress';

// Transaction sync status record
export interface TransactionSyncStatusRecord {
  id: string;
  module: 'kas' | 'bank' | 'gudang';
  recordId: string;
  syncStatus: TransactionSyncStatus;
  syncAttempts: number;
  lastSyncAt: string | null;
  syncError: string | null;
}

// IPC event channel for sync status updates
const SYNC_STATUS_CHANNEL = 'sync:transactionStatusChanged';

// Global window reference for IPC broadcasts
let mainWindow: BrowserWindow | null = null;

/**
 * Set the main window reference for IPC broadcasts
 */
export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * Broadcast sync status change to renderer
 */
function broadcastSyncStatusUpdate(record: TransactionSyncStatusRecord): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(SYNC_STATUS_CHANNEL, record);
    log.debug(`[SyncStatus] Broadcast update for ${record.module}/${record.recordId}: ${record.syncStatus}`);
  }
}

// Module database mapping
const moduleDatabases = {
  kas: kasDb,
  bank: bankDb,
  gudang: gudangDb,
};

/**
 * Add sync status columns to transaction table
 * Migration function for existing databases
 */
export function addSyncStatusColumns(
  module: 'kas' | 'bank' | 'gudang'
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    // Use the database's addColumn method if available
    if ('addColumn' in dbModule && typeof dbModule.addColumn === 'function') {
      dbModule.addColumn('sync_status', "TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'failed', 'in_progress'))");
      dbModule.addColumn('sync_attempts', 'INTEGER DEFAULT 0');
      dbModule.addColumn('last_sync_at', 'TEXT');
      dbModule.addColumn('sync_error', 'TEXT');
      log.info(`[SyncStatus] Added sync status columns to ${module} transactions`);
      return { success: true, message: `Added sync status columns to ${module}` };
    }
    
    // If no addColumn method, just return success - columns may already exist
    return { success: true, message: `Sync status columns for ${module} (already exist or handled by schema)` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to add sync status columns to ${module}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Update transaction sync status when queued for sync
 * Called when a new sync queue item is created
 */
export function onTransactionQueued(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    // Update transaction sync status to 'pending'
    if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
      const result = dbModule.updateSyncStatus(recordId, 'pending');
      
      if (result.success) {
        // Broadcast update to renderer
        broadcastSyncStatusUpdate({
          id: recordId,
          module,
          recordId,
          syncStatus: 'pending',
          syncAttempts: result.attempts || 0,
          lastSyncAt: result.lastSyncAt || null,
          syncError: null,
        });
      }
      
      return result;
    }
    
    log.warn(`[SyncStatus] updateSyncStatus not available for ${module}`);
    return { success: false, message: `Module ${module} does not support sync status updates` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to update sync status for queued ${module}/${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Update transaction sync status on sync success
 * Called when a sync queue item is marked as completed
 */
export function onTransactionSynced(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
      const result = dbModule.updateSyncStatus(recordId, 'synced');
      
      if (result.success) {
        broadcastSyncStatusUpdate({
          id: recordId,
          module,
          recordId,
          syncStatus: 'synced',
          syncAttempts: result.attempts || 0,
          lastSyncAt: result.lastSyncAt || new Date().toISOString(),
          syncError: null,
        });
      }
      
      return result;
    }
    
    return { success: false, message: `Module ${module} does not support sync status updates` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to update sync status for synced ${module}/${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Update transaction sync status on sync failure
 * Called when a sync queue item is marked as failed
 */
export function onTransactionSyncFailed(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string,
  errorMessage: string
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
      const result = dbModule.updateSyncStatus(recordId, 'failed', errorMessage);
      
      if (result.success) {
        broadcastSyncStatusUpdate({
          id: recordId,
          module,
          recordId,
          syncStatus: 'failed',
          syncAttempts: result.attempts || 0,
          lastSyncAt: result.lastSyncAt || null,
          syncError: errorMessage,
        });
      }
      
      return result;
    }
    
    return { success: false, message: `Module ${module} does not support sync status updates` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to update sync status for failed ${module}/${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Update transaction sync status on conflict
 * Called when a sync conflict is detected
 */
export function onTransactionConflict(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    if ('updateSyncStatus' in dbModule && typeof dbModule.updateSyncStatus === 'function') {
      const result = dbModule.updateSyncStatus(recordId, 'conflict');
      
      if (result.success) {
        broadcastSyncStatusUpdate({
          id: recordId,
          module,
          recordId,
          syncStatus: 'conflict',
          syncAttempts: result.attempts || 0,
          lastSyncAt: result.lastSyncAt || null,
          syncError: 'Sync conflict detected',
        });
      }
      
      return result;
    }
    
    return { success: false, message: `Module ${module} does not support sync status updates` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to update sync status for conflict ${module}/${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Get sync status for a transaction
 */
export function getTransactionSyncStatus(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string
): TransactionSyncStatusRecord | null {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    log.warn(`[SyncStatus] Unknown module: ${module}`);
    return null;
  }

  try {
    if ('getSyncStatus' in dbModule && typeof dbModule.getSyncStatus === 'function') {
      return dbModule.getSyncStatus(recordId);
    }
    
    log.warn(`[SyncStatus] getSyncStatus not available for ${module}`);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to get sync status for ${module}/${recordId}:`, errorMsg);
    return null;
  }
}

/**
 * Get all transactions with their sync status for a module
 */
export function getTransactionsWithSyncStatus(
  module: 'kas' | 'bank' | 'gudang'
): TransactionSyncStatusRecord[] {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    log.warn(`[SyncStatus] Unknown module: ${module}`);
    return [];
  }

  try {
    if ('getAllWithSyncStatus' in dbModule && typeof dbModule.getAllWithSyncStatus === 'function') {
      return dbModule.getAllWithSyncStatus();
    }
    
    log.warn(`[SyncStatus] getAllWithSyncStatus not available for ${module}`);
    return [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to get transactions with sync status for ${module}:`, errorMsg);
    return [];
  }
}

/**
 * Reset sync status to pending for retry
 * Called when a failed item is retried
 */
export function resetSyncStatusForRetry(
  module: 'kas' | 'bank' | 'gudang',
  recordId: string
): { success: boolean; message: string } {
  const dbModule = moduleDatabases[module];
  
  if (!dbModule) {
    return { success: false, message: `Unknown module: ${module}` };
  }

  try {
    if ('resetSyncStatus' in dbModule && typeof dbModule.resetSyncStatus === 'function') {
      const result = dbModule.resetSyncStatus(recordId);
      
      if (result.success) {
        broadcastSyncStatusUpdate({
          id: recordId,
          module,
          recordId,
          syncStatus: 'pending',
          syncAttempts: result.attempts || 0,
          lastSyncAt: result.lastSyncAt || null,
          syncError: null,
        });
      }
      
      return result;
    }
    
    return { success: false, message: `Module ${module} does not support sync status reset` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[SyncStatus] Failed to reset sync status for ${module}/${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Integrate with sync queue service callbacks
 * This sets up automatic status updates when sync queue events occur
 */
export function integrateWithSyncQueue(): void {
  log.info('[SyncStatus] Integrating with sync queue service');
  
  // The integration happens through the batch sync service
  // which calls onTransactionSynced/onTransactionSyncFailed when items complete
  // This is a placeholder for any additional integration logic
}

/**
 * Handle sync queue item completion - updates transaction sync status
 */
export function handleSyncQueueItemCompleted(
  item: syncQueueService.SyncQueueItem
): void {
  switch (item.status) {
    case 'completed':
      onTransactionSynced(item.module as 'kas' | 'bank' | 'gudang', item.recordId);
      break;
    case 'failed':
      onTransactionSyncFailed(
        item.module as 'kas' | 'bank' | 'gudang',
        item.recordId,
        item.lastError || 'Sync failed'
      );
      break;
    case 'conflict':
      onTransactionConflict(item.module as 'kas' | 'bank' | 'gudang', item.recordId);
      break;
  }
}

/**
 * Get IPC channel name for sync status updates
 */
export function getSyncStatusChannel(): string {
  return SYNC_STATUS_CHANNEL;
}

/**
 * Get human-readable sync status message (Indonesian)
 */
export function getSyncStatusMessage(status: TransactionSyncStatus): string {
  switch (status) {
    case 'synced':
      return 'Tersinkronkan';
    case 'pending':
      return 'Menunggu sync';
    case 'in_progress':
      return 'Sedang sync';
    case 'failed':
      return 'Gagal sync';
    case 'conflict':
      return 'Konflik terdeteksi';
    default:
      return 'Unknown';
  }
}

/**
 * Get sync status display info for UI
 */
export function getSyncStatusDisplay(
  status: TransactionSyncStatus
): { label: string; color: string; icon: string } {
  switch (status) {
    case 'synced':
      return { label: 'Synced', color: 'green', icon: 'check-circle' };
    case 'pending':
      return { label: 'Pending', color: 'yellow', icon: 'clock' };
    case 'in_progress':
      return { label: 'Syncing', color: 'blue', icon: 'sync' };
    case 'failed':
      return { label: 'Failed', color: 'red', icon: 'x-circle' };
    case 'conflict':
      return { label: 'Conflict', color: 'orange', icon: 'alert-triangle' };
    default:
      return { label: 'Unknown', color: 'gray', icon: 'help-circle' };
  }
}

// Default export
export default {
  setMainWindow,
  addSyncStatusColumns,
  onTransactionQueued,
  onTransactionSynced,
  onTransactionSyncFailed,
  onTransactionConflict,
  getTransactionSyncStatus,
  getTransactionsWithSyncStatus,
  resetSyncStatusForRetry,
  integrateWithSyncQueue,
  handleSyncQueueItemCompleted,
  getSyncStatusChannel,
  getSyncStatusMessage,
  getSyncStatusDisplay,
};
