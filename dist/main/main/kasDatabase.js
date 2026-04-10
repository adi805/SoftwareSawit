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
exports.TRANSACTION_TYPES = exports.TRANSACTION_STATUS = void 0;
exports.initKasDatabase = initKasDatabase;
exports.switchPeriod = switchPeriod;
exports.getCurrentPeriod = getCurrentPeriod;
exports.getAllTransactions = getAllTransactions;
exports.getTransactionById = getTransactionById;
exports.createTransaction = createTransaction;
exports.updateTransaction = updateTransaction;
exports.deleteTransaction = deleteTransaction;
exports.clearAllKas = clearAllKas;
exports.approveTransaction = approveTransaction;
exports.rejectTransaction = rejectTransaction;
exports.getApprovalHistory = getApprovalHistory;
exports.getApprovers = getApprovers;
exports.checkApproverSetup = checkApproverSetup;
exports.getKasBalance = getKasBalance;
exports.searchTransactions = searchTransactions;
exports.getTransactionsWithPagination = getTransactionsWithPagination;
exports.getStatusOptions = getStatusOptions;
exports.copyTransaction = copyTransaction;
exports.validateCOA = validateCOA;
exports.getActiveCOA = getActiveCOA;
exports.getActiveAspekKerja = getActiveAspekKerja;
exports.getActiveBlok = getActiveBlok;
exports.getAllTransactionNumbers = getAllTransactionNumbers;
exports.importKasBatch = importKasBatch;
exports.closeDatabase = closeDatabase;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const uuid_1 = require("uuid");
let db = null;
// Transaction statuses
exports.TRANSACTION_STATUS = {
    PENDING_APPROVAL_1: 'Pending Approval 1',
    PENDING_APPROVAL_2: 'Pending Approval 2',
    FULLY_APPROVED: 'Fully Approved',
    REJECTED: 'Rejected',
};
// Transaction types
exports.TRANSACTION_TYPES = {
    KAS_MASUK: 'Kas Masuk',
    KAS_KELUAR: 'Kas Keluar',
};
let currentYear;
let currentMonth;
let DB_PATH;
function getDatabasePath() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    const basePath = electron_1.app.getPath('userData');
    return path.join(basePath, 'data', 'kas', String(currentYear), String(currentMonth).padStart(2, '0') + '.db');
}
function ensureDataDirectory() {
    const dataDir = path.join(electron_1.app.getPath('userData'), 'data', 'kas', String(currentYear));
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        electron_log_1.default.info(`[KAS-DB] Created data directory: ${dataDir}`);
    }
}
// Initialize database
async function initKasDatabase() {
    electron_log_1.default.info('[KAS-DB] Initializing Kas database...');
    try {
        const SQL = await (0, sql_js_1.default)();
        DB_PATH = getDatabasePath();
        ensureDataDirectory();
        // Load existing database or create new one
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[KAS-DB] Loaded existing database:', DB_PATH);
        }
        else {
            db = new SQL.Database();
            electron_log_1.default.info('[KAS-DB] Created new database:', DB_PATH);
        }
        // Create tables
        createTables();
        // Save database
        saveDatabase();
        electron_log_1.default.info('[KAS-DB] Kas database initialized successfully');
    }
    catch (error) {
        electron_log_1.default.error('[KAS-DB] Failed to initialize database:', error);
        throw error;
    }
}
function createTables() {
    if (!db)
        return;
    // Enable foreign key enforcement
    db.run('PRAGMA foreign_keys = ON');
    // Transactions table
    db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      transaction_number TEXT UNIQUE NOT NULL,
      transaction_date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      coa_id TEXT,
      aspek_kerja_id TEXT,
      blok_id TEXT,
      status TEXT NOT NULL DEFAULT 'Pending Approval 1',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approver_1_id TEXT,
      approver_1_name TEXT,
      approver_1_at TEXT,
      approver_2_id TEXT,
      approver_2_name TEXT,
      approver_2_at TEXT,
      rejected_by TEXT,
      rejected_by_name TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE SET NULL,
      FOREIGN KEY (aspek_kerja_id) REFERENCES aspek_kerja(id) ON DELETE SET NULL,
      FOREIGN KEY (blok_id) REFERENCES blok(id) ON DELETE SET NULL
    )
  `);
    // Approval history table
    db.run(`
    CREATE TABLE IF NOT EXISTS approval_history (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    )
  `);
    // Create index on transaction_number for faster lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_number ON transactions(transaction_number)`);
    // Create index on status for filtering
    db.run(`CREATE INDEX IF NOT EXISTS idx_status ON transactions(status)`);
    // Create index on transaction_date for filtering
    db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_date ON transactions(transaction_date)`);
    electron_log_1.default.info('[KAS-DB] Tables created');
}
function saveDatabase() {
    if (!db)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}
// Switch to a different period database
function switchPeriod(year, month) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    try {
        // Save current database first
        saveDatabase();
        currentYear = year;
        currentMonth = month;
        DB_PATH = getDatabasePath();
        ensureDataDirectory();
        // Load or create new database
        const SQL = sql_js_1.default;
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[KAS-DB] Switched to existing database:', DB_PATH);
        }
        else {
            db = new SQL.Database();
            createTables();
            saveDatabase();
            electron_log_1.default.info('[KAS-DB] Switched to new database:', DB_PATH);
        }
        return { success: true, message: `Switched to ${year}/${String(month).padStart(2, '0')}` };
    }
    catch (error) {
        electron_log_1.default.error('[KAS-DB] Failed to switch period:', error);
        return { success: false, message: 'Failed to switch period' };
    }
}
function getCurrentPeriod() {
    return { year: currentYear, month: currentMonth };
}
// Generate next transaction number
function generateTransactionNumber(type) {
    const prefix = type === exports.TRANSACTION_TYPES.KAS_MASUK ? 'KAS-M' : 'KAS-K';
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    // Get the last transaction number for this date and type
    if (!db)
        return `${prefix}/${dateStr}/0001`;
    const result = db.exec(`
    SELECT transaction_number FROM transactions 
    WHERE transaction_number LIKE '${prefix}/${dateStr}%'
    ORDER BY transaction_number DESC
    LIMIT 1
  `);
    let sequence = 1;
    if (result.length > 0 && result[0].values.length > 0) {
        const lastNumber = result[0].values[0][0];
        const parts = lastNumber.split('/');
        if (parts.length === 3) {
            sequence = parseInt(parts[2], 10) + 1;
        }
    }
    return `${prefix}/${dateStr}/${String(sequence).padStart(4, '0')}`;
}
// CRUD Operations
function getAllTransactions() {
    if (!db)
        return [];
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
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const obj = {};
        result[0].columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        return obj;
    });
}
function getTransactionById(id) {
    if (!db)
        return null;
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
    WHERE t.id = ?
  `, [id]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function createTransaction(input) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate amount
    if (typeof input.amount !== 'number' || input.amount <= 0) {
        return { success: false, message: 'Jumlah harus lebih dari 0' };
    }
    // Validate transaction type
    if (!Object.values(exports.TRANSACTION_TYPES).includes(input.transaction_type)) {
        return { success: false, message: 'Jenis transaksi tidak valid' };
    }
    const id = (0, uuid_1.v4)();
    const transactionNumber = generateTransactionNumber(input.transaction_type);
    const now = new Date().toISOString();
    db.run(`INSERT INTO transactions (
      id, transaction_number, transaction_date, transaction_type, amount, description,
      coa_id, aspek_kerja_id, blok_id, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id,
        transactionNumber,
        input.transaction_date,
        input.transaction_type,
        input.amount,
        input.description,
        input.coa_id,
        input.aspek_kerja_id,
        input.blok_id,
        exports.TRANSACTION_STATUS.PENDING_APPROVAL_1,
        input.created_by,
        now,
        now,
    ]);
    // Add approval history entry
    const historyId = (0, uuid_1.v4)();
    db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [historyId, id, 'created', input.created_by, input.created_by, now, 'Transaksi dibuat']);
    saveDatabase();
    const transaction = {
        id,
        transaction_number: transactionNumber,
        transaction_date: input.transaction_date,
        transaction_type: input.transaction_type,
        amount: input.amount,
        description: input.description,
        coa_id: input.coa_id,
        aspek_kerja_id: input.aspek_kerja_id,
        blok_id: input.blok_id,
        status: exports.TRANSACTION_STATUS.PENDING_APPROVAL_1,
        created_by: input.created_by,
        created_at: now,
        updated_at: now,
        approver_1_id: null,
        approver_1_name: null,
        approver_1_at: null,
        approver_2_id: null,
        approver_2_name: null,
        approver_2_at: null,
        rejected_by: null,
        rejected_by_name: null,
        rejected_at: null,
        rejection_reason: null,
    };
    electron_log_1.default.info(`[KAS-DB] Created transaction: ${transactionNumber}`);
    return { success: true, message: 'Transaksi berhasil ditambahkan', transaction };
}
function updateTransaction(id, input, updatedBy) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Get current transaction
    const transaction = getTransactionById(id);
    if (!transaction) {
        return { success: false, message: 'Transaksi tidak ditemukan' };
    }
    // Can only edit pending transactions
    if (transaction.status !== exports.TRANSACTION_STATUS.PENDING_APPROVAL_1) {
        return { success: false, message: 'Hanya transaksi dengan status "Pending Approval 1" yang dapat diedit' };
    }
    // Build update query
    const updates = [];
    const params = [];
    if (input.transaction_date !== undefined) {
        updates.push('transaction_date = ?');
        params.push(input.transaction_date);
    }
    if (input.amount !== undefined) {
        if (input.amount <= 0) {
            return { success: false, message: 'Jumlah harus lebih dari 0' };
        }
        updates.push('amount = ?');
        params.push(input.amount);
    }
    if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description);
    }
    if (input.coa_id !== undefined) {
        updates.push('coa_id = ?');
        params.push(input.coa_id);
    }
    if (input.aspek_kerja_id !== undefined) {
        updates.push('aspek_kerja_id = ?');
        params.push(input.aspek_kerja_id);
    }
    if (input.blok_id !== undefined) {
        updates.push('blok_id = ?');
        params.push(input.blok_id);
    }
    if (updates.length === 0) {
        return { success: true, message: 'Tidak ada perubahan' };
    }
    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);
    db.run(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, params);
    // Add approval history entry
    const historyId = (0, uuid_1.v4)();
    db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [historyId, id, 'edited', updatedBy, updatedBy, now, 'Transaksi diedit']);
    saveDatabase();
    electron_log_1.default.info(`[KAS-DB] Updated transaction ID: ${id}`);
    return { success: true, message: 'Transaksi berhasil diupdate' };
}
function deleteTransaction(id) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Get current transaction
    const transaction = getTransactionById(id);
    if (!transaction) {
        return { success: false, message: 'Transaksi tidak ditemukan' };
    }
    // Can only delete pending transactions
    if (transaction.status !== exports.TRANSACTION_STATUS.PENDING_APPROVAL_1) {
        return { success: false, message: 'Hanya transaksi dengan status "Pending Approval 1" yang dapat dihapus' };
    }
    // Delete approval history first
    db.run(`DELETE FROM approval_history WHERE transaction_id = ?`, [id]);
    // Delete transaction
    db.run(`DELETE FROM transactions WHERE id = ?`, [id]);
    saveDatabase();
    electron_log_1.default.info(`[KAS-DB] Deleted transaction ID: ${id}`);
    return { success: true, message: 'Transaksi berhasil dihapus' };
}
function clearAllKas() {
    if (!db) {
        return { success: false, message: 'Database not initialized', deletedCount: 0 };
    }
    const countResult = db.exec('SELECT COUNT(*) as count FROM transactions');
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada data Kas untuk dihapus', deletedCount: 0 };
    }
    db.run('DELETE FROM approval_history');
    db.run('DELETE FROM transactions');
    saveDatabase();
    electron_log_1.default.info(`[KAS-DB] Cleared all Kas data. Deleted ${count} transactions.`);
    return { success: true, message: `Berhasil menghapus ${count} data Kas`, deletedCount: count };
}
function approveTransaction(id, input) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Get current transaction
    const transaction = getTransactionById(id);
    if (!transaction) {
        return { success: false, message: 'Transaksi tidak ditemukan' };
    }
    const now = new Date().toISOString();
    // Determine which approval step
    if (transaction.status === exports.TRANSACTION_STATUS.PENDING_APPROVAL_1) {
        // First approval
        // Check if approver is different from creator
        if (transaction.created_by === input.approver_id) {
            return { success: false, message: 'Tidak dapat menyetujui transaksi sendiri' };
        }
        db.run(`UPDATE transactions SET 
        status = ?, 
        approver_1_id = ?, 
        approver_1_name = ?, 
        approver_1_at = ?,
        updated_at = ?
      WHERE id = ?`, [
            exports.TRANSACTION_STATUS.PENDING_APPROVAL_2,
            input.approver_id,
            input.approver_name,
            now,
            now,
            id,
        ]);
        // Add history entry
        db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), id, 'approved_1', input.approver_id, input.approver_name, now, 'Approval tahap 1']);
    }
    else if (transaction.status === exports.TRANSACTION_STATUS.PENDING_APPROVAL_2) {
        // Second approval
        // Check if approver is different from creator
        if (transaction.created_by === input.approver_id) {
            return { success: false, message: 'Tidak dapat menyetujui transaksi sendiri' };
        }
        // Check if approver 2 is different from approver 1
        if (transaction.approver_1_id === input.approver_id) {
            return { success: false, message: 'Approver tahap 2 harus berbeda dari approver tahap 1' };
        }
        db.run(`UPDATE transactions SET 
        status = ?, 
        approver_2_id = ?, 
        approver_2_name = ?, 
        approver_2_at = ?,
        updated_at = ?
      WHERE id = ?`, [
            exports.TRANSACTION_STATUS.FULLY_APPROVED,
            input.approver_id,
            input.approver_name,
            now,
            now,
            id,
        ]);
        // Add history entry
        db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), id, 'approved_2', input.approver_id, input.approver_name, now, 'Approval tahap 2 - Fully Approved']);
    }
    else {
        return { success: false, message: `Transaksi dengan status "${transaction.status}" tidak dapat disetujui` };
    }
    saveDatabase();
    electron_log_1.default.info(`[KAS-DB] Approved transaction ID: ${id}, new status: ${transaction.status === exports.TRANSACTION_STATUS.PENDING_APPROVAL_1 ? exports.TRANSACTION_STATUS.PENDING_APPROVAL_2 : exports.TRANSACTION_STATUS.FULLY_APPROVED}`);
    return { success: true, message: 'Transaksi berhasil disetujui' };
}
function rejectTransaction(id, input) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate rejection reason
    if (!input.reason || input.reason.trim() === '') {
        return { success: false, message: 'Alasan penolakan harus diisi' };
    }
    // Get current transaction
    const transaction = getTransactionById(id);
    if (!transaction) {
        return { success: false, message: 'Transaksi tidak ditemukan' };
    }
    // Can only reject pending transactions
    if (transaction.status !== exports.TRANSACTION_STATUS.PENDING_APPROVAL_1 &&
        transaction.status !== exports.TRANSACTION_STATUS.PENDING_APPROVAL_2) {
        return { success: false, message: `Transaksi dengan status "${transaction.status}" tidak dapat ditolak` };
    }
    const now = new Date().toISOString();
    db.run(`UPDATE transactions SET 
      status = ?, 
      rejected_by = ?, 
      rejected_by_name = ?, 
      rejected_at = ?,
      rejection_reason = ?,
      updated_at = ?
    WHERE id = ?`, [
        exports.TRANSACTION_STATUS.REJECTED,
        input.rejected_by_id,
        input.rejected_by_name,
        now,
        input.reason.trim(),
        now,
        id,
    ]);
    // Add history entry
    db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), id, 'rejected', input.rejected_by_id, input.rejected_by_name, now, `Ditolak: ${input.reason.trim()}`]);
    saveDatabase();
    electron_log_1.default.info(`[KAS-DB] Rejected transaction ID: ${id}`);
    return { success: true, message: 'Transaksi berhasil ditolak' };
}
// Get approval history for a transaction
function getApprovalHistory(transactionId) {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT * FROM approval_history 
    WHERE transaction_id = ?
    ORDER BY action_at ASC
  `, [transactionId]);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const obj = {};
        result[0].columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        return obj;
    });
}
// Get approvers list (users with Approver role)
function getApprovers() {
    if (!db)
        return [];
    // Import user database functions inline to avoid circular dependency
    // In a real app, you'd have a proper shared module
    try {
        const userDbPath = path.join(electron_1.app.getPath('userData'), 'data', 'users.db');
        if (!fs.existsSync(userDbPath))
            return [];
        const SQL = sql_js_1.default;
        const buffer = fs.readFileSync(userDbPath);
        const userDb = new SQL.Database(buffer);
        const result = userDb.exec(`
      SELECT id, full_name FROM users 
      WHERE role = 'Approver' AND status = 'active'
      ORDER BY full_name
    `);
        userDb.close();
        if (result.length === 0)
            return [];
        return result[0].values.map((row) => ({
            id: row[0],
            full_name: row[1],
        }));
    }
    catch (error) {
        electron_log_1.default.error('[KAS-DB] Failed to get approvers:', error);
        return [];
    }
}
// Check if approver setup is complete (at least 2 approvers)
function checkApproverSetup() {
    const approvers = getApprovers();
    if (approvers.length < 2) {
        return {
            complete: false,
            approverCount: approvers.length,
            message: `Diperlukan minimal 2 approver. Saat ini hanya ada ${approvers.length} approver.`,
        };
    }
    return {
        complete: true,
        approverCount: approvers.length,
        message: 'Setup approver lengkap',
    };
}
// Balance calculation (only fully approved transactions)
function getKasBalance() {
    if (!db) {
        return { kasMasuk: 0, kasKeluar: 0, balance: 0 };
    }
    // Sum fully approved Kas Masuk
    const masukResult = db.exec(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM transactions 
    WHERE transaction_type = 'Kas Masuk' AND status = 'Fully Approved'
  `);
    const kasMasuk = masukResult.length > 0 ? masukResult[0].values[0][0] : 0;
    // Sum fully approved Kas Keluar
    const keluarResult = db.exec(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM transactions 
    WHERE transaction_type = 'Kas Keluar' AND status = 'Fully Approved'
  `);
    const kasKeluar = keluarResult.length > 0 ? keluarResult[0].values[0][0] : 0;
    return {
        kasMasuk,
        kasKeluar,
        balance: kasMasuk - kasKeluar,
    };
}
// Search and Filter
function searchTransactions(searchTerm, transactionType, status, startDate, endDate) {
    if (!db)
        return [];
    let query = `
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
    WHERE 1=1
  `;
    const params = [];
    if (searchTerm) {
        query += ` AND (t.transaction_number LIKE ? OR t.description LIKE ?)`;
        const term = `%${searchTerm}%`;
        params.push(term, term);
    }
    if (transactionType) {
        query += ` AND t.transaction_type = ?`;
        params.push(transactionType);
    }
    if (status) {
        query += ` AND t.status = ?`;
        params.push(status);
    }
    if (startDate) {
        query += ` AND t.transaction_date >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        query += ` AND t.transaction_date <= ?`;
        params.push(endDate);
    }
    query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`;
    const result = db.exec(query, params);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const obj = {};
        result[0].columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        return obj;
    });
}
function getTransactionsWithPagination(page = 1, pageSize = 20, searchTerm, transactionType, status, startDate, endDate) {
    if (!db) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    let whereClause = '1=1';
    const params = [];
    if (searchTerm) {
        whereClause += ` AND (t.transaction_number LIKE ? OR t.description LIKE ?)`;
        const term = `%${searchTerm}%`;
        params.push(term, term);
    }
    if (transactionType) {
        whereClause += ` AND t.transaction_type = ?`;
        params.push(transactionType);
    }
    if (status) {
        whereClause += ` AND t.status = ?`;
        params.push(status);
    }
    if (startDate) {
        whereClause += ` AND t.transaction_date >= ?`;
        params.push(startDate);
    }
    if (endDate) {
        whereClause += ` AND t.transaction_date <= ?`;
        params.push(endDate);
    }
    // Get total count
    const countResult = db.exec(`SELECT COUNT(*) FROM transactions t WHERE ${whereClause}`, params);
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    // Get paginated data
    const offset = (page - 1) * pageSize;
    const query = `
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
    WHERE ${whereClause}
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `;
    const result = db.exec(query, [...params, pageSize, offset]);
    const data = [];
    if (result.length > 0) {
        for (const row of result[0].values) {
            const obj = {};
            result[0].columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            data.push(obj);
        }
    }
    return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
// Get status options
function getStatusOptions() {
    return [
        exports.TRANSACTION_STATUS.PENDING_APPROVAL_1,
        exports.TRANSACTION_STATUS.PENDING_APPROVAL_2,
        exports.TRANSACTION_STATUS.FULLY_APPROVED,
        exports.TRANSACTION_STATUS.REJECTED,
    ];
}
// Copy transaction (creates a new transaction with similar data but fresh approval flow)
function copyTransaction(id, createdBy) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Get original transaction
    const original = getTransactionById(id);
    if (!original) {
        return { success: false, message: 'Transaksi tidak ditemukan' };
    }
    // Create new transaction with same data
    return createTransaction({
        transaction_type: original.transaction_type,
        transaction_date: new Date().toISOString().split('T')[0],
        amount: original.amount,
        description: original.description,
        coa_id: original.coa_id,
        aspek_kerja_id: original.aspek_kerja_id,
        blok_id: original.blok_id,
        created_by: createdBy,
    });
}
// Validate COA exists
function validateCOA(coaId) {
    if (!coaId) {
        return { valid: true, message: 'OK' };
    }
    if (!db) {
        return { valid: false, message: 'Database not initialized' };
    }
    const result = db.exec('SELECT COUNT(*) FROM coa WHERE id = ?', [coaId]);
    if (result.length === 0 || result[0].values[0][0] === 0) {
        return { valid: false, message: 'COA tidak ditemukan' };
    }
    return { valid: true, message: 'OK' };
}
// Get available COA for dropdown (active only)
function getActiveCOA() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, kode, nama FROM coa 
    WHERE status_aktif = 1 
    ORDER BY kode
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        kode: row[1],
        nama: row[2],
    }));
}
// Get available Aspek Kerja for dropdown (active only)
function getActiveAspekKerja() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, kode, nama FROM aspek_kerja 
    WHERE status_aktif = 1 
    ORDER BY kode
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        kode: row[1],
        nama: row[2],
    }));
}
// Get available Blok for dropdown (active only)
function getActiveBlok() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT id, kode_blok, nama FROM blok 
    ORDER BY kode_blok
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => ({
        id: row[0],
        kode_blok: row[1],
        nama: row[2],
    }));
}
// Get all transaction numbers for duplicate check
function getAllTransactionNumbers() {
    if (!db)
        return [];
    const result = db.exec('SELECT transaction_number FROM transactions');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => row[0]);
}
// Get COA ID by kode
function getCOAIdByKode(kode) {
    if (!db)
        return null;
    const result = db.exec('SELECT id FROM coa WHERE kode = ?', [kode]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return result[0].values[0][0];
}
// Get Aspek Kerja ID by kode
function getAspekKerjaIdByKode(kode) {
    if (!db)
        return null;
    const result = db.exec('SELECT id FROM aspek_kerja WHERE kode = ?', [kode]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return result[0].values[0][0];
}
// Get Blok ID by kode
function getBlokIdByKode(kode) {
    if (!db)
        return null;
    const result = db.exec('SELECT id FROM blok WHERE kode_blok = ?', [kode]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return result[0].values[0][0];
}
// Get user ID by username or full name
function getUserIdByName(name) {
    if (!db)
        return null;
    const result = db.exec('SELECT id FROM users WHERE username = ? OR full_name = ?', [name, name]);
    if (result.length === 0 || result[0].values.length === 0)
        return null;
    return result[0].values[0][0];
}
function importKasBatch(data, createdBy) {
    if (!db) {
        return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
    }
    const errors = [];
    const existingNumbers = new Set(getAllTransactionNumbers());
    const imported = [];
    const now = new Date().toISOString();
    // Get creator user ID
    const creatorId = getUserIdByName(createdBy) || createdBy;
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        // Validate required fields
        if (!row.transaction_type || row.transaction_type.trim() === '') {
            errors.push({ row: rowNum, field: 'transaction_type', message: 'Jenis transaksi harus diisi (Kas Masuk/Kas Keluar)', value: row.transaction_type || '' });
            continue;
        }
        if (!row.transaction_date || row.transaction_date.trim() === '') {
            errors.push({ row: rowNum, field: 'transaction_date', message: 'Tanggal transaksi harus diisi', value: row.transaction_date || '' });
            continue;
        }
        if (!row.amount || (typeof row.amount === 'string' && row.amount.trim() === '')) {
            errors.push({ row: rowNum, field: 'amount', message: 'Jumlah harus diisi', value: String(row.amount ?? '') });
            continue;
        }
        // Validate transaction type
        const transactionType = row.transaction_type.trim();
        if (transactionType !== 'Kas Masuk' && transactionType !== 'Kas Keluar') {
            errors.push({ row: rowNum, field: 'transaction_type', message: 'Jenis transaksi harus "Kas Masuk" atau "Kas Keluar"', value: row.transaction_type });
            continue;
        }
        // Validate amount
        const amount = typeof row.amount === 'string' ? parseFloat(row.amount) : row.amount;
        if (isNaN(amount) || amount <= 0) {
            errors.push({ row: rowNum, field: 'amount', message: 'Jumlah harus berupa angka positif', value: String(row.amount) });
            continue;
        }
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(row.transaction_date.trim())) {
            errors.push({ row: rowNum, field: 'transaction_date', message: 'Format tanggal harus YYYY-MM-DD', value: row.transaction_date });
            continue;
        }
        // Look up related IDs
        const coaId = row.coa_kode ? getCOAIdByKode(row.coa_kode.trim()) : null;
        const aspekKerjaId = row.aspek_kerja_kode ? getAspekKerjaIdByKode(row.aspek_kerja_kode.trim()) : null;
        const blokId = row.blok_kode ? getBlokIdByKode(row.blok_kode.trim()) : null;
        // Generate a unique transaction number for this import
        const tempPrefix = transactionType === 'Kas Masuk' ? 'KAS-M' : 'KAS-K';
        const importPrefix = `${tempPrefix}-IMPORT`;
        // Find existing import numbers to avoid collision
        let sequence = 1;
        let newNumber = `${importPrefix}/${new Date().toISOString().split('T')[0]}/${String(sequence).padStart(4, '0')}`;
        while (existingNumbers.has(newNumber)) {
            sequence++;
            newNumber = `${importPrefix}/${new Date().toISOString().split('T')[0]}/${String(sequence).padStart(4, '0')}`;
        }
        existingNumbers.add(newNumber);
        const id = (0, uuid_1.v4)();
        db.run(`INSERT INTO transactions (
        id, transaction_number, transaction_date, transaction_type, amount, description,
        coa_id, aspek_kerja_id, blok_id, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            newNumber,
            row.transaction_date.trim(),
            transactionType,
            amount,
            row.description || '',
            coaId,
            aspekKerjaId,
            blokId,
            exports.TRANSACTION_STATUS.PENDING_APPROVAL_1,
            creatorId,
            now,
            now,
        ]);
        // Add approval history entry
        const historyId = (0, uuid_1.v4)();
        db.run(`INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [historyId, id, 'created', creatorId, createdBy, now, 'Transaksi diimpor dari Excel']);
        imported.push(newNumber);
    }
    saveDatabase();
    const message = errors.length > 0
        ? `Berhasil mengimport ${imported.length} transaksi. ${errors.length} baris gagal.`
        : `Berhasil mengimport ${imported.length} transaksi. Semua transaksi membutuhkan persetujuan dual approval.`;
    electron_log_1.default.info(`[KAS-DB] Import batch completed: ${imported.length} imported, ${errors.length} errors`);
    return {
        success: errors.length === 0,
        message,
        importedCount: imported.length,
        errors,
    };
}
// Close database
function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        electron_log_1.default.info('[KAS-DB] Database closed');
    }
}
