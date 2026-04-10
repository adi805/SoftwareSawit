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
exports.JENIS_OPTIONS = void 0;
exports.initCOADatabase = initCOADatabase;
exports.getAllCOA = getAllCOA;
exports.getCOAById = getCOAById;
exports.getCOAByKode = getCOAByKode;
exports.createCOA = createCOA;
exports.updateCOA = updateCOA;
exports.checkCOAInTransactions = checkCOAInTransactions;
exports.checkAspekKerjaInTransactions = checkAspekKerjaInTransactions;
exports.deleteCOA = deleteCOA;
exports.deleteCOAWithAspekKerja = deleteCOAWithAspekKerja;
exports.getAspekKerjaCountByCOA = getAspekKerjaCountByCOA;
exports.getChildrenCount = getChildrenCount;
exports.searchCOA = searchCOA;
exports.getCOAByParent = getCOAByParent;
exports.getTipeOptions = getTipeOptions;
exports.getCOAWithPagination = getCOAWithPagination;
exports.getAllAspekKerja = getAllAspekKerja;
exports.getAspekKerjaById = getAspekKerjaById;
exports.getAspekKerjaByKode = getAspekKerjaByKode;
exports.createAspekKerja = createAspekKerja;
exports.updateAspekKerja = updateAspekKerja;
exports.deleteAspekKerja = deleteAspekKerja;
exports.clearAllCOA = clearAllCOA;
exports.clearAllAspekKerja = clearAllAspekKerja;
exports.searchAspekKerja = searchAspekKerja;
exports.getAspekKerjaWithPagination = getAspekKerjaWithPagination;
exports.getActiveCOA = getActiveCOA;
exports.getAllCOAKodes = getAllCOAKodes;
exports.importCOABatch = importCOABatch;
exports.getAllAspekKerjaKodes = getAllAspekKerjaKodes;
exports.importAspekKerjaBatch = importAspekKerjaBatch;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const uuid_1 = require("uuid");
let db = null;
let sqlJsModule = null; // Store sql.js module for transaction DB access
const TIPE_OPTIONS = ['Aktiva', 'Passiva', 'Modal', 'Pendapatan', 'Beban'];
const DB_PATH = path.join(electron_1.app.getPath('userData'), 'data', 'master', 'coa.db');
// Initialize database
async function initCOADatabase() {
    electron_log_1.default.info('[COA-DB] Initializing COA database...');
    try {
        sqlJsModule = await (0, sql_js_1.default)();
        const SQL = sqlJsModule;
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            electron_log_1.default.info(`[COA-DB] Created data directory: ${dataDir}`);
        }
        // Load existing database or create new one
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[COA-DB] Loaded existing database');
        }
        else {
            db = new SQL.Database();
            electron_log_1.default.info('[COA-DB] Created new database');
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
        electron_log_1.default.info('[COA-DB] COA database initialized successfully');
    }
    catch (error) {
        electron_log_1.default.error('[COA-DB] Failed to initialize database:', error);
        throw error;
    }
}
function createTables() {
    if (!db)
        return;
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
    electron_log_1.default.info('[COA-DB] Tables created');
}
function createSampleData() {
    if (!db)
        return;
    electron_log_1.default.info('[COA-DB] Creating sample COA data...');
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
    const idMap = {};
    for (const coa of sampleCOA) {
        const id = (0, uuid_1.v4)();
        idMap[coa.kode] = id;
        db.run(`INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, coa.kode, coa.nama, coa.tipe, null, 1, now, now]);
    }
    // Second pass: update parent_id references
    for (const coa of sampleCOA) {
        if (coa.parent && idMap[coa.parent]) {
            db.run(`UPDATE coa SET parent_id = ? WHERE id = ?`, [idMap[coa.parent], idMap[coa.kode]]);
        }
    }
    // Create sample aspek kerja
    const aspekKerjaData = [
        { kode: 'AK-001', nama: 'Pengumpulan TBS', coa: '111' },
        { kode: 'AK-002', nama: 'Pengiriman CPO', coa: '121' },
        { kode: 'AK-003', nama: 'Gaji Karyawan', coa: '510' },
    ];
    for (const aspek of aspekKerjaData) {
        db.run(`INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), aspek.kode, aspek.nama, idMap[aspek.coa], 'Debit', 1, now, now]);
    }
    electron_log_1.default.info(`[COA-DB] Created ${sampleCOA.length} sample COA and ${aspekKerjaData.length} aspek kerja`);
}
function getCOACount() {
    if (!db)
        return 0;
    const result = db.exec('SELECT COUNT(*) as count FROM coa');
    return result.length > 0 ? result[0].values[0][0] : 0;
}
function saveDatabase() {
    if (!db)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}
