import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';

let db: Database | null = null;
let sqlJsModule: initSqlJs.SqlJsStatic | null = null; // Store sql.js module for transaction DB access

export interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string; // Aktiva, Passiva, Modal, Pendapatan, Beban
  parent_id: string | null;
  status_aktif: number; // 1 = aktif, 0 = nonaktif
  created_at: string;
  updated_at: string;
}

export interface COAWithParent extends COA {
  parent_kode?: string;
  parent_nama?: string;
  aspek_kerja_count?: number;
}

const TIPE_OPTIONS = ['Aktiva', 'Passiva', 'Modal', 'Pendapatan', 'Beban'];
const DB_PATH = path.join(app.getPath('userData'), 'data', 'master', 'coa.db');

// Initialize database
export async function initCOADatabase(): Promise<void> {
  log.info('[COA-DB] Initializing COA database...');

  try {
    sqlJsModule = await initSqlJs();
    const SQL = sqlJsModule;

    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      log.info(`[COA-DB] Created data directory: ${dataDir}`);
    }

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      log.info('[COA-DB] Loaded existing database');
    } else {
      db = new SQL.Database();
      log.info('[COA-DB] Created new database');
    }

    // Create tables
    createTables();

    // Create sample COA data if empty
    const count = getCOACount();
    if (count === 0) {
      createSampleData();
    }

    // Save database
    saveDatabase();

    log.info('[COA-DB] COA database initialized successfully');
  } catch (error) {
    log.error('[COA-DB] Failed to initialize database:', error);
    throw error;
  }
}

function createTables(): void {
  if (!db) return;

  // COA table
  db.run(`
    CREATE TABLE IF NOT EXISTS coa (
      id TEXT PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      tipe TEXT NOT NULL,
      parent_id TEXT,
      status_aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES coa(id) ON DELETE SET NULL
    )
  `);

  // Aspek Kerja table (for cascade delete checking)
  db.run(`
    CREATE TABLE IF NOT EXISTS aspek_kerja (
      id TEXT PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      coa_id TEXT,
      jenis TEXT NOT NULL,
      status_aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE SET NULL
    )
  `);

  log.info('[COA-DB] Tables created');
}

function createSampleData(): void {
  if (!db) return;

  log.info('[COA-DB] Creating sample COA data...');

  const now = new Date().toISOString();

  // Sample hierarchical COA structure
  const sampleCOA = [
    // Aktiva
    { kode: '100', nama: 'AKTIVA LANCAR', tipe: 'Aktiva', parent: null },
    { kode: '110', nama: 'Kas', tipe: 'Aktiva', parent: '100' },
    { kode: '111', nama: 'Kas Besar', tipe: 'Aktiva', parent: '110' },
    { kode: '112', nama: 'Kas Kecil', tipe: 'Aktiva', parent: '110' },
    { kode: '120', nama: 'Bank', tipe: 'Aktiva', parent: '100' },
    { kode: '121', nama: 'Bank BCA', tipe: 'Aktiva', parent: '120' },
    { kode: '122', nama: 'Bank Mandiri', tipe: 'Aktiva', parent: '120' },
    { kode: '130', nama: 'Piutang', tipe: 'Aktiva', parent: '100' },
    { kode: '140', nama: 'Persediaan', tipe: 'Aktiva', parent: '100' },

    // Aktiva Tetap
    { kode: '150', nama: 'AKTIVA TETAP', tipe: 'Aktiva', parent: null },
    { kode: '151', nama: 'Tanah', tipe: 'Aktiva', parent: '150' },
    { kode: '152', nama: 'Bangunan', tipe: 'Aktiva', parent: '150' },
    { kode: '153', nama: 'Kendaraan', tipe: 'Aktiva', parent: '150' },
    { kode: '154', nama: 'Peralatan', tipe: 'Aktiva', parent: '150' },

    // Passiva (Hutang)
    { kode: '200', nama: 'KEWAJIBAN LANCAR', tipe: 'Passiva', parent: null },
    { kode: '210', nama: 'Hutang Usaha', tipe: 'Passiva', parent: '200' },
    { kode: '220', nama: 'Hutang Bank', tipe: 'Passiva', parent: '200' },

    // Modal
    { kode: '300', nama: 'MODAL', tipe: 'Modal', parent: null },
    { kode: '310', nama: 'Modal Saham', tipe: 'Modal', parent: '300' },
    { kode: '320', nama: 'Laba Ditahan', tipe: 'Modal', parent: '300' },

    // Pendapatan
    { kode: '400', nama: 'PENDAPATAN', tipe: 'Pendapatan', parent: null },
    { kode: '410', nama: 'Pendapatan K CPO', tipe: 'Pendapatan', parent: '400' },
    { kode: '420', nama: 'Pendapatan KERNEL', tipe: 'Pendapatan', parent: '400' },

    // Beban
    { kode: '500', nama: 'BEBAN OPERASIONAL', tipe: 'Beban', parent: null },
    { kode: '510', nama: 'Beban Gaji', tipe: 'Beban', parent: '500' },
    { kode: '520', nama: 'Beban Listrik', tipe: 'Beban', parent: '500' },
    { kode: '530', nama: 'Beban Transport', tipe: 'Beban', parent: '500' },
    { kode: '540', nama: 'Beban Perbaikan', tipe: 'Beban', parent: '500' },
  ];

  // First pass: create all COA records
  const idMap: Record<string, string> = {};

  for (const coa of sampleCOA) {
    const id = uuidv4();
    idMap[coa.kode] = id;

    db.run(
      `INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, coa.kode, coa.nama, coa.tipe, null, 1, now, now]
    );
  }

  // Second pass: update parent_id references
  for (const coa of sampleCOA) {
    if (coa.parent && idMap[coa.parent]) {
      db.run(
        `UPDATE coa SET parent_id = ? WHERE id = ?`,
        [idMap[coa.parent], idMap[coa.kode]]
      );
    }
  }

  // Create sample aspek kerja
  const aspekKerjaData = [
    { kode: 'AK-001', nama: 'Pengumpulan TBS', coa: '111' },
    { kode: 'AK-002', nama: 'Pengiriman CPO', coa: '121' },
    { kode: 'AK-003', nama: 'Gaji Karyawan', coa: '510' },
  ];

  for (const aspek of aspekKerjaData) {
    db.run(
      `INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), aspek.kode, aspek.nama, idMap[aspek.coa], 'Debit', 1, now, now]
    );
  }

  log.info(`[COA-DB] Created ${sampleCOA.length} sample COA and ${aspekKerjaData.length} aspek kerja`);
}

