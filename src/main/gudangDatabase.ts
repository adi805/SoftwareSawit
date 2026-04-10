import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

let db: Database | null = null;

// Transaction statuses
export const TRANSACTION_STATUS = {
  PENDING_APPROVAL_1: 'Pending Approval 1',
  PENDING_APPROVAL_2: 'Pending Approval 2',
  FULLY_APPROVED: 'Fully Approved',
  REJECTED: 'Rejected',
} as const;

export type TransactionStatus = typeof TRANSACTION_STATUS[keyof typeof TRANSACTION_STATUS];

// Revision statuses
export const REVISION_STATUS = {
  PENDING_REVISION_APPROVAL_1: 'Pending Revision Approval 1',
  PENDING_REVISION_APPROVAL_2: 'Pending Revision Approval 2',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} as const;

export type RevisionStatus = typeof REVISION_STATUS[keyof typeof REVISION_STATUS];

// Transaction types
export const TRANSACTION_TYPES = {
  GUDANG_MASUK: 'Gudang Masuk',
  GUDANG_KELUAR: 'Gudang Keluar',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

// Gudang Transaction interface
export interface GudangTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: TransactionType;
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  status: TransactionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Approval fields
  approver_1_id: string | null;
  approver_1_name: string | null;
  approver_1_at: string | null;
  approver_2_id: string | null;
  approver_2_name: string | null;
  approver_2_at: string | null;
  // Rejection fields
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

// Transaction with related data
export interface GudangTransactionWithDetails extends GudangTransaction {
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

// Approval history entry
export interface ApprovalHistoryEntry {
  id: string;
  transaction_id: string;
  action: 'created' | 'approved_1' | 'approved_2' | 'rejected' | 'edited';
  user_id: string;
  user_name: string;
  action_at: string;
  notes: string | null;
}

// Transaction revision interface (Gudang-specific with item_name, item_unit)
export interface GudangTransactionRevision {
  id: string;
  transaction_id: string;
  module: 'gudang';
  // Original values (snapshot before revision)
  original_transaction_number: string;
  original_transaction_date: string;
  original_transaction_type: string;
  original_amount: number;
  original_description: string;
  original_coa_id: string | null;
  original_aspek_kerja_id: string | null;
  original_blok_id: string | null;
  original_item_name: string | null;
  original_item_unit: string | null;
  // Proposed values (changes requested)
  proposed_transaction_date: string | null;
  proposed_transaction_type: string | null;
  proposed_amount: number | null;
  proposed_description: string | null;
  proposed_coa_id: string | null;
  proposed_aspek_kerja_id: string | null;
  proposed_blok_id: string | null;
  proposed_item_name: string | null;
  proposed_item_unit: string | null;
  // Revision metadata
  revision_reason: string;
  requested_by: string;
  requested_at: string;
  // Status tracking
  status: RevisionStatus;
  // First approver
  revision_approver_1_id: string | null;
  revision_approver_1_name: string | null;
  revision_approver_1_at: string | null;
  // Second approver
  revision_approver_2_id: string | null;
  revision_approver_2_name: string | null;
  revision_approver_2_at: string | null;
  // Rejection
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  // Applied timestamp
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

let currentYear: number;
let currentMonth: number;
let DB_PATH: string;

function getDatabasePath(): string {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  const basePath = app.getPath('userData');
  return path.join(basePath, 'data', 'gudang', String(currentYear), String(currentMonth).padStart(2, '0') + '.db');
}

function ensureDataDirectory(): void {
  const dataDir = path.join(app.getPath('userData'), 'data', 'gudang', String(currentYear));
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log.info(`[GUDANG-DB] Created data directory: ${dataDir}`);
  }
}

// Initialize database
export async function initGudangDatabase(): Promise<void> {
  log.info('[GUDANG-DB] Initializing Gudang database...');

  try {
    const SQL = await initSqlJs();
    DB_PATH = getDatabasePath();
    
    ensureDataDirectory();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      log.info('[GUDANG-DB] Loaded existing database:', DB_PATH);
    } else {
      db = new SQL.Database();
      log.info('[GUDANG-DB] Created new database:', DB_PATH);
    }

    // Create tables
    createTables();

    // Migration: Add sync status columns if they don't exist (F012-BE)
    addSyncStatusColumns();

    // Save database
    saveDatabase();

    log.info('[GUDANG-DB] Gudang database initialized successfully');
  } catch (error) {
    log.error('[GUDANG-DB] Failed to initialize database:', error);
    throw error;
  }
}

function createTables(): void {
  if (!db) return;

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
      item_name TEXT,
      item_unit TEXT,
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

  // Transaction revisions table
  db.run(`
    CREATE TABLE IF NOT EXISTS transaction_revisions (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'gudang',
      -- Original values (snapshot before revision)
      original_transaction_number TEXT NOT NULL,
      original_transaction_date TEXT NOT NULL,
      original_transaction_type TEXT NOT NULL,
      original_amount REAL NOT NULL,
      original_description TEXT,
      original_coa_id TEXT,
      original_aspek_kerja_id TEXT,
      original_blok_id TEXT,
      original_item_name TEXT,
      original_item_unit TEXT,
      -- Proposed values (changes requested)
      proposed_transaction_date TEXT,
      proposed_transaction_type TEXT,
      proposed_amount REAL,
      proposed_description TEXT,
      proposed_coa_id TEXT,
      proposed_aspek_kerja_id TEXT,
      proposed_blok_id TEXT,
      proposed_item_name TEXT,
      proposed_item_unit TEXT,
      -- Revision metadata
      revision_reason TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      -- Status tracking
      status TEXT NOT NULL DEFAULT 'Pending Revision Approval 1',
      -- First approver
      revision_approver_1_id TEXT,
      revision_approver_1_name TEXT,
      revision_approver_1_at TEXT,
      -- Second approver
      revision_approver_2_id TEXT,
      revision_approver_2_name TEXT,
      revision_approver_2_at TEXT,
      -- Rejection
      rejected_by TEXT,
      rejected_by_name TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      -- Applied timestamp
      applied_at TEXT,
      -- Timestamps
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- Foreign key to transactions
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for transaction_revisions
  db.run(`CREATE INDEX IF NOT EXISTS idx_revision_transaction_id ON transaction_revisions(transaction_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_revision_status ON transaction_revisions(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_revision_requested_at ON transaction_revisions(requested_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_revision_requested_by ON transaction_revisions(requested_by)`);

  // Create index on transaction_number for faster lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_number ON transactions(transaction_number)`);

  // Create index on status for filtering
  db.run(`CREATE INDEX IF NOT EXISTS idx_status ON transactions(status)`);

  // Create index on transaction_date for filtering
  db.run(`CREATE INDEX IF NOT EXISTS idx_transaction_date ON transactions(transaction_date)`);

  // Create reference tables for JOINs (schema matches master databases)
  db.run(`CREATE TABLE IF NOT EXISTS coa (id TEXT PRIMARY KEY, kode TEXT, nama TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS aspek_kerja (id TEXT PRIMARY KEY, kode TEXT, nama TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS blok (id TEXT PRIMARY KEY, kode_blok TEXT, nama TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, full_name TEXT)`);

  log.info('[GUDANG-DB] Tables created');
}

function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Switch to a different period database
export function switchPeriod(year: number, month: number): { success: boolean; message: string } {
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
    const SQL = initSqlJs as unknown as initSqlJs.SqlJsStatic;
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      log.info('[GUDANG-DB] Switched to existing database:', DB_PATH);
    } else {
      db = new SQL.Database();
      createTables();
      saveDatabase();
      log.info('[GUDANG-DB] Switched to new database:', DB_PATH);
    }

    return { success: true, message: `Switched to ${year}/${String(month).padStart(2, '0')}` };
  } catch (error) {
    log.error('[GUDANG-DB] Failed to switch period:', error);
    return { success: false, message: 'Failed to switch period' };
  }
}

export function getCurrentPeriod(): { year: number; month: number } {
  return { year: currentYear, month: currentMonth };
}

// Generate next transaction number
function generateTransactionNumber(type: TransactionType): string {
  const prefix = type === TRANSACTION_TYPES.GUDANG_MASUK ? 'GUD-M' : 'GUD-K';
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  
  // Get the last transaction number for this date and type
  if (!db) return `${prefix}/${dateStr}/0001`;

  const result = db.exec(`
    SELECT transaction_number FROM transactions 
    WHERE transaction_number LIKE '${prefix}/${dateStr}%'
    ORDER BY transaction_number DESC
    LIMIT 1
  `);

  let sequence = 1;
  if (result.length > 0 && result[0].values.length > 0) {
    const lastNumber = result[0].values[0][0] as string;
    const parts = lastNumber.split('/');
    if (parts.length === 3) {
      sequence = parseInt(parts[2], 10) + 1;
    }
  }

  return `${prefix}/${dateStr}/${String(sequence).padStart(4, '0')}`;
}

// CRUD Operations

export function getAllTransactions(): GudangTransactionWithDetails[] {
  if (!db) return [];

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

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as GudangTransactionWithDetails;
  });
}

