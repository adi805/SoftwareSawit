/**
 * Dashboard Approval Service for SoftwareSawit
 * 
 * Provides unified backend service for dashboard approval:
 * - Aggregates pending approvals from Kas, Bank, Gudang modules
 * - Provides cross-module approval routing
 * - Enforces permission checks
 */

import log from 'electron-log';
import * as kasDb from './kasDatabase';
import * as bankDb from './bankDatabase';
import * as gudangDb from './gudangDatabase';
import * as localDbMgr from './localDatabaseManager';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';

// Module types
export type TransactionModule = 'kas' | 'bank' | 'gudang';

// Unified pending approval interface
export interface UnifiedPendingApproval {
  // Common fields
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  description: string;
  status: string;
  created_by: string;
  created_at: string;
  created_by_name?: string;
  
  // Module identification
  module: TransactionModule;
  
  // Module-specific fields (only populated if relevant)
  coa_id?: string | null;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_id?: string | null;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_id?: string | null;
  blok_kode?: string;
  blok_nama?: string;
  bank_account?: string | null;  // Bank module
  item_name?: string | null;     // Gudang module
  item_unit?: string | null;     // Gudang module
  
  // Calculated fields
  is_overdue: boolean;  // Pending > 24 hours
  hours_pending: number;
}

// Approval counts interface
export interface ApprovalCounts {
  pending_approval_1: number;
  pending_approval_2: number;
  by_module: {
    kas: { pending_approval_1: number; pending_approval_2: number };
    bank: { pending_approval_1: number; pending_approval_2: number };
    gudang: { pending_approval_1: number; pending_approval_2: number };
  };
  total_pending: number;
}

// Approve input interface
export interface DashboardApproveInput {
  approver_id: string;
  approver_name: string;
}

// Reject input interface  
export interface DashboardRejectInput {
  rejected_by_id: string;
  rejected_by_name: string;
  reason: string;
}

// Helper to check if transaction is overdue (>24 hours)
function isOverdue(createdAt: string): { isOverdue: boolean; hoursPending: number } {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const hoursPending = diffMs / (1000 * 60 * 60);
  return {
    isOverdue: hoursPending > 24,
    hoursPending: Math.round(hoursPending * 10) / 10  // Round to 1 decimal
  };
}

// Get pending approvals from a specific module database
async function getPendingFromModule(
  module: TransactionModule,
  db: Database
): Promise<UnifiedPendingApproval[]> {
  const pendingApprovals: UnifiedPendingApproval[] = [];
  
  const pendingStatus1 = module === 'kas' 
    ? kasDb.TRANSACTION_STATUS.PENDING_APPROVAL_1
    : module === 'bank'
      ? bankDb.TRANSACTION_STATUS.PENDING_APPROVAL_1
      : gudangDb.TRANSACTION_STATUS.PENDING_APPROVAL_1;
      
  const pendingStatus2 = module === 'kas'
    ? kasDb.TRANSACTION_STATUS.PENDING_APPROVAL_2
    : module === 'bank'
      ? bankDb.TRANSACTION_STATUS.PENDING_APPROVAL_2
      : gudangDb.TRANSACTION_STATUS.PENDING_APPROVAL_2;

  // Query pending transactions
  const result = db.exec(`
    SELECT 
      t.*,
      c.kode as coa_kode,
      c.nama as coa_nama,
      ak.kode as aspek_kerja_kode,
      ak.nama as aspek_kerja_nama,
      b.kode_blok as blok_kode,
      b.nama as blok_nama,
      u.full_name as created_by_name
    FROM transactions t
    LEFT JOIN coa c ON t.coa_id = c.id
    LEFT JOIN aspek_kerja ak ON t.aspek_kerja_id = ak.id
    LEFT JOIN blok b ON t.blok_id = b.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.status IN ('${pendingStatus1}', '${pendingStatus2}')
    ORDER BY t.created_at ASC
  `);

  if (result.length === 0) return [];

  const columns = result[0].columns;
  const rows = result[0].values;

  for (const row of rows) {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    const overdueCheck = isOverdue(obj.created_at as string);

    const unified: UnifiedPendingApproval = {
      id: obj.id as string,
      transaction_number: obj.transaction_number as string,
      transaction_date: obj.transaction_date as string,
      transaction_type: obj.transaction_type as string,
      amount: obj.amount as number,
      description: (obj.description as string) || '',
      status: obj.status as string,
      created_by: obj.created_by as string,
      created_at: obj.created_at as string,
      created_by_name: obj.created_by_name as string | undefined,
      module: module,
      coa_id: obj.coa_id as string | null,
      coa_kode: obj.coa_kode as string | undefined,
      coa_nama: obj.coa_nama as string | undefined,
      aspek_kerja_id: obj.aspek_kerja_id as string | null,
      aspek_kerja_kode: obj.aspek_kerja_kode as string | undefined,
      aspek_kerja_nama: obj.aspek_kerja_nama as string | undefined,
      blok_id: obj.blok_id as string | null,
      blok_kode: obj.blok_kode as string | undefined,
      blok_nama: obj.blok_nama as string | undefined,
      is_overdue: overdueCheck.isOverdue,
      hours_pending: overdueCheck.hoursPending,
    };

    // Add module-specific fields
    if (module === 'bank') {
      unified.bank_account = obj.bank_account as string | null;
    } else if (module === 'gudang') {
      unified.item_name = obj.item_name as string | null;
      unified.item_unit = obj.item_unit as string | null;
    }

    pendingApprovals.push(unified);
  }

  return pendingApprovals;
}

