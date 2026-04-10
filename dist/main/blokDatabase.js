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
exports.initBlokDatabase = initBlokDatabase;
exports.getAllBlok = getAllBlok;
exports.getBlokById = getBlokById;
exports.getBlokByKode = getBlokByKode;
exports.createBlok = createBlok;
exports.updateBlok = updateBlok;
exports.deleteBlok = deleteBlok;
exports.clearAllBlok = clearAllBlok;
exports.checkBlokInTransactions = checkBlokInTransactions;
exports.searchBlok = searchBlok;
exports.getBlokWithPagination = getBlokWithPagination;
exports.getStatusOptions = getStatusOptions;
exports.getAvailableYears = getAvailableYears;
exports.getAllBlokKodes = getAllBlokKodes;
exports.importBlokBatch = importBlokBatch;
exports.parseORG1Data = parseORG1Data;
exports.mapORG1ToBlok = mapORG1ToBlok;
exports.compareORG1WithBlok = compareORG1WithBlok;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const uuid_1 = require("uuid");
let db = null;
let sqlJsModule = null; // Store sql.js module for transaction DB access
const STATUS_OPTIONS = ['TM', 'TBM-0', 'TBM-1', 'TBM-2', 'TBM-3'];
const DB_PATH = path.join(electron_1.app.getPath('userData'), 'data', 'master', 'blok.db');
// Initialize database
async function initBlokDatabase() {
    electron_log_1.default.info('[BLOK-DB] Initializing Blok database...');
    try {
        sqlJsModule = await (0, sql_js_1.default)();
        const SQL = sqlJsModule;
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            electron_log_1.default.info(`[BLOK-DB] Created data directory: ${dataDir}`);
        }
        // Load existing database or create new one
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[BLOK-DB] Loaded existing database');
        }
        else {
            db = new SQL.Database();
            electron_log_1.default.info('[BLOK-DB] Created new database');
        }
        // Create tables
        createTables();
        // Note: Sample data removed - user must import from Excel via "Import Excel" button
        // This ensures the database starts empty and only contains real data from aresta.xlsx
        // Save database
        saveDatabase();
        electron_log_1.default.info('[BLOK-DB] Blok database initialized successfully');
    }
    catch (error) {
        electron_log_1.default.error('[BLOK-DB] Failed to initialize database:', error);
        throw error;
    }
}
function createTables() {
    if (!db)
        return;
    // Blok table
    db.run(`
    CREATE TABLE IF NOT EXISTS blok (
      id TEXT PRIMARY KEY,
      kode_blok TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      tahun_tanam INTEGER NOT NULL,
      luas REAL NOT NULL,
      status TEXT DEFAULT 'TM',
      keterangan TEXT,
      pokok INTEGER,
      sph REAL,
      bulan_tanam TEXT,
      status_tanaman_2025 TEXT,
      status_tanaman_2026 TEXT,
      status_tanaman_2027 TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    electron_log_1.default.info('[BLOK-DB] Tables created');
}
function createSampleData() {
    if (!db)
        return;
    electron_log_1.default.info('[BLOK-DB] Creating sample Blok data...');
    const now = new Date().toISOString();
    // Sample Blok data with new status fields
    const sampleBlok = [
        { kode: 'BLK-001', nama: 'Blok A1', tahun: 2015, luas: 25.5, status: 'TM', keterangan: 'Kompleks A, sektor 1', pokok: 500, sph: 136, bulan: 'Januari 2013', status2025: 'TM', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-002', nama: 'Blok A2', tahun: 2015, luas: 23.8, status: 'TM', keterangan: 'Kompleks A, sektor 2', pokok: 480, sph: 136, bulan: 'Januari 2013', status2025: 'TM', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-003', nama: 'Blok B1', tahun: 2016, luas: 30.2, status: 'TM', keterangan: 'Kompleks B, sektor 1', pokok: 600, sph: 136, bulan: 'Februari 2014', status2025: 'TM', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-004', nama: 'Blok B2', tahun: 2016, luas: 28.5, status: 'TBM-3', keterangan: 'Sedang dalam pertumbuhan', pokok: 570, sph: 136, bulan: 'Februari 2014', status2025: 'TBM-3', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-005', nama: 'Blok C1', tahun: 2017, luas: 35.0, status: 'TM', keterangan: 'Kompleks C, sektor 1', pokok: 700, sph: 136, bulan: 'Maret 2015', status2025: 'TM', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-006', nama: 'Blok C2', tahun: 2017, luas: 32.3, status: 'TM', keterangan: 'Kompleks C, sektor 2', pokok: 650, sph: 136, bulan: 'Maret 2015', status2025: 'TM', status2026: 'TM', status2027: 'TM' },
        { kode: 'BLK-007', nama: 'Blok D1', tahun: 2023, luas: 40.0, status: 'TBM-2', keterangan: 'Kompleks D, sektor 1', pokok: 800, sph: 136, bulan: 'April 2023', status2025: 'TBM-2', status2026: 'TBM-3', status2027: 'TM' },
        { kode: 'BLK-008', nama: 'Blok D2', tahun: 2024, luas: 38.7, status: 'TBM-1', keterangan: 'Kompleks D, sektor 2', pokok: 774, sph: 136, bulan: 'April 2024', status2025: 'TBM-1', status2026: 'TBM-2', status2027: 'TBM-3' },
        { kode: 'BLK-009', nama: 'Blok E1', tahun: 2024, luas: 45.5, status: 'TBM-0', keterangan: 'Kompleks E, sektor 1', pokok: 910, sph: 136, bulan: 'September 2024', status2025: 'TBM-0', status2026: 'TBM-1', status2027: 'TBM-2' },
        { kode: 'BLK-010', nama: 'Blok E2', tahun: 2025, luas: 42.0, status: 'TBM-0', keterangan: 'Kompleks E, sektor 2', pokok: 840, sph: 136, bulan: 'Oktober 2025', status2025: 'TBM-0', status2026: 'TBM-0', status2027: 'TBM-1' },
        { kode: 'BLK-011', nama: 'Blok F1', tahun: 2025, luas: 50.0, status: 'TBM-0', keterangan: 'Kompleks F, sektor 1', pokok: 1000, sph: 136, bulan: 'November 2025', status2025: 'TBM-0', status2026: 'TBM-0', status2027: 'TBM-0' },
        { kode: 'BLK-012', nama: 'Blok F2', tahun: 2026, luas: 48.5, status: 'TBM-0', keterangan: 'Kompleks F, sektor 2', pokok: 970, sph: 136, bulan: 'Desember 2026', status2025: null, status2026: 'TBM-0', status2027: 'TBM-0' },
    ];
    for (const blok of sampleBlok) {
        db.run(`INSERT INTO blok (id, kode_blok, nama, tahun_tanam, luas, status, keterangan, pokok, sph, bulan_tanam, status_tanaman_2025, status_tanaman_2026, status_tanaman_2027, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), blok.kode, blok.nama, blok.tahun, blok.luas, blok.status, blok.keterangan, blok.pokok, blok.sph, blok.bulan, blok.status2025, blok.status2026, blok.status2027, now, now]);
    }
    electron_log_1.default.info(`[BLOK-DB] Created ${sampleBlok.length} sample Blok`);
}
function getBlokCount() {
    if (!db)
        return 0;
    const result = db.exec('SELECT COUNT(*) as count FROM blok');
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
function getAllBlok() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT * FROM blok ORDER BY kode_blok
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
function getBlokById(id) {
    if (!db)
        return null;
    const result = db.exec('SELECT * FROM blok WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function getBlokByKode(kodeBlok) {
    if (!db)
        return null;
    const result = db.exec('SELECT * FROM blok WHERE kode_blok = ?', [kodeBlok]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const obj = {};
    result[0].columns.forEach((col, idx) => {
        obj[col] = result[0].values[0][idx];
    });
    return obj;
}
function createBlok(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok = null, sph = null, bulanTanam = null, statusTanaman2025 = null, statusTanaman2026 = null, statusTanaman2027 = null) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate tahun tanam (1900 to current year + 1)
    const currentYear = new Date().getFullYear();
    if (tahunTanam < 1900 || tahunTanam > currentYear + 1) {
        return { success: false, message: `Tahun Tanam harus antara 1900 dan ${currentYear + 1}` };
    }
    // Validate luas (must be positive number)
    if (typeof luas !== 'number' || luas <= 0) {
        return { success: false, message: 'Luas harus berupa angka positif' };
    }
    // Validate status
    if (!STATUS_OPTIONS.includes(status)) {
        return { success: false, message: 'Status tidak valid' };
    }
    // Validate status_tanaman fields if provided
    if (statusTanaman2025 !== null && !STATUS_OPTIONS.includes(statusTanaman2025)) {
        return { success: false, message: 'Status Tanaman 2025 tidak valid' };
    }
    if (statusTanaman2026 !== null && !STATUS_OPTIONS.includes(statusTanaman2026)) {
        return { success: false, message: 'Status Tanaman 2026 tidak valid' };
    }
    if (statusTanaman2027 !== null && !STATUS_OPTIONS.includes(statusTanaman2027)) {
        return { success: false, message: 'Status Tanaman 2027 tidak valid' };
    }
    // Check if kode_blok already exists
    const existing = getBlokByKode(kodeBlok);
    if (existing) {
        return { success: false, message: 'Kode Blok sudah ada' };
    }
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.run(`INSERT INTO blok (id, kode_blok, nama, tahun_tanam, luas, status, keterangan, pokok, sph, bulan_tanam, status_tanaman_2025, status_tanaman_2026, status_tanaman_2027, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027, now, now]);
    saveDatabase();
    const blok = {
        id,
        kode_blok: kodeBlok,
        nama,
        tahun_tanam: tahunTanam,
        luas,
        status,
        keterangan,
        pokok,
        sph,
        bulan_tanam: bulanTanam,
        status_tanaman_2025: statusTanaman2025,
        status_tanaman_2026: statusTanaman2026,
        status_tanaman_2027: statusTanaman2027,
        created_at: now,
        updated_at: now,
    };
    electron_log_1.default.info(`[BLOK-DB] Created Blok: ${kodeBlok} - ${nama}`);
    return { success: true, message: 'Blok berhasil ditambahkan', blok };
}
function updateBlok(id, nama, tahunTanam, luas, status, keterangan, pokok = null, sph = null, bulanTanam = null, statusTanaman2025 = null, statusTanaman2026 = null, statusTanaman2027 = null) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate tahun tanam (1900 to current year + 1)
    const currentYear = new Date().getFullYear();
    if (tahunTanam < 1900 || tahunTanam > currentYear + 1) {
        return { success: false, message: `Tahun Tanam harus antara 1900 dan ${currentYear + 1}` };
    }
    // Validate luas (must be positive number)
    if (typeof luas !== 'number' || luas <= 0) {
        return { success: false, message: 'Luas harus berupa angka positif' };
    }
    // Validate status
    if (!STATUS_OPTIONS.includes(status)) {
        return { success: false, message: 'Status tidak valid' };
    }
    // Validate status_tanaman fields if provided
    if (statusTanaman2025 !== null && !STATUS_OPTIONS.includes(statusTanaman2025)) {
        return { success: false, message: 'Status Tanaman 2025 tidak valid' };
    }
    if (statusTanaman2026 !== null && !STATUS_OPTIONS.includes(statusTanaman2026)) {
        return { success: false, message: 'Status Tanaman 2026 tidak valid' };
    }
    if (statusTanaman2027 !== null && !STATUS_OPTIONS.includes(statusTanaman2027)) {
        return { success: false, message: 'Status Tanaman 2027 tidak valid' };
    }
    // Check if blok exists
    const existing = getBlokById(id);
    if (!existing) {
        return { success: false, message: 'Blok tidak ditemukan' };
    }
    const now = new Date().toISOString();
    db.run(`UPDATE blok SET nama = ?, tahun_tanam = ?, luas = ?, status = ?, keterangan = ?, pokok = ?, sph = ?, bulan_tanam = ?, status_tanaman_2025 = ?, status_tanaman_2026 = ?, status_tanaman_2027 = ?, updated_at = ? WHERE id = ?`, [nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027, now, id]);
    saveDatabase();
    electron_log_1.default.info(`[BLOK-DB] Updated Blok ID: ${id}`);
    return { success: true, message: 'Blok berhasil diupdate' };
}
function deleteBlok(id) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Check if blok exists
    const existing = getBlokById(id);
    if (!existing) {
        return { success: false, message: 'Blok tidak ditemukan' };
    }
    // Check if blok is referenced in any transaction modules (Kas, Bank, Gudang)
    const transactionRefs = checkBlokInTransactions(id);
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
            message: `Blok ini digunakan dalam transaksi ${moduleList.join(', ')}. Hapus atau pindahkan transaksi terlebih dahulu.`
        };
    }
    db.run(`DELETE FROM blok WHERE id = ?`, [id]);
    saveDatabase();
    electron_log_1.default.info(`[BLOK-DB] Deleted Blok ID: ${id}`);
    return { success: true, message: 'Blok berhasil dihapus' };
}
function clearAllBlok() {
    if (!db) {
        return { success: false, message: 'Database not initialized', deletedCount: 0 };
    }
    const countResult = db.exec('SELECT COUNT(*) as count FROM blok');
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada data Blok untuk dihapus', deletedCount: 0 };
    }
    db.run('DELETE FROM blok');
    saveDatabase();
    electron_log_1.default.info(`[BLOK-DB] Cleared all Blok data. Deleted ${count} records.`);
    return { success: true, message: `Berhasil menghapus ${count} data Blok`, deletedCount: count };
}
/**
 * Check if a blok is referenced in any transaction databases (Kas, Bank, Gudang)
 */
function checkBlokInTransactions(blokId) {
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
                            electron_log_1.default.warn(`[BLOK-DB] sql.js not initialized, skipping transaction check`);
                            continue;
                        }
                        const fileBuffer = fs.readFileSync(dbPath);
                        const txDb = new sqlJsModule.Database(fileBuffer);
                        // Check if transactions table exists and has blok_id column
                        const tableCheck = txDb.exec(`
              SELECT COUNT(*) as count FROM sqlite_master 
              WHERE type='table' AND name='transactions'
            `);
                        if (tableCheck.length === 0 || tableCheck[0].values[0][0] === 0) {
                            txDb.close();
                            continue;
                        }
                        // Check if blok_id column exists
                        const columnCheck = txDb.exec(`
              SELECT COUNT(*) FROM pragma_table_info('transactions') 
              WHERE name='blok_id'
            `);
                        if (columnCheck.length === 0 || columnCheck[0].values[0][0] === 0) {
                            txDb.close();
                            continue;
                        }
                        // Query for references to this blok
                        const refCheck = txDb.exec(`SELECT COUNT(*) FROM transactions WHERE blok_id = ?`, [blokId]);
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
                        electron_log_1.default.warn(`[BLOK-DB] Could not check ${module} database ${dbPath}: ${err}`);
                    }
                }
            }
        }
        catch (err) {
            // Directory might not exist or be readable, skip it
            electron_log_1.default.warn(`[BLOK-DB] Could not check ${module} directory: ${err}`);
        }
    }
    result.hasTransactions = result.kasCount > 0 || result.bankCount > 0 || result.gudangCount > 0;
    return result;
}
// Search and Filter
function searchBlok(searchTerm, tahunTanam, status) {
    if (!db)
        return [];
    let query = `SELECT * FROM blok WHERE 1=1`;
    const params = [];
    if (searchTerm) {
        query += ` AND (kode_blok LIKE ? OR nama LIKE ?)`;
        const term = `%${searchTerm}%`;
        params.push(term, term);
    }
    if (tahunTanam) {
        query += ` AND tahun_tanam = ?`;
        params.push(tahunTanam);
    }
    if (status) {
        query += ` AND status = ?`;
        params.push(status);
    }
    query += ` ORDER BY kode_blok`;
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
function getBlokWithPagination(page = 1, pageSize = 20, searchTerm, tahunTanam, status) {
    if (!db) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    let whereClause = '1=1';
    const params = [];
    if (searchTerm) {
        whereClause += ` AND (kode_blok LIKE ? OR nama LIKE ?)`;
        const term = `%${searchTerm}%`;
        params.push(term, term);
    }
    if (tahunTanam) {
        whereClause += ` AND tahun_tanam = ?`;
        params.push(tahunTanam);
    }
    if (status) {
        whereClause += ` AND status = ?`;
        params.push(status);
    }
    // Get total count
    const countResult = db.exec(`SELECT COUNT(*) FROM blok WHERE ${whereClause}`, params);
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;
    // Get paginated data
    const offset = (page - 1) * pageSize;
    const query = `
    SELECT * FROM blok
    WHERE ${whereClause}
    ORDER BY kode_blok
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
function getStatusOptions() {
    return STATUS_OPTIONS;
}
function getAvailableYears() {
    if (!db)
        return [];
    const result = db.exec(`SELECT DISTINCT tahun_tanam FROM blok ORDER BY tahun_tanam DESC`);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => row[0]);
}
function getAllBlokKodes() {
    if (!db)
        return [];
    const result = db.exec('SELECT kode_blok FROM blok');
    if (result.length === 0)
        return [];
    return result[0].values.map(row => row[0]);
}
function importBlokBatch(data) {
    if (!db) {
        return { success: false, message: 'Database not initialized', importedCount: 0, errors: [] };
    }
    const errors = [];
    const existingKodes = new Set(getAllBlokKodes());
    const imported = [];
    const now = new Date().toISOString();
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        // Validate required fields
        if (!row.kode_blok || row.kode_blok.trim() === '') {
            errors.push({ row: rowNum, field: 'kode_blok', message: 'Kode Blok harus diisi', value: row.kode_blok || '' });
            continue;
        }
        if (!row.nama || row.nama.trim() === '') {
            errors.push({ row: rowNum, field: 'nama', message: 'Nama harus diisi', value: row.nama || '' });
            continue;
        }
        if (existingKodes.has(row.kode_blok.trim())) {
            errors.push({ row: rowNum, field: 'kode_blok', message: 'Kode Blok sudah ada', value: row.kode_blok });
            continue;
        }
        // Validate tahun_tanam
        const tahunTanam = typeof row.tahun_tanam === 'string' ? parseInt(row.tahun_tanam, 10) : row.tahun_tanam;
        if (isNaN(tahunTanam) || tahunTanam < 1900 || tahunTanam > currentYear + 1) {
            errors.push({ row: rowNum, field: 'tahun_tanam', message: `Tahun Tanam harus antara 1900 dan ${currentYear + 1}`, value: String(row.tahun_tanam) });
            continue;
        }
        // Validate luas
        const luas = typeof row.luas === 'string' ? parseFloat(row.luas) : row.luas;
        if (isNaN(luas) || luas <= 0) {
            errors.push({ row: rowNum, field: 'luas', message: 'Luas harus berupa angka positif', value: String(row.luas) });
            continue;
        }
        // Validate pokok - now receives number | null directly from frontend
        let pokok = row.pokok ?? null;
        if (pokok !== null && (isNaN(pokok) || pokok < 0)) {
            errors.push({ row: rowNum, field: 'pokok', message: 'Pokok harus berupa angka non-negatif', value: String(row.pokok) });
            continue;
        }
        // Validate sph - now receives number | null directly from frontend
        let sph = row.sph ?? null;
        if (sph !== null && (isNaN(sph) || sph < 0)) {
            errors.push({ row: rowNum, field: 'sph', message: 'SPH harus berupa angka non-negatif', value: String(row.sph) });
            continue;
        }
        // Validate status_tanaman fields if provided
        let statusTanaman2025 = row.status_tanaman_2025 || null;
        if (statusTanaman2025 !== null && !STATUS_OPTIONS.includes(statusTanaman2025)) {
            errors.push({ row: rowNum, field: 'status_tanaman_2025', message: 'Status Tanaman 2025 tidak valid', value: String(row.status_tanaman_2025) });
            continue;
        }
        let statusTanaman2026 = row.status_tanaman_2026 || null;
        if (statusTanaman2026 !== null && !STATUS_OPTIONS.includes(statusTanaman2026)) {
            errors.push({ row: rowNum, field: 'status_tanaman_2026', message: 'Status Tanaman 2026 tidak valid', value: String(row.status_tanaman_2026) });
            continue;
        }
        let statusTanaman2027 = row.status_tanaman_2027 || null;
        if (statusTanaman2027 !== null && !STATUS_OPTIONS.includes(statusTanaman2027)) {
            errors.push({ row: rowNum, field: 'status_tanaman_2027', message: 'Status Tanaman 2027 tidak valid', value: String(row.status_tanaman_2027) });
            continue;
        }
        const id = (0, uuid_1.v4)();
        db.run(`INSERT INTO blok (id, kode_blok, nama, tahun_tanam, luas, status, keterangan, pokok, sph, bulan_tanam, status_tanaman_2025, status_tanaman_2026, status_tanaman_2027, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, row.kode_blok.trim(), row.nama.trim(), tahunTanam, luas, statusTanaman2025 || 'TM', row.keterangan || null, pokok, sph, row.bulan_tanam || null, statusTanaman2025, statusTanaman2026, statusTanaman2027, now, now]);
        existingKodes.add(row.kode_blok.trim());
        imported.push(row.kode_blok);
    }
    if (imported.length > 0) {
        saveDatabase();
    }
    electron_log_1.default.info(`[BLOK-DB] Import batch: ${imported.length} succeeded, ${errors.length} failed`);
    return {
        success: errors.length === 0,
        message: errors.length === 0
            ? `Berhasil mengimport ${imported.length} Blok`
            : `Mengimport ${imported.length} Blok, ${errors.length} gagal`,
        importedCount: imported.length,
        errors,
    };
}
/**
 * Parse ORG-1 sheet data from 'ASPEK KERJA & ORG & COA.xlsx'
 * Extracts Cost Centre codes and maps them to Blok codes
 *
 * ORG-1 structure:
 * - Row 0: Company name "TULAS SAKTIJAYA"
 * - Row 1: "KODE COST CENTRE KEBUN"
 * - Row 2: Empty
 * - Row 3: Headers - "Kode Cost", "Kode GL", "Nama Akun Perkiraan", "T.T."
 * - Rows 4+: Data rows
 *
 * Mapping logic:
 * - Cost Centre code (e.g., "21-2-00-01") contains the blok identifier
 * - Nama Akun Perkiraan (e.g., "TM - A1") contains Blok name and status
 * - Extract Blok code from Nama using pattern "STATUS - BLOKKODE" (e.g., "TM - A1" -> "A1")
 * - Extract status from Nama (e.g., "TM" from "TM - A1")
 */
function parseORG1Data(rawData) {
    const data = [];
    let blokMappingCount = 0;
    // Skip header rows (first 4 rows) and process data rows
    for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        // Skip header/empty rows
        if (!row || Object.keys(row).length === 0)
            continue;
        // Get the first column value (company name or Cost Centre code)
        const firstColKey = Object.keys(row)[0];
        const firstColValue = String(row[firstColKey] || '');
        // Skip company name rows and header rows
        if (firstColValue === 'TULAS SAKTIJAYA' ||
            firstColValue === 'KODE COST CENTRE KEBUN' ||
            firstColValue.includes('Kode Cost') ||
            firstColValue.trim() === '') {
            continue;
        }
        // Find the cost centre value (might be in first column with different key names due to Excel parsing)
        let costCentre = '';
        let kodeGL = '';
        let namaAkun = '';
        let tahunTanam = null;
        // The Excel parsing creates weird key names, so we need to find values by position or pattern
        const values = Object.values(row);
        // Find cost centre (looks like "21-2-00-01")
        for (const val of values) {
            const strVal = String(val || '');
            if (/^\d{1,2}-\d-\d{2}-\d{2}$/.test(strVal)) {
                if (!costCentre) {
                    costCentre = strVal;
                }
                else if (!kodeGL) {
                    kodeGL = strVal;
                }
            }
        }
        // Find Nama Akun Perkiraan (looks like "TM - A1")
        for (const val of values) {
            const strVal = String(val || '');
            if (strVal.includes(' - ') && !/^\d{1,2}-\d-\d{2}-\d{2}$/.test(strVal)) {
                namaAkun = strVal;
                break;
            }
        }
        // Find Tahun Tanam (numeric value between 1900 and current year)
        const currentYear = new Date().getFullYear();
        for (const val of values) {
            const numVal = Number(val);
            if (!isNaN(numVal) && numVal >= 1900 && numVal <= currentYear + 1) {
                tahunTanam = numVal;
                break;
            }
        }
        // Skip if we don't have a valid cost centre
        if (!costCentre)
            continue;
        // Extract Blok code and status from Nama Akun Perkiraan
        // Pattern: "STATUS - BLOKKODE" e.g., "TM - A1" -> status="TM", blokKode="A1"
        let blokKode = null;
        let status = null;
        if (namaAkun && namaAkun.includes(' - ')) {
            const parts = namaAkun.split(' - ');
            if (parts.length >= 2) {
                status = parts[0].trim(); // e.g., "TM"
                blokKode = parts[1].trim(); // e.g., "A1"
                // Validate blokKode format (should be letter + number like A1, B7, etc.)
                if (!/^[A-Za-z]\d+$/.test(blokKode)) {
                    blokKode = null;
                    status = null;
                }
            }
        }
        if (blokKode) {
            blokMappingCount++;
        }
        data.push({
            costCentre,
            kodeGL,
            namaAkun,
            tahunTanam,
            blokKode,
            status,
        });
    }
    return {
        success: true,
        message: `Parsed ${data.length} rows from ORG-1, found ${blokMappingCount} Blok mappings`,
        data,
        totalRows: data.length,
        blokMappingCount,
    };
}
/**
 * Map ORG-1 data to Blok format for potential import
 * Note: This is informational as Blok data primarily comes from aresta.xlsx
 */
function mapORG1ToBlok(org1Data) {
    return org1Data
        .filter(row => row.blokKode && row.status)
        .map(row => ({
        kode_blok: row.blokKode,
        nama: row.namaAkun,
        tahun_tanam: row.tahunTanam,
        costCentre: row.costCentre,
        status: row.status,
    }));
}
/**
 * Compare ORG-1 mapping with existing Blok records
 * Returns discrepancies for verification purposes
 */
function compareORG1WithBlok(org1Data, existingBlok) {
    const org1BlokCodes = new Set(org1Data
        .filter(row => row.blokKode)
        .map(row => row.blokKode));
    const existingBlokCodes = new Set(existingBlok.map(b => b.kode_blok));
    const inORG1NotInBlok = [];
    const matched = [];
    for (const kode of org1BlokCodes) {
        if (existingBlokCodes.has(kode)) {
            matched.push(kode);
        }
        else {
            inORG1NotInBlok.push(kode);
        }
    }
    const inBlokNotInORG1 = [];
    for (const kode of existingBlokCodes) {
        if (!org1BlokCodes.has(kode)) {
            inBlokNotInORG1.push(kode);
        }
    }
    return {
        inORG1NotInBlok,
        inBlokNotInORG1,
        matched,
    };
}