export function getTransactionById(id: string): GudangTransactionWithDetails | null {
  if (!db) return null;

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

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => {
    obj[col] = result[0].values[0][idx];
  });

  return obj as unknown as GudangTransactionWithDetails;
}

export interface CreateTransactionInput {
  transaction_type: TransactionType;
  transaction_date: string;
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  created_by: string;
}

export function createTransaction(input: CreateTransactionInput): { success: boolean; message: string; transaction?: GudangTransaction } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Validate amount
  if (typeof input.amount !== 'number' || input.amount <= 0) {
    return { success: false, message: 'Jumlah harus lebih dari 0' };
  }

  // Validate transaction type
  if (!Object.values(TRANSACTION_TYPES).includes(input.transaction_type)) {
    return { success: false, message: 'Jenis transaksi tidak valid' };
  }

  const id = uuidv4();
  const transactionNumber = generateTransactionNumber(input.transaction_type);
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO transactions (
      id, transaction_number, transaction_date, transaction_type, amount, description,
      coa_id, aspek_kerja_id, blok_id, item_name, item_unit, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      transactionNumber,
      input.transaction_date,
      input.transaction_type,
      input.amount,
      input.description,
      input.coa_id,
      input.aspek_kerja_id,
      input.blok_id,
      input.item_name,
      input.item_unit,
      TRANSACTION_STATUS.PENDING_APPROVAL_1,
      input.created_by,
      now,
      now,
    ]
  );

  // Add approval history entry
  const historyId = uuidv4();
  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [historyId, id, 'created', input.created_by, input.created_by, now, 'Transaksi dibuat']
  );

  saveDatabase();

  const transaction: GudangTransaction = {
    id,
    transaction_number: transactionNumber,
    transaction_date: input.transaction_date,
    transaction_type: input.transaction_type,
    amount: input.amount,
    description: input.description,
    coa_id: input.coa_id,
    aspek_kerja_id: input.aspek_kerja_id,
    blok_id: input.blok_id,
    item_name: input.item_name,
    item_unit: input.item_unit,
    status: TRANSACTION_STATUS.PENDING_APPROVAL_1,
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

  log.info(`[GUDANG-DB] Created transaction: ${transactionNumber}`);

  return { success: true, message: 'Transaksi berhasil ditambahkan', transaction };
}

export interface UpdateTransactionInput {
  transaction_date?: string;
  amount?: number;
  description?: string;
  coa_id?: string | null;
  aspek_kerja_id?: string | null;
  blok_id?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
}