/**
 * Get all pending approvals from all modules
 */
export async function getPendingApprovals(
  filters?: {
    module?: TransactionModule;
    status?: string;
    searchTerm?: string;
  }
): Promise<UnifiedPendingApproval[]> {
  log.debug('[Dashboard] Getting pending approvals');
  
  const allPending: UnifiedPendingApproval[] = [];
  const modules: TransactionModule[] = ['kas', 'bank', 'gudang'];
  const dbMgr = localDbMgr.localDatabaseManager;

  for (const module of modules) {
    // Skip if filtering by module and this isn't the one
    if (filters?.module && filters.module !== module) {
      continue;
    }

    try {
      // Get all existing periods for this module
      const periods = dbMgr.getExistingPeriods(module);
      
      for (const period of periods) {
        const dbPath = dbMgr.getTransactionDatabasePath(module, period.year, period.month);
        
        if (!fs.existsSync(dbPath)) {
          continue;
        }

        const SQL = initSqlJs as unknown as SqlJsStatic;
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);

        const pending = await getPendingFromModule(module, db);
        
        // Apply filters
        let filtered = pending;
        
        if (filters?.status) {
          filtered = filtered.filter(p => p.status === filters.status);
        }
        
        if (filters?.searchTerm) {
          const term = filters.searchTerm.toLowerCase();
          filtered = filtered.filter(p => 
            p.transaction_number.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            (p.created_by_name && p.created_by_name.toLowerCase().includes(term))
          );
        }

        allPending.push(...filtered);
        
        db.close();
      }
    } catch (error) {
      log.error(`[Dashboard] Error getting pending from ${module}:`, error);
    }
  }

  // Sort by created_at (oldest first - FIFO)
  allPending.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  log.debug(`[Dashboard] Found ${allPending.length} pending approvals`);
  
  return allPending;
}

/**
 * Get approval counts for dashboard summary cards
 */
export async function getApprovalCounts(): Promise<ApprovalCounts> {
  log.debug('[Dashboard] Getting approval counts');
  
  const counts: ApprovalCounts = {
    pending_approval_1: 0,
    pending_approval_2: 0,
    by_module: {
      kas: { pending_approval_1: 0, pending_approval_2: 0 },
      bank: { pending_approval_1: 0, pending_approval_2: 0 },
      gudang: { pending_approval_1: 0, pending_approval_2: 0 },
    },
    total_pending: 0,
  };

  const modules: TransactionModule[] = ['kas', 'bank', 'gudang'];
  const dbMgr = localDbMgr.localDatabaseManager;

  for (const module of modules) {
    try {
      const periods = dbMgr.getExistingPeriods(module);
      
      for (const period of periods) {
        const dbPath = dbMgr.getTransactionDatabasePath(module, period.year, period.month);
        
        if (!fs.existsSync(dbPath)) {
          continue;
        }

        const SQL = initSqlJs as unknown as SqlJsStatic;
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);

        // Count PA1
        const status1 = module === 'kas' 
          ? kasDb.TRANSACTION_STATUS.PENDING_APPROVAL_1
          : module === 'bank'
            ? bankDb.TRANSACTION_STATUS.PENDING_APPROVAL_1
            : gudangDb.TRANSACTION_STATUS.PENDING_APPROVAL_1;

        const status2 = module === 'kas'
          ? kasDb.TRANSACTION_STATUS.PENDING_APPROVAL_2
          : module === 'bank'
            ? bankDb.TRANSACTION_STATUS.PENDING_APPROVAL_2
            : gudangDb.TRANSACTION_STATUS.PENDING_APPROVAL_2;

        const pa1Result = db.exec(`
          SELECT COUNT(*) FROM transactions WHERE status = '${status1}'
        `);
        
        const pa2Result = db.exec(`
          SELECT COUNT(*) FROM transactions WHERE status = '${status2}'
        `);

        const pa1Count = pa1Result.length > 0 ? (pa1Result[0].values[0][0] as number) : 0;
        const pa2Count = pa2Result.length > 0 ? (pa2Result[0].values[0][0] as number) : 0;

        counts.by_module[module].pending_approval_1 += pa1Count;
        counts.by_module[module].pending_approval_2 += pa2Count;
        
        db.close();
      }
    } catch (error) {
      log.error(`[Dashboard] Error counting ${module}:`, error);
    }
  }

  counts.pending_approval_1 = 
    counts.by_module.kas.pending_approval_1 +
    counts.by_module.bank.pending_approval_1 +
    counts.by_module.gudang.pending_approval_1;

  counts.pending_approval_2 = 
    counts.by_module.kas.pending_approval_2 +
    counts.by_module.bank.pending_approval_2 +
    counts.by_module.gudang.pending_approval_2;

  counts.total_pending = counts.pending_approval_1 + counts.pending_approval_2;

  log.debug(`[Dashboard] Counts: PA1=${counts.pending_approval_1}, PA2=${counts.pending_approval_2}, Total=${counts.total_pending}`);

  return counts;
}

