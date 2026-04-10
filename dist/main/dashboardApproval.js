"use strict";
/**
 * Dashboard Approval Service for SoftwareSawit
 *
 * Provides unified backend service for dashboard approval:
 * - Aggregates pending approvals from Kas, Bank, Gudang modules
 * - Provides cross-module approval routing
 * - Enforces permission checks
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
exports.getPendingApprovals = getPendingApprovals;
exports.getApprovalCounts = getApprovalCounts;
exports.approveFromDashboard = approveFromDashboard;
exports.rejectFromDashboard = rejectFromDashboard;
exports.getTransactionFromDashboard = getTransactionFromDashboard;
exports.getApprovalHistoryFromDashboard = getApprovalHistoryFromDashboard;
const electron_log_1 = __importDefault(require("electron-log"));
const kasDb = __importStar(require("./kasDatabase"));
const bankDb = __importStar(require("./bankDatabase"));
const gudangDb = __importStar(require("./gudangDatabase"));
const localDbMgr = __importStar(require("./localDatabaseManager"));
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
// Helper to check if transaction is overdue (>24 hours)
function isOverdue(createdAt) {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const hoursPending = diffMs / (1000 * 60 * 60);
    return {
        isOverdue: hoursPending > 24,
        hoursPending: Math.round(hoursPending * 10) / 10 // Round to 1 decimal
    };
}
// Get pending approvals from a specific module database
async function getPendingFromModule(module, db) {
    const pendingApprovals = [];
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
    if (result.length === 0)
        return [];
    const columns = result[0].columns;
    const rows = result[0].values;
    for (const row of rows) {
        const obj = {};
        columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        const overdueCheck = isOverdue(obj.created_at);
        const unified = {
            id: obj.id,
            transaction_number: obj.transaction_number,
            transaction_date: obj.transaction_date,
            transaction_type: obj.transaction_type,
            amount: obj.amount,
            description: obj.description || '',
            status: obj.status,
            created_by: obj.created_by,
            created_at: obj.created_at,
            created_by_name: obj.created_by_name,
            module: module,
            coa_id: obj.coa_id,
            coa_kode: obj.coa_kode,
            coa_nama: obj.coa_nama,
            aspek_kerja_id: obj.aspek_kerja_id,
            aspek_kerja_kode: obj.aspek_kerja_kode,
            aspek_kerja_nama: obj.aspek_kerja_nama,
            blok_id: obj.blok_id,
            blok_kode: obj.blok_kode,
            blok_nama: obj.blok_nama,
            is_overdue: overdueCheck.isOverdue,
            hours_pending: overdueCheck.hoursPending,
        };
        // Add module-specific fields
        if (module === 'bank') {
            unified.bank_account = obj.bank_account;
        }
        else if (module === 'gudang') {
            unified.item_name = obj.item_name;
            unified.item_unit = obj.item_unit;
        }
        pendingApprovals.push(unified);
    }
    return pendingApprovals;
}
/**
 * Get all pending approvals from all modules
 */
async function getPendingApprovals(filters) {
    electron_log_1.default.debug('[Dashboard] Getting pending approvals');
    const allPending = [];
    const modules = ['kas', 'bank', 'gudang'];
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
                const SQL = sql_js_1.default;
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
                    filtered = filtered.filter(p => p.transaction_number.toLowerCase().includes(term) ||
                        p.description.toLowerCase().includes(term) ||
                        (p.created_by_name && p.created_by_name.toLowerCase().includes(term)));
                }
                allPending.push(...filtered);
                db.close();
            }
        }
        catch (error) {
            electron_log_1.default.error(`[Dashboard] Error getting pending from ${module}:`, error);
        }
    }
    // Sort by created_at (oldest first - FIFO)
    allPending.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    electron_log_1.default.debug(`[Dashboard] Found ${allPending.length} pending approvals`);
    return allPending;
}
/**
 * Get approval counts for dashboard summary cards
 */