export function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
  updatedBy: string
): { success: boolean; message: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Get current transaction
  const transaction = getTransactionById(id);
  if (!transaction) {
    return { success: false, message: 'Transaksi tidak ditemukan' };
  }

  // Can only edit pending transactions
  if (transaction.status !== TRANSACTION_STATUS.PENDING_APPROVAL_1) {
    return { success: false, message: 'Hanya transaksi dengan status "Pending Approval 1" yang dapat diedit' };
  }

  // Build update query
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

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
  if (input.item_name !== undefined) {
    updates.push('item_name = ?');
    params.push(input.item_name);
  }
  if (input.item_unit !== undefined) {
    updates.push('item_unit = ?');
    params.push(input.item_unit);
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
  const historyId = uuidv4();
  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [historyId, id, 'edited', updatedBy, updatedBy, now, 'Transaksi diedit']
  );

  saveDatabase();

  log.info(`[GUDANG-DB] Updated transaction ID: ${id}`);

  return { success: true, message: 'Transaksi berhasil diupdate' };
}

export function deleteTransaction(id: string): { success: boolean; message: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Get current transaction
  const transaction = getTransactionById(id);
  if (!transaction) {
    return { success: false, message: 'Transaksi tidak ditemukan' };
  }

  // Can only delete pending transactions
  if (transaction.status !== TRANSACTION_STATUS.PENDING_APPROVAL_1) {
    return { success: false, message: 'Hanya transaksi dengan status "Pending Approval 1" yang dapat dihapus' };
  }

  // Delete approval history first
  db.run(`DELETE FROM approval_history WHERE transaction_id = ?`, [id]);
  
  // Delete transaction
  db.run(`DELETE FROM transactions WHERE id = ?`, [id]);
  saveDatabase();

  log.info(`[GUDANG-DB] Deleted transaction ID: ${id}`);

  return { success: true, message: 'Transaksi berhasil dihapus' };
}

export function clearAllGudang(): { success: boolean; message: string; deletedCount: number } {
  if (!db) {
    return { success: false, message: 'Database not initialized', deletedCount: 0 };
  }

  const countResult = db.exec('SELECT COUNT(*) as count FROM transactions');
  const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] as number : 0;

  if (count === 0) {
    return { success: true, message: 'Tidak ada data Gudang untuk dihapus', deletedCount: 0 };
  }

  db.run('DELETE FROM approval_history');
  db.run('DELETE FROM transactions');
  saveDatabase();

  log.info(`[GUDANG-DB] Cleared all Gudang data. Deleted ${count} transactions.`);

  return { success: true, message: `Berhasil menghapus ${count} data Gudang`, deletedCount: count };
}

// Approval operations

export interface ApproveInput {
  approver_id: string;
  approver_name: string;
}

export function approveTransaction(
  id: string,
  input: ApproveInput
): { success: boolean; message: string } {
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
  if (transaction.status === TRANSACTION_STATUS.PENDING_APPROVAL_1) {
    // First approval
    // Check if approver is different from creator
    if (transaction.created_by === input.approver_id) {
      return { success: false, message: 'Tidak dapat menyetujui transaksi sendiri' };
    }

    db.run(
      `UPDATE transactions SET 
        status = ?, 
        approver_1_id = ?, 
        approver_1_name = ?, 
        approver_1_at = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        TRANSACTION_STATUS.PENDING_APPROVAL_2,
        input.approver_id,
        input.approver_name,
        now,
        now,
        id,
      ]
    );

    // Add history entry
    db.run(
      `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, 'approved_1', input.approver_id, input.approver_name, now, 'Approval tahap 1']
    );

  } else if (transaction.status === TRANSACTION_STATUS.PENDING_APPROVAL_2) {
    // Second approval
    // Check if approver is different from creator
    if (transaction.created_by === input.approver_id) {
      return { success: false, message: 'Tidak dapat menyetujui transaksi sendiri' };
    }

    // Check if approver 2 is different from approver 1
    if (transaction.approver_1_id === input.approver_id) {
      return { success: false, message: 'Approver tahap 2 harus berbeda dari approver tahap 1' };
    }

    db.run(
      `UPDATE transactions SET 
        status = ?, 
        approver_2_id = ?, 
        approver_2_name = ?, 
        approver_2_at = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        TRANSACTION_STATUS.FULLY_APPROVED,
        input.approver_id,
        input.approver_name,
        now,
        now,
        id,
      ]
    );

    // Add history entry
    db.run(
      `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, 'approved_2', input.approver_id, input.approver_name, now, 'Approval tahap 2 - Fully Approved']
    );

  } else {
    return { success: false, message: `Transaksi dengan status "${transaction.status}" tidak dapat disetujui` };
  }

  saveDatabase();

  log.info(`[GUDANG-DB] Approved transaction ID: ${id}, new status: ${transaction.status === TRANSACTION_STATUS.PENDING_APPROVAL_1 ? TRANSACTION_STATUS.PENDING_APPROVAL_2 : TRANSACTION_STATUS.FULLY_APPROVED}`);

  return { success: true, message: 'Transaksi berhasil disetujui' };
}

export interface RejectInput {
  rejected_by_id: string;
  rejected_by_name: string;
  reason: string;
}

export function rejectTransaction(
  id: string,
  input: RejectInput
): { success: boolean; message: string } {
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
  if (transaction.status !== TRANSACTION_STATUS.PENDING_APPROVAL_1 && 
      transaction.status !== TRANSACTION_STATUS.PENDING_APPROVAL_2) {
    return { success: false, message: `Transaksi dengan status "${transaction.status}" tidak dapat ditolak` };
  }

  const now = new Date().toISOString();

  db.run(
    `UPDATE transactions SET 
      status = ?, 
      rejected_by = ?, 
      rejected_by_name = ?, 
      rejected_at = ?,
      rejection_reason = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      TRANSACTION_STATUS.REJECTED,
      input.rejected_by_id,
      input.rejected_by_name,
      now,
      input.reason.trim(),
      now,
      id,
    ]
  );

  // Add history entry
  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), id, 'rejected', input.rejected_by_id, input.rejected_by_name, now, `Ditolak: ${input.reason.trim()}`]
  );

  saveDatabase();

  log.info(`[GUDANG-DB] Rejected transaction ID: ${id}`);

  return { success: true, message: 'Transaksi berhasil ditolak' };
}

// Get approval history for a transaction
export function getApprovalHistory(transactionId: string): ApprovalHistoryEntry[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT * FROM approval_history 
    WHERE transaction_id = ?
    ORDER BY action_at ASC
  `, [transactionId]);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as ApprovalHistoryEntry;
  });
}