/**
 * Approve a transaction from dashboard (routes to correct module)
 */
export async function approveFromDashboard(
  module: TransactionModule,
  transactionId: string,
  input: DashboardApproveInput
): Promise<{ success: boolean; message: string }> {
  log.info(`[Dashboard] Approve request: ${module}/${transactionId} by ${input.approver_name}`);

  try {
    // Route to correct module handler
    if (module === 'kas') {
      return kasDb.approveTransaction(transactionId, input);
    } else if (module === 'bank') {
      return bankDb.approveTransaction(transactionId, input);
    } else if (module === 'gudang') {
      return gudangDb.approveTransaction(transactionId, input);
    } else {
      return { success: false, message: 'Modul tidak valid' };
    }
  } catch (error) {
    log.error(`[Dashboard] Error approving ${module}/${transactionId}:`, error);
    return { success: false, message: `Error approving transaction: ${error}` };
  }
}

/**
 * Reject a transaction from dashboard (routes to correct module)
 */
export async function rejectFromDashboard(
  module: TransactionModule,
  transactionId: string,
  input: DashboardRejectInput
): Promise<{ success: boolean; message: string }> {
  log.info(`[Dashboard] Reject request: ${module}/${transactionId} by ${input.rejected_by_name}`);

  try {
    // Validate reason
    if (!input.reason || input.reason.trim().length < 5) {
      return { success: false, message: 'Alasan penolakan minimal 5 karakter' };
    }

    // Route to correct module handler
    if (module === 'kas') {
      return kasDb.rejectTransaction(transactionId, input);
    } else if (module === 'bank') {
      return bankDb.rejectTransaction(transactionId, input);
    } else if (module === 'gudang') {
      return gudangDb.rejectTransaction(transactionId, input);
    } else {
      return { success: false, message: 'Modul tidak valid' };
    }
  } catch (error) {
    log.error(`[Dashboard] Error rejecting ${module}/${transactionId}:`, error);
    return { success: false, message: `Error rejecting transaction: ${error}` };
  }
}

/**
 * Get transaction details from any module
 */
export async function getTransactionFromDashboard(
  module: TransactionModule,
  transactionId: string
): Promise<UnifiedPendingApproval | null> {
  log.debug(`[Dashboard] Get transaction: ${module}/${transactionId}`);

  try {
    let transaction: UnifiedPendingApproval | null = null;

    if (module === 'kas') {
      const tx = kasDb.getTransactionById(transactionId);
      if (tx) {
        const overdueCheck = isOverdue(tx.created_at);
        transaction = {
          ...tx,
          module: 'kas',
          is_overdue: overdueCheck.isOverdue,
          hours_pending: overdueCheck.hoursPending,
        };
      }
    } else if (module === 'bank') {
      const tx = bankDb.getTransactionById(transactionId);
      if (tx) {
        const overdueCheck = isOverdue(tx.created_at);
        transaction = {
          ...tx,
          module: 'bank',
          is_overdue: overdueCheck.isOverdue,
          hours_pending: overdueCheck.hoursPending,
        };
      }
    } else if (module === 'gudang') {
      const tx = gudangDb.getTransactionById(transactionId);
      if (tx) {
        const overdueCheck = isOverdue(tx.created_at);
        transaction = {
          ...tx,
          module: 'gudang',
          is_overdue: overdueCheck.isOverdue,
          hours_pending: overdueCheck.hoursPending,
        };
      }
    }

    return transaction;
  } catch (error) {
    log.error(`[Dashboard] Error getting ${module}/${transactionId}:`, error);
    return null;
  }
}

/**
 * Get approval history for a transaction from any module
 */
export async function getApprovalHistoryFromDashboard(
  module: TransactionModule,
  transactionId: string
): Promise<Array<{
  id: string;
  transaction_id: string;
  action: string;
  user_id: string;
  user_name: string;
  action_at: string;
  notes: string | null;
}>> {
  log.debug(`[Dashboard] Get approval history: ${module}/${transactionId}`);

  try {
    if (module === 'kas') {
      return kasDb.getApprovalHistory(transactionId);
    } else if (module === 'bank') {
      return bankDb.getApprovalHistory(transactionId);
    } else if (module === 'gudang') {
      return gudangDb.getApprovalHistory(transactionId);
    }
    return [];
  } catch (error) {
    log.error(`[Dashboard] Error getting history ${module}/${transactionId}:`, error);
    return [];
  }
}