function getCOACount(): number {
  if (!db) return 0;
  const result = db.exec('SELECT COUNT(*) as count FROM coa');
  return result.length > 0 ? result[0].values[0][0] as number : 0;
}

function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// CRUD Operations

export function getAllCOA(): COAWithParent[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    ORDER BY c.kode
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as COAWithParent;
  });
}

export function getCOAById(id: string): COAWithParent | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    WHERE c.id = ?
  `, [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => {
    obj[col] = result[0].values[0][idx];
  });

  return obj as unknown as COAWithParent;
}

export function getCOAByKode(kode: string): COA | null {
  if (!db) return null;

  const result = db.exec('SELECT * FROM coa WHERE kode = ?', [kode]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => {
    obj[col] = result[0].values[0][idx];
  });

  return obj as unknown as COA;
}

export function createCOA(
  kode: string,
  nama: string,
  tipe: string,
  parentId: string | null,
  statusAktif: number = 1
): { success: boolean; message: string; coa?: COA } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Validate tipe
  if (!TIPE_OPTIONS.includes(tipe)) {
    return { success: false, message: 'Tipe tidak valid' };
  }

  // Check if kode already exists
  const existing = getCOAByKode(kode);
  if (existing) {
    return { success: false, message: 'Kode sudah ada' };
  }

  // Validate parent exists if provided
  if (parentId) {
    const parent = getCOAById(parentId);
    if (!parent) {
      return { success: false, message: 'Parent COA tidak ditemukan' };
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, kode, nama, tipe, parentId, statusAktif, now, now]
  );

  saveDatabase();

  const coa: COA = {
    id,
    kode,
    nama,
    tipe,
    parent_id: parentId,
    status_aktif: statusAktif,
    created_at: now,
    updated_at: now,
  };

  log.info(`[COA-DB] Created COA: ${kode} - ${nama}`);

  return { success: true, message: 'COA berhasil ditambahkan', coa };
}

export function updateCOA(
  id: string,
  nama: string,
  tipe: string,
  parentId: string | null,
  statusAktif: number
): { success: boolean; message: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Validate tipe
  if (!TIPE_OPTIONS.includes(tipe)) {
    return { success: false, message: 'Tipe tidak valid' };
  }

  // Validate parent exists if provided
  if (parentId) {
    // Prevent circular reference
    if (parentId === id) {
      return { success: false, message: 'COA tidak dapat menjadi parent dari dirinya sendiri' };
    }
    const parent = getCOAById(parentId);
    if (!parent) {
      return { success: false, message: 'Parent COA tidak ditemukan' };
    }
  }

  const now = new Date().toISOString();

  db.run(
    `UPDATE coa SET nama = ?, tipe = ?, parent_id = ?, status_aktif = ?, updated_at = ? WHERE id = ?`,
    [nama, tipe, parentId, statusAktif, now, id]
  );

  saveDatabase();

  log.info(`[COA-DB] Updated COA ID: ${id}`);

  return { success: true, message: 'COA berhasil diupdate' };
}

export interface TransactionReferenceResult {
  hasTransactions: boolean;
  kasCount: number;
  bankCount: number;
  gudangCount: number;
}

/**
 * Check if a COA is referenced in any transaction databases (Kas, Bank, Gudang)
 */
export function checkCOAInTransactions(coaId: string): TransactionReferenceResult {
  const result: TransactionReferenceResult = {
    hasTransactions: false,
    kasCount: 0,
    bankCount: 0,
    gudangCount: 0,
  };

  const userDataPath = app.getPath('userData');
  const modules = ['kas', 'bank', 'gudang'];

  for (const module of modules) {
    const moduleDir = path.join(userDataPath, 'data', module);
    
    // Check if module directory exists
    if (!fs.existsSync(moduleDir)) {
      continue;
    }

    try {
      // Read all year directories
      const yearDirs = fs.readdirSync(moduleDir, { withFileTypes: true })
        .filter(dir => dir.isDirectory() && /^\d{4}$/.test(dir.name));

      for (const yearDir of yearDirs) {
        const yearPath = path.join(moduleDir, yearDir.name);
        
        // Read all month database files
        const dbFiles = fs.readdirSync(yearPath)
          .filter(file => /^(\d{2})\.db$/.test(file));

        for (const dbFile of dbFiles) {
          const dbPath = path.join(yearPath, dbFile);
          
          try {
            // Open the transaction database
            if (!sqlJsModule) {
              log.warn(`[COA-DB] sql.js not initialized, skipping transaction check`);
              continue;
            }
            const fileBuffer = fs.readFileSync(dbPath);
            const txDb = new sqlJsModule.Database(fileBuffer);

            // Check if transactions table exists and has coa_id column
            const tableCheck = txDb.exec(`
              SELECT COUNT(*) as count FROM sqlite_master 
              WHERE type='table' AND name='transactions'
            `);

            if (tableCheck.length === 0 || tableCheck[0].values[0][0] === 0) {
              txDb.close();
              continue;
            }

            // Check if coa_id column exists
            const columnCheck = txDb.exec(`
              SELECT COUNT(*) FROM pragma_table_info('transactions') 
              WHERE name='coa_id'
            `);

            if (columnCheck.length === 0 || columnCheck[0].values[0][0] === 0) {
              txDb.close();
              continue;
            }

            // Query for references to this COA
            const refCheck = txDb.exec(
              `SELECT COUNT(*) FROM transactions WHERE coa_id = ?`,
              [coaId]
            );

            if (refCheck.length > 0) {
              const count = refCheck[0].values[0][0] as number;
              if (module === 'kas') {
                result.kasCount += count;
              } else if (module === 'bank') {
                result.bankCount += count;
              } else if (module === 'gudang') {
                result.gudangCount += count;
              }
            }

            txDb.close();
          } catch (err) {
            // Database might be corrupted or locked, skip it
            log.warn(`[COA-DB] Could not check ${module} database ${dbPath}: ${err}`);
          }
        }
      }
    } catch (err) {
      // Directory might not exist or be readable, skip it
      log.warn(`[COA-DB] Could not check ${module} directory: ${err}`);
    }
  }

  result.hasTransactions = result.kasCount > 0 || result.bankCount > 0 || result.gudangCount > 0;

  return result;
}

/**
 * Check if an Aspek Kerja is referenced in any transaction databases (Kas, Bank, Gudang)
 */
export function checkAspekKerjaInTransactions(aspekKerjaId: string): TransactionReferenceResult {
  const result: TransactionReferenceResult = {
    hasTransactions: false,
    kasCount: 0,
    bankCount: 0,
    gudangCount: 0,
  };

  const userDataPath = app.getPath('userData');
  const modules = ['kas', 'bank', 'gudang'];

  for (const module of modules) {
    const moduleDir = path.join(userDataPath, 'data', module);
    
    // Check if module directory exists
    if (!fs.existsSync(moduleDir)) {
      continue;
    }

    try {
      // Read all year directories
      const yearDirs = fs.readdirSync(moduleDir, { withFileTypes: true })
        .filter(dir => dir.isDirectory() && /^\d{4}$/.test(dir.name));

      for (const yearDir of yearDirs) {
        const yearPath = path.join(moduleDir, yearDir.name);
        
        // Read all month database files
        const dbFiles = fs.readdirSync(yearPath)
          .filter(file => /^(\d{2})\.db$/.test(file));

        for (const dbFile of dbFiles) {
          const dbPath = path.join(yearPath, dbFile);
          
          try {
            // Open the transaction database
            if (!sqlJsModule) {
              log.warn(`[COA-DB] sql.js not initialized, skipping transaction check`);
              continue;
            }
            const fileBuffer = fs.readFileSync(dbPath);
            const txDb = new sqlJsModule.Database(fileBuffer);

            // Check if transactions table exists and has aspek_kerja_id column
            const tableCheck = txDb.exec(`
              SELECT COUNT(*) as count FROM sqlite_master 
              WHERE type='table' AND name='transactions'
            `);

            if (tableCheck.length === 0 || tableCheck[0].values[0][0] === 0) {
              txDb.close();
              continue;
            }

            // Check if aspek_kerja_id column exists
            const columnCheck = txDb.exec(`
              SELECT COUNT(*) FROM pragma_table_info('transactions') 
              WHERE name='aspek_kerja_id'
            `);

            if (columnCheck.length === 0 || columnCheck[0].values[0][0] === 0) {
              txDb.close();
              continue;
            }

            // Query for references to this Aspek Kerja
            const refCheck = txDb.exec(
              `SELECT COUNT(*) FROM transactions WHERE aspek_kerja_id = ?`,
              [aspekKerjaId]
            );

            if (refCheck.length > 0) {
              const count = refCheck[0].values[0][0] as number;
              if (module === 'kas') {
                result.kasCount += count;
              } else if (module === 'bank') {
                result.bankCount += count;
              } else if (module === 'gudang') {
                result.gudangCount += count;
              }
            }

            txDb.close();
          } catch (err) {
            // Database might be corrupted or locked, skip it
            log.warn(`[COA-DB] Could not check ${module} database ${dbPath}: ${err}`);
          }
        }
      }
    } catch (err) {
      // Directory might not exist or be readable, skip it
      log.warn(`[COA-DB] Could not check ${module} directory: ${err}`);
    }
  }

  result.hasTransactions = result.kasCount > 0 || result.bankCount > 0 || result.gudangCount > 0;

  return result;
}

export function deleteCOA(id: string): { success: boolean; message: string; aspekKerjaCount?: number; transactionRefs?: TransactionReferenceResult } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Check if COA has linked Aspek Kerja
  const aspekKerjaCount = getAspekKerjaCountByCOA(id);

  if (aspekKerjaCount > 0) {
    return {
      success: false,
      message: `COA ini memiliki ${aspekKerjaCount} Aspek Kerja yang terkait. Hapus terlebih dahulu atau gunakan cascade delete.`,
      aspekKerjaCount
    };
  }

  // Check if COA has children
  const childrenCount = getChildrenCount(id);
  if (childrenCount > 0) {
    return {
      success: false,
      message: `COA ini memiliki ${childrenCount} child COA. Hapus atau pindahkan child terlebih dahulu.`,
    };
  }

  // Check if COA is referenced in any transaction modules (Kas, Bank, Gudang)
  const transactionRefs = checkCOAInTransactions(id);
  if (transactionRefs.hasTransactions) {
    const moduleList = [];
    if (transactionRefs.kasCount > 0) moduleList.push(`Kas (${transactionRefs.kasCount})`);
    if (transactionRefs.bankCount > 0) moduleList.push(`Bank (${transactionRefs.bankCount})`);
    if (transactionRefs.gudangCount > 0) moduleList.push(`Gudang (${transactionRefs.gudangCount})`);
    
    return {
      success: false,
      message: `COA ini digunakan dalam transaksi ${moduleList.join(', ')}. Hapus atau pindahkan transaksi terlebih dahulu.`,
      transactionRefs
    };
  }

  db.run(`DELETE FROM coa WHERE id = ?`, [id]);
  saveDatabase();

  log.info(`[COA-DB] Deleted COA ID: ${id}`);

  return { success: true, message: 'COA berhasil dihapus' };
}

export function deleteCOAWithAspekKerja(id: string): { success: boolean; message: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Delete linked aspek kerja first
  db.run(`DELETE FROM aspek_kerja WHERE coa_id = ?`, [id]);

  // Delete children recursively
  deleteCOAChildren(id);

  // Delete the COA itself
  db.run(`DELETE FROM coa WHERE id = ?`, [id]);
  saveDatabase();

  log.info(`[COA-DB] Deleted COA ID: ${id} with cascade`);

  return { success: true, message: 'COA dan Aspek Kerja terkait berhasil dihapus' };
}

function deleteCOAChildren(parentId: string): void {
  if (!db) return;

  // Get children
  const children = db.exec(`SELECT id FROM coa WHERE parent_id = ?`, [parentId]);

  if (children.length === 0) return;

  for (const row of children[0].values) {
    const childId = row[0] as string;

    // Delete aspek kerja linked to child
    db.run(`DELETE FROM aspek_kerja WHERE coa_id = ?`, [childId]);

    // Recursively delete grandchildren
    deleteCOAChildren(childId);

    // Delete child
    db.run(`DELETE FROM coa WHERE id = ?`, [childId]);
  }
}

export function getAspekKerjaCountByCOA(coaId: string): number {
  if (!db) return 0;

  const result = db.exec(`SELECT COUNT(*) FROM aspek_kerja WHERE coa_id = ?`, [coaId]);

  if (result.length === 0) return 0;

  return result[0].values[0][0] as number;
}

export function getChildrenCount(parentId: string): number {
  if (!db) return 0;

  const result = db.exec(`SELECT COUNT(*) FROM coa WHERE parent_id = ?`, [parentId]);

  if (result.length === 0) return 0;

  return result[0].values[0][0] as number;
}

// Search and Filter

export function searchCOA(
  searchTerm: string,
  tipe?: string,
  statusAktif?: number
): COAWithParent[] {
  if (!db) return [];

  let query = `
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  if (searchTerm) {
    query += ` AND (c.kode LIKE ? OR c.nama LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term);
  }

  if (tipe) {
    query += ` AND c.tipe = ?`;
    params.push(tipe);
  }

  if (statusAktif !== undefined) {
    query += ` AND c.status_aktif = ?`;
    params.push(statusAktif);
  }

  query += ` ORDER BY c.kode`;

  const result = db.exec(query, params);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as COAWithParent;
  });
}

export function getCOAByParent(parentId: string | null): COA[] {
  if (!db) return [];

  let result;
  if (parentId === null) {
    result = db.exec(`SELECT * FROM coa WHERE parent_id IS NULL ORDER BY kode`);
  } else {
    result = db.exec(`SELECT * FROM coa WHERE parent_id = ? ORDER BY kode`, [parentId]);
  }

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as COA;
  });
}

export function getTipeOptions(): string[] {
  return TIPE_OPTIONS;
}

// For pagination
export function getCOAWithPagination(
  page: number = 1,
  pageSize: number = 20,
  searchTerm?: string,
  tipe?: string,
  statusAktif?: number
): { data: COAWithParent[]; total: number; page: number; pageSize: number; totalPages: number } {
  if (!db) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  let whereClause = '1=1';
  const params: (string | number)[] = [];

  if (searchTerm) {
    whereClause += ` AND (c.kode LIKE ? OR c.nama LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term);
  }

  if (tipe) {
    whereClause += ` AND c.tipe = ?`;
    params.push(tipe);
  }

  if (statusAktif !== undefined) {
    whereClause += ` AND c.status_aktif = ?`;
    params.push(statusAktif);
  }

  // Get total count
  const countResult = db.exec(`SELECT COUNT(*) FROM coa c WHERE ${whereClause}`, params);
  const total = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

  // Get paginated data
  const offset = (page - 1) * pageSize;
  const query = `
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    WHERE ${whereClause}
    ORDER BY c.kode
    LIMIT ? OFFSET ?
  `;

  const result = db.exec(query, [...params, pageSize, offset]);

  const data: COAWithParent[] = [];
  if (result.length > 0) {
    for (const row of result[0].values) {
      const obj: Record<string, unknown> = {};
      result[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      data.push(obj as unknown as COAWithParent);
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

// ============ Aspek Kerja CRUD ============

export interface AspekKerja {
  id: string;
  kode: string;
  nama: string;
  coa_id: string | null;
  jenis: string; // Debit, Kredit
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

export interface AspekKerjaWithCOA extends AspekKerja {
  coa_kode?: string;
  coa_nama?: string;
}

export const JENIS_OPTIONS = ['Debit', 'Kredit'];

export function getAllAspekKerja(): AspekKerjaWithCOA[] {
  if (!db) return [];

  const result = db.exec(`
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    ORDER BY ak.kode
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as AspekKerjaWithCOA;
  });
}

export function getAspekKerjaById(id: string): AspekKerjaWithCOA | null {
  if (!db) return null;

  const result = db.exec(`
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    WHERE ak.id = ?
  `, [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => {
    obj[col] = result[0].values[0][idx];
  });

  return obj as unknown as AspekKerjaWithCOA;
}

export function getAspekKerjaByKode(kode: string): AspekKerja | null {
  if (!db) return null;

  const result = db.exec('SELECT * FROM aspek_kerja WHERE kode = ?', [kode]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const obj: Record<string, unknown> = {};
  result[0].columns.forEach((col, idx) => {
    obj[col] = result[0].values[0][idx];
  });

  return obj as unknown as AspekKerja;
}

export function createAspekKerja(
  kode: string,
  nama: string,
  coaId: string | null,
  jenis: string,
  statusAktif: number = 1
): { success: boolean; message: string; aspekKerja?: AspekKerja } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Validate jenis
  if (!JENIS_OPTIONS.includes(jenis)) {
    return { success: false, message: 'Jenis tidak valid. Pilih Debit atau Kredit.' };
  }

  // Check if kode already exists
  const existing = getAspekKerjaByKode(kode);
  if (existing) {
    return { success: false, message: 'Kode sudah ada' };
  }

  // Validate COA exists if provided
  if (coaId) {
    const coa = getCOAById(coaId);
    if (!coa) {
      return { success: false, message: 'COA tidak ditemukan' };
    }
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, kode, nama, coaId, jenis, statusAktif, now, now]
  );

  saveDatabase();

  const aspekKerja: AspekKerja = {
    id,
    kode,
    nama,
    coa_id: coaId,
    jenis,
    status_aktif: statusAktif,
    created_at: now,
    updated_at: now,
  };

  log.info(`[COA-DB] Created Aspek Kerja: ${kode} - ${nama}`);

  return { success: true, message: 'Aspek Kerja berhasil ditambahkan', aspekKerja };
}

export function updateAspekKerja(
  id: string,
  nama: string,
  coaId: string | null,
  jenis: string,
  statusAktif: number
): { success: boolean; message: string } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Validate jenis
  if (!JENIS_OPTIONS.includes(jenis)) {
    return { success: false, message: 'Jenis tidak valid. Pilih Debit atau Kredit.' };
  }

  // Validate COA exists if provided
  if (coaId) {
    const coa = getCOAById(coaId);
    if (!coa) {
      return { success: false, message: 'COA tidak ditemukan' };
    }
  }

  const now = new Date().toISOString();

  db.run(
    `UPDATE aspek_kerja SET nama = ?, coa_id = ?, jenis = ?, status_aktif = ?, updated_at = ? WHERE id = ?`,
    [nama, coaId, jenis, statusAktif, now, id]
  );

  saveDatabase();

  log.info(`[COA-DB] Updated Aspek Kerja ID: ${id}`);

  return { success: true, message: 'Aspek Kerja berhasil diupdate' };
}

export function deleteAspekKerja(id: string): { success: boolean; message: string; transactionRefs?: TransactionReferenceResult } {
  if (!db) {
    return { success: false, message: 'Database not initialized' };
  }

  // Check if Aspek Kerja is referenced in any transaction modules (Kas, Bank, Gudang)
  const transactionRefs = checkAspekKerjaInTransactions(id);
  if (transactionRefs.hasTransactions) {
    const moduleList = [];
    if (transactionRefs.kasCount > 0) moduleList.push(`Kas (${transactionRefs.kasCount})`);
    if (transactionRefs.bankCount > 0) moduleList.push(`Bank (${transactionRefs.bankCount})`);
    if (transactionRefs.gudangCount > 0) moduleList.push(`Gudang (${transactionRefs.gudangCount})`);
    
    return {
      success: false,
      message: `Aspek Kerja ini digunakan dalam transaksi ${moduleList.join(', ')}. Hapus atau pindahkan transaksi terlebih dahulu.`,
      transactionRefs
    };
  }

  db.run(`DELETE FROM aspek_kerja WHERE id = ?`, [id]);
  saveDatabase();

  log.info(`[COA-DB] Deleted Aspek Kerja ID: ${id}`);

  return { success: true, message: 'Aspek Kerja berhasil dihapus' };
}

export function clearAllCOA(): { success: boolean; message: string; deletedCount: number } {
  if (!db) {
    return { success: false, message: 'Database not initialized', deletedCount: 0 };
  }

  const countResult = db.exec('SELECT COUNT(*) as count FROM coa');
  const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] as number : 0;

  if (count === 0) {
    return { success: true, message: 'Tidak ada data COA untuk dihapus', deletedCount: 0 };
  }

  db.run('DELETE FROM aspek_kerja');
  db.run('DELETE FROM coa');
  saveDatabase();

  log.info(`[COA-DB] Cleared all COA data. Deleted ${count} records.`);

  return { success: true, message: `Berhasil menghapus ${count} data COA`, deletedCount: count };
}

export function clearAllAspekKerja(): { success: boolean; message: string; deletedCount: number } {
  if (!db) {
    return { success: false, message: 'Database not initialized', deletedCount: 0 };
  }

  const countResult = db.exec('SELECT COUNT(*) as count FROM aspek_kerja');
  const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] as number : 0;

  if (count === 0) {
    return { success: true, message: 'Tidak ada data Aspek Kerja untuk dihapus', deletedCount: 0 };
  }

  db.run('DELETE FROM aspek_kerja');
  saveDatabase();

  log.info(`[COA-DB] Cleared all Aspek Kerja data. Deleted ${count} records.`);

  return { success: true, message: `Berhasil menghapus ${count} data Aspek Kerja`, deletedCount: count };
}

export function searchAspekKerja(
  searchTerm?: string,
  jenis?: string,
  coaId?: string,
  statusAktif?: number
): AspekKerjaWithCOA[] {
  if (!db) return [];

  let query = `
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  if (searchTerm) {
    query += ` AND (ak.kode LIKE ? OR ak.nama LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term);
  }

  if (jenis) {
    query += ` AND ak.jenis = ?`;
    params.push(jenis);
  }

  if (coaId) {
    query += ` AND ak.coa_id = ?`;
    params.push(coaId);
  }

  if (statusAktif !== undefined) {
    query += ` AND ak.status_aktif = ?`;
    params.push(statusAktif);
  }

  query += ` ORDER BY ak.kode`;

  const result = db.exec(query, params);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as AspekKerjaWithCOA;
  });
}

export function getAspekKerjaWithPagination(
  page: number = 1,
  pageSize: number = 20,
  searchTerm?: string,
  jenis?: string,
  coaId?: string,
  statusAktif?: number
): { data: AspekKerjaWithCOA[]; total: number; page: number; pageSize: number; totalPages: number } {
  if (!db) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  let whereClause = '1=1';
  const params: (string | number)[] = [];

  if (searchTerm) {
    whereClause += ` AND (ak.kode LIKE ? OR ak.nama LIKE ?)`;
    const term = `%${searchTerm}%`;
    params.push(term, term);
  }

  if (jenis) {
    whereClause += ` AND ak.jenis = ?`;
    params.push(jenis);
  }

  if (coaId) {
    whereClause += ` AND ak.coa_id = ?`;
    params.push(coaId);
  }

  if (statusAktif !== undefined) {
    whereClause += ` AND ak.status_aktif = ?`;
    params.push(statusAktif);
  }

  // Get total count
  const countResult = db.exec(`SELECT COUNT(*) FROM aspek_kerja ak WHERE ${whereClause}`, params);
  const total = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

  // Get paginated data
  const offset = (page - 1) * pageSize;
  const query = `
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    WHERE ${whereClause}
    ORDER BY ak.kode
    LIMIT ? OFFSET ?
  `;

  const result = db.exec(query, [...params, pageSize, offset]);

  const data: AspekKerjaWithCOA[] = [];
  if (result.length > 0) {
    for (const row of result[0].values) {
      const obj: Record<string, unknown> = {};
      result[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      data.push(obj as unknown as AspekKerjaWithCOA);
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

export function getActiveCOA(): COA[] {
  if (!db) return [];

  const result = db.exec(`SELECT * FROM coa WHERE status_aktif = 1 ORDER BY kode`);

  if (result.length === 0) return [];

  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    result[0].columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as unknown as COA;
  });
}

// ============ Import Functions ============

export interface ImportResult {
  success: boolean;
  message: string;
  importedCount: number;
  errors: Array<{ row: number; field: string; message: string; value: string }>;
}

export function getAllCOAKodes(): string[] {
  if (!db) return [];
  const result = db.exec('SELECT kode FROM coa');
  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}

export function importCOABatch(
  data: Array<{ kode: string; nama: string; tipe: string; parent_kode?: string; status_aktif?: number | string }>
): ImportResult {
  if (!db) {
    return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
  }

  const errors: Array<{ row: number; field: string; message: string; value: string }> = [];
  const existingKodes = new Set(getAllCOAKodes());
  const imported: string[] = [];
  const now = new Date().toISOString();

  // Build parent_id mapping from existing COA (kode -> parent_id)
  const parentIdMap: Record<string, string> = {};
  const allCOA = getAllCOA();
  for (const coa of allCOA) {
    if (coa.parent_id) {
      parentIdMap[coa.kode] = coa.parent_id;
    }
  }

  // Track kode -> id mapping for records inserted in this batch
  // This allows parent-child relationships within the same batch
  const batchKodeToId: Record<string, string> = {};

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2; // Excel row (1-indexed, accounting for header)

    // Validate required fields
    if (!row.kode || row.kode.trim() === '') {
      errors.push({ row: rowNum, field: 'kode', message: 'Kode harus diisi', value: row.kode || '' });
      continue;
    }

    if (!row.nama || row.nama.trim() === '') {
      errors.push({ row: rowNum, field: 'nama', message: 'Nama harus diisi', value: row.nama || '' });
      continue;
    }

    if (!row.tipe || !TIPE_OPTIONS.includes(row.tipe)) {
      errors.push({ row: rowNum, field: 'tipe', message: `Tipe tidak valid. Pilih: ${TIPE_OPTIONS.join(', ')}`, value: row.tipe || '' });
      continue;
    }

    // Check for duplicate kode
    if (existingKodes.has(row.kode.trim())) {
      errors.push({ row: rowNum, field: 'kode', message: 'Kode sudah ada', value: row.kode });
      continue;
    }

    // Get parent_id from parent_kode if provided
    // First check batch-inserted records, then existing records
    let parentId: string | null = null;
    if (row.parent_kode && row.parent_kode.trim() !== '') {
      const parentKode = row.parent_kode.trim();
      // Check if parent was inserted in this batch
      if (batchKodeToId[parentKode]) {
        parentId = batchKodeToId[parentKode];
      } else {
        // Check existing COA records
        parentId = parentIdMap[parentKode] || null;
      }
    }

    const id = uuidv4();
    const statusAktif = row.status_aktif !== undefined ? (row.status_aktif === 1 || row.status_aktif === '1' || row.status_aktif === 'Aktif' ? 1 : 0) : 1;

    db.run(
      `INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, row.kode.trim(), row.nama.trim(), row.tipe, parentId, statusAktif, now, now]
    );

    // Track this inserted record's kode -> id mapping
    batchKodeToId[row.kode.trim()] = id;
    existingKodes.add(row.kode.trim());
    imported.push(row.kode);
  }

  if (imported.length > 0) {
    saveDatabase();
  }

  log.info(`[COA-DB] Import batch: ${imported.length} succeeded, ${errors.length} failed`);

  return {
    success: errors.length === 0,
    message: errors.length === 0 
      ? `Berhasil mengimport ${imported.length} COA` 
      : `Mengimport ${imported.length} COA, ${errors.length} gagal`,
    importedCount: imported.length,
    errors,
  };
}

// Get all Aspek Kerja codes for duplicate checking
export function getAllAspekKerjaKodes(): string[] {
  if (!db) return [];
  const result = db.exec('SELECT kode FROM aspek_kerja');
  if (result.length === 0) return [];
  return result[0].values.map(row => row[0] as string);
}

export function importAspekKerjaBatch(
  data: Array<{ kode: string; nama: string; coa_kode?: string; jenis?: string; status_aktif?: number | string }>
): ImportResult {
  if (!db) {
    return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
  }

  const errors: Array<{ row: number; field: string; message: string; value: string }> = [];
  const existingKodes = new Set(getAllAspekKerjaKodes());
  const imported: string[] = [];
  const now = new Date().toISOString();

  // Build coa_id mapping from coa_kode
  const coaIdMap: Record<string, string> = {};
  const allCOA = getAllCOA();
  for (const coa of allCOA) {
    coaIdMap[coa.kode] = coa.id;
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2;

    if (!row.kode || row.kode.trim() === '') {
      errors.push({ row: rowNum, field: 'kode', message: 'Kode harus diisi', value: row.kode || '' });
      continue;
    }

    if (!row.nama || row.nama.trim() === '') {
      errors.push({ row: rowNum, field: 'nama', message: 'Nama harus diisi', value: row.nama || '' });
      continue;
    }

    if (existingKodes.has(row.kode.trim())) {
      errors.push({ row: rowNum, field: 'kode', message: 'Kode sudah ada', value: row.kode });
      continue;
    }

    let coaId: string | null = null;
    if (row.coa_kode && row.coa_kode.trim() !== '') {
      coaId = coaIdMap[row.coa_kode.trim()] || null;
    }

    let jenis = row.jenis;
    if (!jenis || !JENIS_OPTIONS.includes(jenis)) {
      jenis = 'Debit'; // default
    }

    const statusAktif = row.status_aktif !== undefined ? (row.status_aktif === 1 || row.status_aktif === '1' || row.status_aktif === 'Aktif' ? 1 : 0) : 1;

    const id = uuidv4();
    db.run(
      `INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, row.kode.trim(), row.nama.trim(), coaId, jenis, statusAktif, now, now]
    );

    existingKodes.add(row.kode.trim());
    imported.push(row.kode);
  }

  if (imported.length > 0) {
    saveDatabase();
  }

  log.info(`[COA-DB] Import Aspek Kerja batch: ${imported.length} succeeded, ${errors.length} failed`);

  return {
    success: errors.length === 0,
    message: errors.length === 0 
      ? `Berhasil mengimport ${imported.length} Aspek Kerja` 
      : `Mengimport ${imported.length} Aspek Kerja, ${errors.length} gagal`,
    importedCount: imported.length,
    errors,
  };
}