// Get approvers list (users with Approver role)
export function getApprovers(): Array<{ id: string; full_name: string }> {
  if (!db) return [];

  // Import user database functions inline to avoid circular dependency
  // In a real app, you'd have a proper shared module
  try {
    const userDbPath = path.join(app.getPath('userData'), 'data', 'users.db');
    if (!fs.existsSync(userDbPath)) return [];

    const SQL = initSqlJs as unknown as initSqlJs.SqlJsStatic;
    const buffer = fs.readFileSync(userDbPath);
    const userDb = new SQL.Database(buffer);

    const result = userDb.exec(`
      SELECT id, full_name FROM users 
      WHERE role = 'Approver' AND status = 'active'
      ORDER BY full_name
    `);

    userDb.close();

    if (result.length === 0) return [];

    return result[0].values.map((row) => ({
      id: row[0] as string,
      full_name: row[1] as string,
    }));
  } catch (error) {
    log.error('[GUDANG-DB] Failed to get approvers:', error);
    return [];
  }
}

// Check if approver setup is complete (at least 2 approvers)
export function checkApproverSetup(): { complete: boolean; approverCount: number; message: string } {
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

// Stock calculation (only fully approved transactions)
// Gudang Masuk adds to stock, Gudang Keluar reduces from stock
export function getGudangStock(): { gudangMasuk: number; gudangKeluar: number; stock: number } {
  if (!db) {
    return { gudangMasuk: 0, gudangKeluar: 0, stock: 0 };
  }

  // Sum fully approved Gudang Masuk
  const masukResult = db.exec(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM transactions 
    WHERE transaction_type = 'Gudang Masuk' AND status = 'Fully Approved'
  `);
  const gudangMasuk = masukResult.length > 0 ? (masukResult[0].values[0][0] as number) : 0;

  // Sum fully approved Gudang Keluar
  const keluarResult = db.exec(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM transactions 
    WHERE transaction_type = 'Gudang Keluar' AND status = 'Fully Approved'
  `);
  const gudangKeluar = keluarResult.length > 0 ? (keluarResult[0].values[0][0] as number) : 0;

  return {
    gudangMasuk,
    gudangKeluar,
    stock: gudangMasuk - gudangKeluar,
  };
}

// Search and Filter

export function searchTransactions(
  searchTerm?: string,
  transactionType?: TransactionType | '',
  status?: TransactionStatus | '',
  startDate?: string,
  endDate?: string
): GudangTransactionWithDetails[] {
  if (!db) return [];

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

  const params: (string | number)[] = [];

  if (searchTerm) {
    query += ` AND (t.transaction_number LIKE ? OR t.description LIKE ? OR t.item_name LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term, term);
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

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as GudangTransactionWithDetails;
  });
}

export function getTransactionsWithPagination(
  page: number = 1,
  pageSize: number = 20,
  searchTerm?: string,
  transactionType?: TransactionType | '',
  status?: TransactionStatus | '',
  startDate?: string,
  endDate?: string,
  syncStatusFilter?: string
): { data: GudangTransactionWithDetails[]; total: number; page: number; pageSize: number; totalPages: number } {
  if (!db) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  let whereClause = '1=1';
  const params: (string | number)[] = [];

  if (searchTerm) {
    whereClause += ` AND (t.transaction_number LIKE ? OR t.description LIKE ? OR t.item_name LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term, term);
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

  if (syncStatusFilter) {
    whereClause += ` AND t.sync_status = ?`;
    params.push(syncStatusFilter);
  }

  // Get total count
  const countResult = db.exec(`SELECT COUNT(*) FROM transactions t WHERE ${whereClause}`, params);
  const total = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

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

  const data: GudangTransactionWithDetails[] = [];
  if (result.length > 0) {
    for (const row of result[0].values) {
      const obj: Record<string, unknown> = {};
      result[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      data.push(obj as unknown as GudangTransactionWithDetails);
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
export function getStatusOptions(): TransactionStatus[] {
  return [
    TRANSACTION_STATUS.PENDING_APPROVAL_1,
    TRANSACTION_STATUS.PENDING_APPROVAL_2,
    TRANSACTION_STATUS.FULLY_APPROVED,
    TRANSACTION_STATUS.REJECTED,
  ];
}

// Copy transaction (creates a new transaction with similar data but fresh approval flow)
export function copyTransaction(id: string, createdBy: string): { success: boolean; message: string; transaction?: GudangTransaction } {
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
    item_name: original.item_name,
    item_unit: original.item_unit,
    created_by: createdBy,
  });
}

// Validate COA exists
export function validateCOA(coaId: string | null): { valid: boolean; message: string } {
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
export function getActiveCOA(): Array<{ id: string; kode: string; nama: string }> {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, kode, nama FROM coa 
    WHERE status_aktif = 1 
    ORDER BY kode
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    id: row[0] as string,
    kode: row[1] as string,
    nama: row[2] as string,
  }));
}

// Get available Aspek Kerja for dropdown (active only)
export function getActiveAspekKerja(): Array<{ id: string; kode: string; nama: string }> {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, kode, nama FROM aspek_kerja 
    WHERE status_aktif = 1 
    ORDER BY kode
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    id: row[0] as string,
    kode: row[1] as string,
    nama: row[2] as string,
  }));
}