async function getApprovalCounts() {
    electron_log_1.default.debug('[Dashboard] Getting approval counts');
    const counts = {
        pending_approval_1: 0,
        pending_approval_2: 0,
        by_module: {
            kas: { pending_approval_1: 0, pending_approval_2: 0 },
            bank: { pending_approval_1: 0, pending_approval_2: 0 },
            gudang: { pending_approval_1: 0, pending_approval_2: 0 },
        },
        total_pending: 0,
    };
    const modules = ['kas', 'bank', 'gudang'];
    const dbMgr = localDbMgr.localDatabaseManager;
    for (const module of modules) {
        try {
            const periods = dbMgr.getExistingPeriods(module);
            for (const period of periods) {
                const dbPath = dbMgr.getTransactionDatabasePath(module, period.year, period.month);
                if (!fs.existsSync(dbPath)) {
                    continue;
                }
                const SQL = sql_js_1.default;
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
                const pa1Count = pa1Result.length > 0 ? pa1Result[0].values[0][0] : 0;
                const pa2Count = pa2Result.length > 0 ? pa2Result[0].values[0][0] : 0;
                counts.by_module[module].pending_approval_1 += pa1Count;
                counts.by_module[module].pending_approval_2 += pa2Count;
                db.close();
            }
        }
        catch (error) {
            electron_log_1.default.error(`[Dashboard] Error counting ${module}:`, error);
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
    electron_log_1.default.debug(`[Dashboard] Counts: PA1=${counts.pending_approval_1}, PA2=${counts.pending_approval_2}, Total=${counts.total_pending}`);
    return counts;
}
/**
 * Approve a transaction from dashboard (routes to correct module)
 */
async function approveFromDashboard(module, transactionId, input) {
    electron_log_1.default.info(`[Dashboard] Approve request: ${module}/${transactionId} by ${input.approver_name}`);
    try {
        // Route to correct module handler
        if (module === 'kas') {
            return kasDb.approveTransaction(transactionId, input);
        }
        else if (module === 'bank') {
            return bankDb.approveTransaction(transactionId, input);
        }
        else if (module === 'gudang') {
            return gudangDb.approveTransaction(transactionId, input);
        }
        else {
            return { success: false, message: 'Modul tidak valid' };
        }
    }
    catch (error) {
        electron_log_1.default.error(`[Dashboard] Error approving ${module}/${transactionId}:`, error);
        return { success: false, message: `Error approving transaction: ${error}` };
    }
}
/**
 * Reject a transaction from dashboard (routes to correct module)
 */
async function rejectFromDashboard(module, transactionId, input) {
    electron_log_1.default.info(`[Dashboard] Reject request: ${module}/${transactionId} by ${input.rejected_by_name}`);
    try {
        // Validate reason
        if (!input.reason || input.reason.trim().length < 5) {
            return { success: false, message: 'Alasan penolakan minimal 5 karakter' };
        }
        // Route to correct module handler
        if (module === 'kas') {
            return kasDb.rejectTransaction(transactionId, input);
        }
        else if (module === 'bank') {
            return bankDb.rejectTransaction(transactionId, input);
        }
        else if (module === 'gudang') {
            return gudangDb.rejectTransaction(transactionId, input);
        }
        else {
            return { success: false, message: 'Modul tidak valid' };
        }
    }
    catch (error) {
        electron_log_1.default.error(`[Dashboard] Error rejecting ${module}/${transactionId}:`, error);
        return { success: false, message: `Error rejecting transaction: ${error}` };
    }
}
/**
 * Get transaction details from any module
 */
async function getTransactionFromDashboard(module, transactionId) {
    electron_log_1.default.debug(`[Dashboard] Get transaction: ${module}/${transactionId}`);
    try {
        let transaction = null;
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
        }
        else if (module === 'bank') {
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
        }
        else if (module === 'gudang') {
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
    }
    catch (error) {
        electron_log_1.default.error(`[Dashboard] Error getting ${module}/${transactionId}:`, error);
        return null;
    }
}
/**
 * Get approval history for a transaction from any module
 */
async function getApprovalHistoryFromDashboard(module, transactionId) {
    electron_log_1.default.debug(`[Dashboard] Get approval history: ${module}/${transactionId}`);
    try {
        if (module === 'kas') {
            return kasDb.getApprovalHistory(transactionId);
        }
        else if (module === 'bank') {
            return bankDb.getApprovalHistory(transactionId);
        }
        else if (module === 'gudang') {
            return gudangDb.getApprovalHistory(transactionId);
        }
        return [];
    }
    catch (error) {
        electron_log_1.default.error(`[Dashboard] Error getting history ${module}/${transactionId}:`, error);
        return [];
    }
}