// CRUD Operations
function getAllCOA() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    ORDER BY c.kode
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
function getCOAById(id) {
    if (!db)
        return null;
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
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function getCOAByKode(kode) {
    if (!db)
        return null;
    const result = db.exec('SELECT * FROM coa WHERE kode = ?', [kode]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function createCOA(kode, nama, tipe, parentId, statusAktif = 1) {
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
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.run(`INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, kode, nama, tipe, parentId, statusAktif, now, now]);
    saveDatabase();
    const coa = {
        id,
        kode,
        nama,
        tipe,
        parent_id: parentId,
        status_aktif: statusAktif,
        created_at: now,
        updated_at: now,
    };
    electron_log_1.default.info(`[COA-DB] Created COA: ${kode} - ${nama}`);
    return { success: true, message: 'COA berhasil ditambahkan', coa };
}
function updateCOA(id, nama, tipe, parentId, statusAktif) {
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
    db.run(`UPDATE coa SET nama = ?, tipe = ?, parent_id = ?, status_aktif = ?, updated_at = ? WHERE id = ?`, [nama, tipe, parentId, statusAktif, now, id]);
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Updated COA ID: ${id}`);
    return { success: true, message: 'COA berhasil diupdate' };
}
/**
 * Check if a COA is referenced in any transaction databases (Kas, Bank, Gudang)
 */
function checkCOAInTransactions(coaId) {
    const result = {
        hasTransactions: false,
        kasCount: 0,
        bankCount: 0,
        gudangCount: 0,
    };
    const userDataPath = electron_1.app.getPath('userData');
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
                            electron_log_1.default.warn(`[COA-DB] sql.js not initialized, skipping transaction check`);
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
                        const refCheck = txDb.exec(`SELECT COUNT(*) FROM transactions WHERE coa_id = ?`, [coaId]);
                        if (refCheck.length > 0) {
                            const count = refCheck[0].values[0][0];
                            if (module === 'kas') {
                                result.kasCount += count;
                            }
                            else if (module === 'bank') {
                                result.bankCount += count;
                            }
                            else if (module === 'gudang') {
                                result.gudangCount += count;
                            }
                        }
                        txDb.close();
                    }
                    catch (err) {
                        // Database might be corrupted or locked, skip it
                        electron_log_1.default.warn(`[COA-DB] Could not check ${module} database ${dbPath}: ${err}`);
                    }
                }
            }
        }
        catch (err) {
            // Directory might not exist or be readable, skip it
            electron_log_1.default.warn(`[COA-DB] Could not check ${module} directory: ${err}`);
        }
    }
    result.hasTransactions = result.kasCount > 0 || result.bankCount > 0 || result.gudangCount > 0;
    return result;
}
/**
 * Check if an Aspek Kerja is referenced in any transaction databases (Kas, Bank, Gudang)
 */