// Get available Blok for dropdown (active only)
export function getActiveBlok(): Array<{ id: string; kode_blok: string; nama: string }> {
  if (!db) return [];

  const result = db.exec(`
    SELECT id, kode_blok, nama FROM blok 
    ORDER BY kode_blok
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    id: row[0] as string,
    kode_blok: row[1] as string,
    nama: row[2] as string,
  }));
}

// ============ Import Functions ============
export interface GudangImportResult {
  success: boolean;
  message: string;
  importedCount: number;
  errors: Array<{ row: number; field: string; message: string; value: string }>;
}

// Get all transaction numbers for duplicate check
export function getAllTransactionNumbers(): string[] {
  if (!db) return [];
  const result = db.exec('SELECT transaction_number FROM transactions');
  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}

// Get COA ID by kode
function getCOAIdByKode(kode: string): string | null {
  if (!db) return null;
  const result = db.exec('SELECT id FROM coa WHERE kode = ?', [kode]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

// Get Aspek Kerja ID by kode
function getAspekKerjaIdByKode(kode: string): string | null {
  if (!db) return null;
  const result = db.exec('SELECT id FROM aspek_kerja WHERE kode = ?', [kode]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

// Get Blok ID by kode
function getBlokIdByKode(kode: string): string | null {
  if (!db) return null;
  const result = db.exec('SELECT id FROM blok WHERE kode_blok = ?', [kode]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

// Get user ID by username or full name
function getUserIdByName(name: string): string | null {
  if (!db) return null;
  const result = db.exec('SELECT id FROM users WHERE username = ? OR full_name = ?', [name, name]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0] as string;
}

export interface GudangImportRow {
  transaction_type?: string;
  transaction_date?: string;
  amount?: string | number;
  description?: string;
  coa_kode?: string;
  aspek_kerja_kode?: string;
  blok_kode?: string;
  item_name?: string;
  item_unit?: string;
  created_by_name?: string;
}

export function importGudangBatch(
  data: GudangImportRow[],
  createdBy: string
): GudangImportResult {
  if (!db) {
    return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
  }

  const errors: Array<{ row: number; field: string; message: string; value: string }> = [];
  const existingNumbers = new Set(getAllTransactionNumbers());
  const imported: string[] = [];
  const now = new Date().toISOString();

  // Get creator user ID
  const creatorId = getUserIdByName(createdBy) || createdBy;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2;

    // Validate required fields
    if (!row.transaction_type || row.transaction_type.trim() === '') {
      errors.push({ row: rowNum, field: 'transaction_type', message: 'Jenis transaksi harus diisi (Gudang Masuk/Gudang Keluar)', value: row.transaction_type || '' });
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
    if (transactionType !== 'Gudang Masuk' && transactionType !== 'Gudang Keluar') {
      errors.push({ row: rowNum, field: 'transaction_type', message: 'Jenis transaksi harus "Gudang Masuk" atau "Gudang Keluar"', value: row.transaction_type });
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
    const tempPrefix = transactionType === 'Gudang Masuk' ? 'GUD-M' : 'GUD-K';
    const importPrefix = `${tempPrefix}-IMPORT`;
    
    // Find existing import numbers to avoid collision
    let sequence = 1;
    let newNumber = `${importPrefix}/${new Date().toISOString().split('T')[0]}/${String(sequence).padStart(4, '0')}`;
    while (existingNumbers.has(newNumber)) {
      sequence++;
      newNumber = `${importPrefix}/${new Date().toISOString().split('T')[0]}/${String(sequence).padStart(4, '0')}`;
    }
    existingNumbers.add(newNumber);

    const id = uuidv4();
    db.run(
      `INSERT INTO transactions (
        id, transaction_number, transaction_date, transaction_type, amount, description,
        coa_id, aspek_kerja_id, blok_id, item_name, item_unit, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        newNumber,
        row.transaction_date.trim(),
        transactionType,
        amount,
        row.description || '',
        coaId,
        aspekKerjaId,
        blokId,
        row.item_name || null,
        row.item_unit || null,
        TRANSACTION_STATUS.PENDING_APPROVAL_1,
        creatorId,
        now,
        now,
      ]
    );

    // Add approval history entry
    const historyId = uuidv4();
    db.run(
      `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [historyId, id, 'created', creatorId, createdBy, now, 'Transaksi diimpor dari Excel']
    );

    imported.push(newNumber);
  }

  saveDatabase();

  const message = errors.length > 0
    ? `Berhasil mengimport ${imported.length} transaksi. ${errors.length} baris gagal.`
    : `Berhasil mengimport ${imported.length} transaksi. Semua transaksi membutuhkan persetujuan dual approval.`;

  log.info(`[GUDANG-DB] Import batch completed: ${imported.length} imported, ${errors.length} errors`);

  return {
    success: errors.length === 0,
    message,
    importedCount: imported.length,
    errors,
  };
}

// ============ Revision Workflow Functions ============

export interface CreateRevisionInput {
  revision_reason: string;
  proposed_transaction_date?: string;
  proposed_amount?: number;
  proposed_description?: string;
  proposed_coa_id?: string | null;
  proposed_aspek_kerja_id?: string | null;
  proposed_blok_id?: string | null;
  proposed_item_name?: string | null;
  proposed_item_unit?: string | null;
}

export interface ApproveRevisionInput {
  approver_id: string;
  approver_name: string;
}

export interface RejectRevisionInput {
  rejected_by_id: string;
  rejected_by_name: string;
  reason: string;
}

/**
 * Create a revision request for a fully approved transaction.
 */
export function createRevisionRequest(
  transactionId: string,
  requestedBy: string,
  input: CreateRevisionInput
): { success: boolean; message: string; revision?: GudangTransactionRevision } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  if (!input.revision_reason || input.revision_reason.trim() === '') {
    return { success: false, message: 'Alasan revisi harus diisi' };
  }

  const transaction = getTransactionById(transactionId);
  if (!transaction) {
    return { success: false, message: 'Transaksi tidak ditemukan' };
  }

  if (transaction.status !== TRANSACTION_STATUS.FULLY_APPROVED) {
    return { success: false, message: 'Hanya transaksi dengan status "Fully Approved" yang dapat direvisi' };
  }

  // Check for existing pending revision
  const pendingRevision = db.exec(`
    SELECT id FROM transaction_revisions 
    WHERE transaction_id = ? AND status IN ('Pending Revision Approval 1', 'Pending Revision Approval 2')
  `, [transactionId]);

  if (pendingRevision.length > 0 && pendingRevision[0].values.length > 0) {
    return { success: false, message: 'Revisi sudah pending untuk transaksi ini' };
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.run(`
    INSERT INTO transaction_revisions (
      id, transaction_id, module,
      original_transaction_number, original_transaction_date, original_transaction_type,
      original_amount, original_description, original_coa_id, original_aspek_kerja_id, original_blok_id, original_item_name, original_item_unit,
      proposed_transaction_date, proposed_amount, proposed_description,
      proposed_coa_id, proposed_aspek_kerja_id, proposed_blok_id, proposed_item_name, proposed_item_unit,
      revision_reason, requested_by, requested_at,
      status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, transactionId, 'gudang',
    transaction.transaction_number, transaction.transaction_date, transaction.transaction_type,
    transaction.amount, transaction.description, transaction.coa_id, transaction.aspek_kerja_id, transaction.blok_id, transaction.item_name, transaction.item_unit,
    input.proposed_transaction_date ?? null, input.proposed_amount ?? null, input.proposed_description ?? null,
    input.proposed_coa_id ?? null, input.proposed_aspek_kerja_id ?? null, input.proposed_blok_id ?? null, input.proposed_item_name ?? null, input.proposed_item_unit ?? null,
    input.revision_reason.trim(), requestedBy, now,
    REVISION_STATUS.PENDING_REVISION_APPROVAL_1,
    now, now,
  ]);

  const historyId = uuidv4();
  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [historyId, transactionId, 'revision_requested', requestedBy, requestedBy, now, `Pengajuan revisi: ${input.revision_reason.trim()}`]
  );

  saveDatabase();

  const revision: GudangTransactionRevision = {
    id, transaction_id: transactionId, module: 'gudang',
    original_transaction_number: transaction.transaction_number,
    original_transaction_date: transaction.transaction_date,
    original_transaction_type: transaction.transaction_type,
    original_amount: transaction.amount,
    original_description: transaction.description,
    original_coa_id: transaction.coa_id,
    original_aspek_kerja_id: transaction.aspek_kerja_id,
    original_blok_id: transaction.blok_id,
    original_item_name: transaction.item_name,
    original_item_unit: transaction.item_unit,
    proposed_transaction_date: input.proposed_transaction_date ?? null,
    proposed_amount: input.proposed_amount ?? null,
    proposed_description: input.proposed_description ?? null,
    proposed_coa_id: input.proposed_coa_id ?? null,
    proposed_aspek_kerja_id: input.proposed_aspek_kerja_id ?? null,
    proposed_blok_id: input.proposed_blok_id ?? null,
    proposed_item_name: input.proposed_item_name ?? null,
    proposed_item_unit: input.proposed_item_unit ?? null,
    proposed_transaction_type: null,
    revision_reason: input.revision_reason.trim(),
    requested_by: requestedBy, requested_at: now,
    status: REVISION_STATUS.PENDING_REVISION_APPROVAL_1,
    revision_approver_1_id: null, revision_approver_1_name: null, revision_approver_1_at: null,
    revision_approver_2_id: null, revision_approver_2_name: null, revision_approver_2_at: null,
    rejected_by: null, rejected_by_name: null, rejected_at: null, rejection_reason: null,
    applied_at: null, created_at: now, updated_at: now,
  };

  log.info(`[GUDANG-DB] Created revision request ID: ${id} for transaction: ${transaction.transaction_number}`);

  return { success: true, message: 'Pengajuan revisi berhasil', revision };
}

export function getPendingRevisions(
  module: 'kas' | 'bank' | 'gudang' = 'gudang',
  transactionId?: string
): GudangTransactionRevision[] {
  if (!db) return [];

  let query = `
    SELECT * FROM transaction_revisions 
    WHERE module = ? AND status IN ('Pending Revision Approval 1', 'Pending Revision Approval 2')
  `;
  const params: string[] = [module];

  if (transactionId) {
    query += ` AND transaction_id = ?`;
    params.push(transactionId);
  }

  query += ` ORDER BY requested_at DESC`;

  const result = db.exec(query, params);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => { obj[col] = row[idx]; });
    return obj as unknown as GudangTransactionRevision;
  });
}

export function getRevisionById(revisionId: string): GudangTransactionRevision | null {
  if (!db) return null;

  const result = db.exec(`SELECT * FROM transaction_revisions WHERE id = ?`, [revisionId]);

  if (result.length === 0 || result[0].values.length === 0) return null;

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => { obj[col] = result[0].values[0][idx]; });

  return obj as unknown as GudangTransactionRevision;
}

export function getRevisionsForTransaction(transactionId: string): GudangTransactionRevision[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT * FROM transaction_revisions WHERE transaction_id = ? ORDER BY requested_at DESC
  `, [transactionId]);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => { obj[col] = row[idx]; });
    return obj as unknown as GudangTransactionRevision;
  });
}

export function approveRevision(
  revisionId: string,
  input: ApproveRevisionInput
): { success: boolean; message: string } {
  if (!db) return { success: false, message: 'Database not initialized' };

  const revision = getRevisionById(revisionId);
  if (!revision) return { success: false, message: 'Revisi tidak ditemukan' };

  const transaction = getTransactionById(revision.transaction_id);
  if (!transaction) return { success: false, message: 'Transaksi tidak ditemukan' };

  if (revision.requested_by === input.approver_id) {
    return { success: false, message: 'Tidak dapat menyetujui revisi sendiri' };
  }

  const now = new Date().toISOString();

  if (revision.status === REVISION_STATUS.PENDING_REVISION_APPROVAL_1) {
    db.run(`
      UPDATE transaction_revisions SET 
        status = ?, revision_approver_1_id = ?, revision_approver_1_name = ?, revision_approver_1_at = ?, updated_at = ?
      WHERE id = ?
    `, [REVISION_STATUS.PENDING_REVISION_APPROVAL_2, input.approver_id, input.approver_name, now, now, revisionId]);

    db.run(
      `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), revision.transaction_id, 'revision_approved_1', input.approver_id, input.approver_name, now, 'Approval revisi tahap 1']
    );

  } else if (revision.status === REVISION_STATUS.PENDING_REVISION_APPROVAL_2) {
    if (revision.revision_approver_1_id === input.approver_id) {
      return { success: false, message: 'Approver tahap 2 harus berbeda dari approver tahap 1' };
    }

    db.run(`
      UPDATE transaction_revisions SET 
        status = ?, revision_approver_2_id = ?, revision_approver_2_name = ?, revision_approver_2_at = ?, applied_at = ?, updated_at = ?
      WHERE id = ?
    `, [REVISION_STATUS.APPROVED, input.approver_id, input.approver_name, now, now, now, revisionId]);

    // Apply revision to transaction
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (revision.proposed_transaction_date !== null) { updates.push('transaction_date = ?'); params.push(revision.proposed_transaction_date); }
    if (revision.proposed_amount !== null) { updates.push('amount = ?'); params.push(revision.proposed_amount); }
    if (revision.proposed_description !== null) { updates.push('description = ?'); params.push(revision.proposed_description); }
    if (revision.proposed_coa_id !== null) { updates.push('coa_id = ?'); params.push(revision.proposed_coa_id); }
    if (revision.proposed_aspek_kerja_id !== null) { updates.push('aspek_kerja_id = ?'); params.push(revision.proposed_aspek_kerja_id); }
    if (revision.proposed_blok_id !== null) { updates.push('blok_id = ?'); params.push(revision.proposed_blok_id); }
    if (revision.proposed_item_name !== null) { updates.push('item_name = ?'); params.push(revision.proposed_item_name); }
    if (revision.proposed_item_unit !== null) { updates.push('item_unit = ?'); params.push(revision.proposed_item_unit); }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now);
      params.push(revision.transaction_id);
      db.run(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    db.run(
      `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), revision.transaction_id, 'revision_approved_2', input.approver_id, input.approver_name, now, 'Approval revisi tahap 2 - Revisi diterapkan']
    );

  } else {
    return { success: false, message: `Revisi dengan status "${revision.status}" tidak dapat disetujui` };
  }

  saveDatabase();
  log.info(`[GUDANG-DB] Approved revision ID: ${revisionId}`);

  return { success: true, message: 'Revisi berhasil disetujui' };
}

export function rejectRevision(
  revisionId: string,
  input: RejectRevisionInput
): { success: boolean; message: string } {
  if (!db) return { success: false, message: 'Database not initialized' };

  if (!input.reason || input.reason.trim() === '') {
    return { success: false, message: 'Alasan penolakan harus diisi' };
  }

  const revision = getRevisionById(revisionId);
  if (!revision) return { success: false, message: 'Revisi tidak ditemukan' };

  if (revision.status !== REVISION_STATUS.PENDING_REVISION_APPROVAL_1 &&
      revision.status !== REVISION_STATUS.PENDING_REVISION_APPROVAL_2) {
    return { success: false, message: `Revisi dengan status "${revision.status}" tidak dapat ditolak` };
  }

  const now = new Date().toISOString();

  db.run(`
    UPDATE transaction_revisions SET 
      status = ?, rejected_by = ?, rejected_by_name = ?, rejected_at = ?, rejection_reason = ?, updated_at = ?
    WHERE id = ?
  `, [REVISION_STATUS.REJECTED, input.rejected_by_id, input.rejected_by_name, now, input.reason.trim(), now, revisionId]);

  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), revision.transaction_id, 'revision_rejected', input.rejected_by_id, input.rejected_by_name, now, `Revisi ditolak: ${input.reason.trim()}`]
  );

  saveDatabase();
  log.info(`[GUDANG-DB] Rejected revision ID: ${revisionId}`);

  return { success: true, message: 'Revisi berhasil ditolak' };
}

export function cancelRevision(
  revisionId: string,
  cancelledBy: string
): { success: boolean; message: string } {
  if (!db) return { success: false, message: 'Database not initialized' };

  const revision = getRevisionById(revisionId);
  if (!revision) return { success: false, message: 'Revisi tidak ditemukan' };

  if (revision.requested_by !== cancelledBy) {
    return { success: false, message: 'Hanya pengaju yang dapat membatalkan revisi' };
  }

  if (revision.status !== REVISION_STATUS.PENDING_REVISION_APPROVAL_1) {
    return { success: false, message: 'Hanya revisi dengan status "Pending Revision Approval 1" yang dapat dibatalkan' };
  }

  const now = new Date().toISOString();

  db.run(`
    UPDATE transaction_revisions SET status = ?, updated_at = ? WHERE id = ?
  `, [REVISION_STATUS.CANCELLED, now, revisionId]);

  db.run(
    `INSERT INTO approval_history (id, transaction_id, action, user_id, user_name, action_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), revision.transaction_id, 'revision_cancelled', cancelledBy, cancelledBy, now, 'Revisi dibatalkan oleh pengaju']
  );

  saveDatabase();
  log.info(`[GUDANG-DB] Cancelled revision ID: ${revisionId}`);

  return { success: true, message: 'Revisi berhasil dibatalkan' };
}