function checkAspekKerjaInTransactions(aspekKerjaId) {
    const result = {
        hasTransactions: false,
        kasCount: 0,
        bankCount: 0,
        gudangCount: 0,
    };
    const userDataPath = electron_1.app.getPath('userData');
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
                            electron_log_1.default.warn(`[COA-DB] sql.js not initialized, skipping transaction check`);
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
                        const refCheck = txDb.exec(`SELECT COUNT(*) FROM transactions WHERE aspek_kerja_id = ?`, [aspekKerjaId]);
                        if (refCheck.length > 0) {
                            const count = refCheck[0].values[0][0];
                            if (module === 'kas') {
                                result.kasCount += count;
                            }
                            else if (module === 'bank') {
                                result.bankCount += count;
                            }
                            else if (module === 'gudang') {
                                result.gudangCount += count;
                            }
                        }
                        txDb.close();
                    }
                    catch (err) {
                        // Database might be corrupted or locked, skip it
                        electron_log_1.default.warn(`[COA-DB] Could not check ${module} database ${dbPath}: ${err}`);
                    }
                }
            }
        }
        catch (err) {
            // Directory might not exist or be readable, skip it
            electron_log_1.default.warn(`[COA-DB] Could not check ${module} directory: ${err}`);
        }
    }
    result.hasTransactions = result.kasCount > 0 || result.bankCount > 0 || result.gudangCount > 0;
    return result;
}
function deleteCOA(id) {
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
        if (transactionRefs.kasCount > 0)
            moduleList.push(`Kas (${transactionRefs.kasCount})`);
        if (transactionRefs.bankCount > 0)
            moduleList.push(`Bank (${transactionRefs.bankCount})`);
        if (transactionRefs.gudangCount > 0)
            moduleList.push(`Gudang (${transactionRefs.gudangCount})`);
        return {
            success: false,
            message: `COA ini digunakan dalam transaksi ${moduleList.join(', ')}. Hapus atau pindahkan transaksi terlebih dahulu.`,
            transactionRefs
        };
    }
    db.run(`DELETE FROM coa WHERE id = ?`, [id]);
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Deleted COA ID: ${id}`);
    return { success: true, message: 'COA berhasil dihapus' };
}
function deleteCOAWithAspekKerja(id) {
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
    electron_log_1.default.info(`[COA-DB] Deleted COA ID: ${id} with cascade`);
    return { success: true, message: 'COA dan Aspek Kerja terkait berhasil dihapus' };
}
function deleteCOAChildren(parentId) {
    if (!db)
        return;
    // Get children
    const children = db.exec(`SELECT id FROM coa WHERE parent_id = ?`, [parentId]);
    if (children.length === 0)
        return;
    for (const row of children[0].values) {
        const childId = row[0];
        // Delete aspek kerja linked to child
        db.run(`DELETE FROM aspek_kerja WHERE coa_id = ?`, [childId]);
        // Recursively delete grandchildren
        deleteCOAChildren(childId);
        // Delete child
        db.run(`DELETE FROM coa WHERE id = ?`, [childId]);
    }
}
function getAspekKerjaCountByCOA(coaId) {
    if (!db)
        return 0;
    const result = db.exec(`SELECT COUNT(*) FROM aspek_kerja WHERE coa_id = ?`, [coaId]);
    if (result.length === 0)
        return 0;
    return result[0].values[0][0];
}
function getChildrenCount(parentId) {
    if (!db)
        return 0;
    const result = db.exec(`SELECT COUNT(*) FROM coa WHERE parent_id = ?`, [parentId]);
    if (result.length === 0)
        return 0;
    return result[0].values[0][0];
}
// Search and Filter
function searchCOA(searchTerm, tipe, statusAktif) {
    if (!db)
        return [];
    let query = `
    SELECT 
      c.*,
      p.kode as parent_kode,
      p.nama as parent_nama
    FROM coa c
    LEFT JOIN coa p ON c.parent_id = p.id
    WHERE 1=1
  `;
    const params = [];
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
function getCOAByParent(parentId) {
    if (!db)
        return [];
    let result;
    if (parentId === null) {
        result = db.exec(`SELECT * FROM coa WHERE parent_id IS NULL ORDER BY kode`);
    }
    else {
        result = db.exec(`SELECT * FROM coa WHERE parent_id = ? ORDER BY kode`, [parentId]);
    }
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
function getTipeOptions() {
    return TIPE_OPTIONS;
}
// For pagination
function getCOAWithPagination(page = 1, pageSize = 20, searchTerm, tipe, statusAktif) {
    if (!db) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    let whereClause = '1=1';
    const params = [];
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
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;
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
exports.JENIS_OPTIONS = ['Debit', 'Kredit'];
function getAllAspekKerja() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    ORDER BY ak.kode
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
function getAspekKerjaById(id) {
    if (!db)
        return null;
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
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function getAspekKerjaByKode(kode) {
    if (!db)
        return null;
    const result = db.exec('SELECT * FROM aspek_kerja WHERE kode = ?', [kode]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function createAspekKerja(kode, nama, coaId, jenis, statusAktif = 1) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate jenis
    if (!exports.JENIS_OPTIONS.includes(jenis)) {
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
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.run(`INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, kode, nama, coaId, jenis, statusAktif, now, now]);
    saveDatabase();
    const aspekKerja = {
        id,
        kode,
        nama,
        coa_id: coaId,
        jenis,
        status_aktif: statusAktif,
        created_at: now,
        updated_at: now,
    };
    electron_log_1.default.info(`[COA-DB] Created Aspek Kerja: ${kode} - ${nama}`);
    return { success: true, message: 'Aspek Kerja berhasil ditambahkan', aspekKerja };
}
function updateAspekKerja(id, nama, coaId, jenis, statusAktif) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate jenis
    if (!exports.JENIS_OPTIONS.includes(jenis)) {
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
    db.run(`UPDATE aspek_kerja SET nama = ?, coa_id = ?, jenis = ?, status_aktif = ?, updated_at = ? WHERE id = ?`, [nama, coaId, jenis, statusAktif, now, id]);
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Updated Aspek Kerja ID: ${id}`);
    return { success: true, message: 'Aspek Kerja berhasil diupdate' };
}
function deleteAspekKerja(id) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Check if Aspek Kerja is referenced in any transaction modules (Kas, Bank, Gudang)
    const transactionRefs = checkAspekKerjaInTransactions(id);
    if (transactionRefs.hasTransactions) {
        const moduleList = [];
        if (transactionRefs.kasCount > 0)
            moduleList.push(`Kas (${transactionRefs.kasCount})`);
        if (transactionRefs.bankCount > 0)
            moduleList.push(`Bank (${transactionRefs.bankCount})`);
        if (transactionRefs.gudangCount > 0)
            moduleList.push(`Gudang (${transactionRefs.gudangCount})`);
        return {
            success: false,
            message: `Aspek Kerja ini digunakan dalam transaksi ${moduleList.join(', ')}. Hapus atau pindahkan transaksi terlebih dahulu.`,
            transactionRefs
        };
    }
    db.run(`DELETE FROM aspek_kerja WHERE id = ?`, [id]);
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Deleted Aspek Kerja ID: ${id}`);
    return { success: true, message: 'Aspek Kerja berhasil dihapus' };
}
function clearAllCOA() {
    if (!db) {
        return { success: false, message: 'Database not initialized', deletedCount: 0 };
    }
    const countResult = db.exec('SELECT COUNT(*) as count FROM coa');
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada data COA untuk dihapus', deletedCount: 0 };
    }
    db.run('DELETE FROM aspek_kerja');
    db.run('DELETE FROM coa');
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Cleared all COA data. Deleted ${count} records.`);
    return { success: true, message: `Berhasil menghapus ${count} data COA`, deletedCount: count };
}
function clearAllAspekKerja() {
    if (!db) {
        return { success: false, message: 'Database not initialized', deletedCount: 0 };
    }
    const countResult = db.exec('SELECT COUNT(*) as count FROM aspek_kerja');
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada data Aspek Kerja untuk dihapus', deletedCount: 0 };
    }
    db.run('DELETE FROM aspek_kerja');
    saveDatabase();
    electron_log_1.default.info(`[COA-DB] Cleared all Aspek Kerja data. Deleted ${count} records.`);
    return { success: true, message: `Berhasil menghapus ${count} data Aspek Kerja`, deletedCount: count };
}
function searchAspekKerja(searchTerm, jenis, coaId, statusAktif) {
    if (!db)
        return [];
    let query = `
    SELECT 
      ak.*,
      c.kode as coa_kode,
      c.nama as coa_nama
    FROM aspek_kerja ak
    LEFT JOIN coa c ON ak.coa_id = c.id
    WHERE 1=1
  `;
    const params = [];
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
function getAspekKerjaWithPagination(page = 1, pageSize = 20, searchTerm, jenis, coaId, statusAktif) {
    if (!db) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    let whereClause = '1=1';
    const params = [];
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
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;
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
function getActiveCOA() {
    if (!db)
        return [];
    const result = db.exec(`SELECT * FROM coa WHERE status_aktif = 1 ORDER BY kode`);
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
function getAllCOAKodes() {
    if (!db)
        return [];
    const result = db.exec('SELECT kode FROM coa');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => row[0]);
}
function importCOABatch(data) {
    if (!db) {
        return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
    }
    const errors = [];
    const existingKodes = new Set(getAllCOAKodes());
    const imported = [];
    const now = new Date().toISOString();
    // Build parent_id mapping from existing COA (kode -> parent_id)
    const parentIdMap = {};
    const allCOA = getAllCOA();
    for (const coa of allCOA) {
        if (coa.parent_id) {
            parentIdMap[coa.kode] = coa.parent_id;
        }
    }
    // Track kode -> id mapping for records inserted in this batch
    // This allows parent-child relationships within the same batch
    const batchKodeToId = {};
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
        let parentId = null;
        if (row.parent_kode && row.parent_kode.trim() !== '') {
            const parentKode = row.parent_kode.trim();
            // Check if parent was inserted in this batch
            if (batchKodeToId[parentKode]) {
                parentId = batchKodeToId[parentKode];
            }
            else {
                // Check existing COA records
                parentId = parentIdMap[parentKode] || null;
            }
        }
        const id = (0, uuid_1.v4)();
        const statusAktif = row.status_aktif !== undefined ? (row.status_aktif === 1 || row.status_aktif === '1' || row.status_aktif === 'Aktif' ? 1 : 0) : 1;
        db.run(`INSERT INTO coa (id, kode, nama, tipe, parent_id, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, row.kode.trim(), row.nama.trim(), row.tipe, parentId, statusAktif, now, now]);
        // Track this inserted record's kode -> id mapping
        batchKodeToId[row.kode.trim()] = id;
        existingKodes.add(row.kode.trim());
        imported.push(row.kode);
    }
    if (imported.length > 0) {
        saveDatabase();
    }
    electron_log_1.default.info(`[COA-DB] Import batch: ${imported.length} succeeded, ${errors.length} failed`);
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
function getAllAspekKerjaKodes() {
    if (!db)
        return [];
    const result = db.exec('SELECT kode FROM aspek_kerja');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => row[0]);
}
function importAspekKerjaBatch(data) {
    if (!db) {
        return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
    }
    const errors = [];
    const existingKodes = new Set(getAllAspekKerjaKodes());
    const imported = [];
    const now = new Date().toISOString();
    // Build coa_id mapping from coa_kode
    const coaIdMap = {};
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
        let coaId = null;
        if (row.coa_kode && row.coa_kode.trim() !== '') {
            coaId = coaIdMap[row.coa_kode.trim()] || null;
        }
        let jenis = row.jenis;
        if (!jenis || !exports.JENIS_OPTIONS.includes(jenis)) {
            jenis = 'Debit'; // default
        }
        const statusAktif = row.status_aktif !== undefined ? (row.status_aktif === 1 || row.status_aktif === '1' || row.status_aktif === 'Aktif' ? 1 : 0) : 1;
        const id = (0, uuid_1.v4)();
        db.run(`INSERT INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, row.kode.trim(), row.nama.trim(), coaId, jenis, statusAktif, now, now]);
        existingKodes.add(row.kode.trim());
        imported.push(row.kode);
    }
    if (imported.length > 0) {
        saveDatabase();
    }
    electron_log_1.default.info(`[COA-DB] Import Aspek Kerja batch: ${imported.length} succeeded, ${errors.length} failed`);
    return {
        success: errors.length === 0,
        message: errors.length === 0
            ? `Berhasil mengimport ${imported.length} Aspek Kerja`
            : `Mengimport ${imported.length} Aspek Kerja, ${errors.length} gagal`,
        importedCount: imported.length,
        errors,
    };
}