export function getRevisionStatusOptions(): RevisionStatus[] {
  return [
    REVISION_STATUS.PENDING_REVISION_APPROVAL_1,
    REVISION_STATUS.PENDING_REVISION_APPROVAL_2,
    REVISION_STATUS.APPROVED,
    REVISION_STATUS.REJECTED,
    REVISION_STATUS.CANCELLED,
  ];
}

// ============ Sync Status Tracking (F012-BE) ============

// Sync status types
export type TransactionSyncStatus = 'synced' | 'pending' | 'failed' | 'conflict' | 'in_progress';

// Transaction sync status interface
export interface TransactionSyncStatusRecord {
  id: string;
  module: 'gudang';
  recordId: string;
  syncStatus: TransactionSyncStatus;
  syncAttempts: number;
  lastSyncAt: string | null;
  syncError: string | null;
}

/**
 * Add sync status columns to transactions table
 * Called during migration to add new columns
 */
export function addSyncStatusColumns(): void {
  if (!db) return;

  // Check if sync_status column exists
  const checkResult = db.exec("PRAGMA table_info(transactions)");
  const hasSyncStatus = checkResult.length > 0 && checkResult[0].values.some(row => {
    const nameIndex = checkResult[0].columns.indexOf('name');
    return row[nameIndex] === 'sync_status';
  });

  if (!hasSyncStatus) {
    try {
      db.run('ALTER TABLE transactions ADD COLUMN sync_status TEXT DEFAULT "pending" CHECK(sync_status IN ("synced", "pending", "conflict", "failed", "in_progress"))');
      db.run('ALTER TABLE transactions ADD COLUMN sync_attempts INTEGER DEFAULT 0');
      db.run('ALTER TABLE transactions ADD COLUMN last_sync_at TEXT');
      db.run('ALTER TABLE transactions ADD COLUMN sync_error TEXT');
      saveDatabase();
      log.info('[GUDANG-DB] Added sync status columns to transactions table');
    } catch (error) {
      log.warn('[GUDANG-DB] Could not add sync status columns:', error);
    }
  }

  // Create index on sync_status for efficient queries
  try {
    db.run('CREATE INDEX IF NOT EXISTS idx_transactions_sync_status ON transactions(sync_status)');
    saveDatabase();
  } catch (error) {
    log.warn('[GUDANG-DB] Could not create sync_status index:', error);
  }
}

/**
 * Update sync status for a transaction
 */
export function updateSyncStatus(
  recordId: string,
  status: TransactionSyncStatus,
  errorMessage?: string
): { success: boolean; message: string; attempts?: number; lastSyncAt?: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  try {
    // Get current attempts count
    const currentResult = db.exec(
      'SELECT sync_attempts FROM transactions WHERE id = ?',
      [recordId]
    );
    const currentAttempts = currentResult.length > 0 && currentResult[0].values.length > 0
      ? (currentResult[0].values[0][0] as number) || 0
      : 0;

    const now = new Date().toISOString();
    let newAttempts = currentAttempts;

    if (status === 'pending') {
      // Reset attempts on pending (retry)
      newAttempts = 0;
    } else if (status === 'failed') {
      // Increment attempts on failure
      newAttempts = currentAttempts + 1;
    }

    db.run(
      `UPDATE transactions SET 
        sync_status = ?,
        sync_attempts = ?,
        last_sync_at = ?,
        sync_error = ?
      WHERE id = ?`,
      [status, newAttempts, now, errorMessage || null, recordId]
    );

    saveDatabase();
    log.info(`[GUDANG-DB] Updated sync status for ${recordId}: ${status} (attempts: ${newAttempts})`);

    return {
      success: true,
      message: 'Sync status updated',
      attempts: newAttempts,
      lastSyncAt: now,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[GUDANG-DB] Failed to update sync status for ${recordId}:`, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Get sync status for a transaction
 */
export function getSyncStatus(recordId: string): TransactionSyncStatusRecord | null {
  if (!db) return null;

  try {
    const result = db.exec(
      `SELECT id, sync_status, sync_attempts, last_sync_at, sync_error
       FROM transactions WHERE id = ?`,
      [recordId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      module: 'gudang',
      recordId: row[0] as string,
      syncStatus: (row[1] as TransactionSyncStatus) || 'pending',
      syncAttempts: (row[2] as number) || 0,
      lastSyncAt: row[3] as string | null,
      syncError: row[4] as string | null,
    };
  } catch (error) {
    log.error(`[GUDANG-DB] Failed to get sync status for ${recordId}:`, error);
    return null;
  }
}

/**
 * Get all transactions with their sync status
 */
export function getAllWithSyncStatus(): TransactionSyncStatusRecord[] {
  if (!db) return [];

  try {
    const result = db.exec(
      `SELECT id, sync_status, sync_attempts, last_sync_at, sync_error
       FROM transactions`
    );

    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      id: row[0] as string,
      module: 'gudang' as const,
      recordId: row[0] as string,
      syncStatus: (row[1] as TransactionSyncStatus) || 'pending',
      syncAttempts: (row[2] as number) || 0,
      lastSyncAt: row[3] as string | null,
      syncError: row[4] as string | null,
    }));
  } catch (error) {
    log.error('[GUDANG-DB] Failed to get all with sync status:', error);
    return [];
  }
}

/**
 * Reset sync status for retry
 */
export function resetSyncStatus(recordId: string): { success: boolean; message: string; attempts?: number; lastSyncAt?: string | null } {
  return updateSyncStatus(recordId, 'pending');
}

/**
 * Get transactions by sync status
 */
export function getBySyncStatus(status: TransactionSyncStatus): GudangTransactionWithDetails[] {
  if (!db) return [];

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
    WHERE t.sync_status = ?
    ORDER BY t.transaction_date DESC, t.created_at DESC
  `, [status]);

  if (result.length === 0) return [];

  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as GudangTransactionWithDetails;
  });
}

// Close database
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    log.info('[GUDANG-DB] Database closed');
  }
}
