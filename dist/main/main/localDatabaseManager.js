"use strict";
/**
 * Local Database Manager for SoftwareSawit
 *
 * Manages SQLite database connections with:
 * - Connection pooling for multiple database files
 * - Per-module per-periode database files
 * - Schema mirroring D1 cloud database
 * - Master data shared across all periods
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
exports.localDatabaseManager = void 0;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
// Pool configuration
const POOL_MAX_SIZE = 20;
class LocalDatabaseManager {
    static instance;
    pool = new Map();
    SQL = null;
    basePath;
    initialized = false;
    constructor() {
        this.basePath = path.join(electron_1.app.getPath('userData'), 'data');
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!LocalDatabaseManager.instance) {
            LocalDatabaseManager.instance = new LocalDatabaseManager();
        }
        return LocalDatabaseManager.instance;
    }
    /**
     * Initialize the database manager
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        electron_log_1.default.info('[DB-MGR] Initializing Local Database Manager...');
        try {
            this.SQL = await (0, sql_js_1.default)();
            this.ensureDataDirectory();
            this.initialized = true;
            electron_log_1.default.info('[DB-MGR] Database Manager initialized successfully');
        }
        catch (error) {
            electron_log_1.default.error('[DB-MGR] Failed to initialize Database Manager:', error);
            throw error;
        }
    }
    /**
     * Ensure base data directory exists
     */
    ensureDataDirectory() {
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
            electron_log_1.default.info('[DB-MGR] Created data directory:', this.basePath);
        }
        // Create module directories
        const modules = ['kas', 'bank', 'gudang'];
        // Create master directory
        const masterDir = path.join(this.basePath, 'master');
        if (!fs.existsSync(masterDir)) {
            fs.mkdirSync(masterDir, { recursive: true });
            electron_log_1.default.info('[DB-MGR] Created master directory:', masterDir);
        }
        // Create module directories with year subdirectories
        for (const module of modules) {
            const moduleDir = path.join(this.basePath, module);
            if (!fs.existsSync(moduleDir)) {
                fs.mkdirSync(moduleDir, { recursive: true });
                electron_log_1.default.info('[DB-MGR] Created module directory:', moduleDir);
            }
        }
        // Create sync directory
        const syncDir = path.join(this.basePath, 'sync');
        if (!fs.existsSync(syncDir)) {
            fs.mkdirSync(syncDir, { recursive: true });
            electron_log_1.default.info('[DB-MGR] Created sync directory:', syncDir);
        }
    }
    /**
     * Get database path for master module
     */
    getMasterDatabasePath(module) {
        return path.join(this.basePath, 'master', `${module}.db`);
    }
    /**
     * Get database path for transaction module and periode
     */
    getTransactionDatabasePath(module, year, month) {
        const yearStr = String(year);
        const monthStr = String(month).padStart(2, '0');
        return path.join(this.basePath, module, yearStr, `${module}_${yearStr}_${monthStr}.db`);
    }
    /**
     * Get sync database path
     */
    getSyncDatabasePath() {
        return path.join(this.basePath, 'sync', 'sync.db');
    }
    /**
     * Generate cache key for connection pool
     */
    getPoolKey(dbPath) {
        return dbPath;
    }
    /**
     * Get database from pool or create new connection
     */
    async getDatabase(dbPath) {
        if (!this.SQL) {
            throw new Error('Database Manager not initialized');
        }
        const poolKey = this.getPoolKey(dbPath);
        const existing = this.pool.get(poolKey);
        if (existing) {
            existing.lastUsed = Date.now();
            return existing.db;
        }
        // Check pool size and evict oldest if necessary
        if (this.pool.size >= POOL_MAX_SIZE) {
            this.evictOldestConnection();
        }
        // Load or create database
        let db;
        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new this.SQL.Database(buffer);
            electron_log_1.default.debug('[DB-MGR] Loaded existing database:', dbPath);
        }
        else {
            db = new this.SQL.Database();
            electron_log_1.default.debug('[DB-MGR] Created new database:', dbPath);
        }
        this.pool.set(poolKey, {
            db,
            lastUsed: Date.now(),
            path: dbPath,
        });
        return db;
    }
    /**
     * Evict oldest connection from pool
     */
    evictOldestConnection() {
        let oldestKey = null;
        let oldestTime = Date.now();
        for (const [key, conn] of this.pool) {
            if (conn.lastUsed < oldestTime) {
                oldestTime = conn.lastUsed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            const conn = this.pool.get(oldestKey);
            if (conn) {
                this.saveDatabase(conn.db, conn.path);
                conn.db.close();
                this.pool.delete(oldestKey);
                electron_log_1.default.debug('[DB-MGR] Evicted oldest connection:', oldestKey);
            }
        }
    }
    /**
     * Save database to file
     */
    saveDatabase(db, dbPath) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            // Ensure directory exists
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(dbPath, buffer);
            electron_log_1.default.debug('[DB-MGR] Saved database:', dbPath);
        }
        catch (error) {
            electron_log_1.default.error('[DB-MGR] Failed to save database:', error);
        }
    }
    /**
     * Close and save all connections in pool
     */
    closeAll() {
        electron_log_1.default.info('[DB-MGR] Closing all database connections...');
        for (const conn of this.pool.values()) {
            this.saveDatabase(conn.db, conn.path);
            conn.db.close();
            electron_log_1.default.debug('[DB-MGR] Closed:', conn.path);
        }
        this.pool.clear();
        this.initialized = false;
        electron_log_1.default.info('[DB-MGR] All connections closed');
    }
    /**
     * Initialize master database with D1 schema
     */
    async initMasterDatabase(module) {
        const dbPath = this.getMasterDatabasePath(module);
        const db = await this.getDatabase(dbPath);
        // Create tables based on module type
        switch (module) {
            case 'users':
                this.createUsersTable(db);
                break;
            case 'coa':
                this.createCOATable(db);
                break;
            case 'aspek_kerja':
                this.createAspekKerjaTable(db);
                break;
            case 'blok':
                this.createBlokTable(db);
                break;
        }
        this.saveDatabase(db, dbPath);
        return db;
    }
    /**
     * Create users table matching D1 schema
     */
    createUsersTable(db) {
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nama TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'approver')),
        modules TEXT DEFAULT '["kas"]',
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted)`);
        electron_log_1.default.info('[DB-MGR] Users table created/verified');
    }
    /**
     * Create COA table matching D1 schema
     */
    createCOATable(db) {
        db.run(`
      CREATE TABLE IF NOT EXISTS coa (
        id TEXT PRIMARY KEY,
        kode TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        jenis TEXT NOT NULL CHECK(jenis IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
        kategori TEXT,
        parent_kode TEXT,
        sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_coa_kode ON coa(kode)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_coa_deleted ON coa(deleted)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_coa_sync_status ON coa(sync_status)`);
        electron_log_1.default.info('[DB-MGR] COA table created/verified');
    }
    /**
     * Create Aspek Kerja table matching D1 schema
     */
    createAspekKerjaTable(db) {
        db.run(`
      CREATE TABLE IF NOT EXISTS aspek_kerja (
        id TEXT PRIMARY KEY,
        kode TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        kategori TEXT,
        sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aspek_kerja_kode ON aspek_kerja(kode)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_aspek_kerja_deleted ON aspek_kerja(deleted)`);
        electron_log_1.default.info('[DB-MGR] Aspek Kerja table created/verified');
    }
    /**
     * Create Blok table matching D1 schema
     */
    createBlokTable(db) {
        db.run(`
      CREATE TABLE IF NOT EXISTS blok (
        id TEXT PRIMARY KEY,
        kode_blok TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        tahun_tanam INTEGER NOT NULL,
        luas REAL NOT NULL,
        status TEXT DEFAULT 'TM' CHECK(status IN ('TM', 'TBM', 'TTM', 'TLS')),
        keterangan TEXT,
        pokok INTEGER,
        sph REAL,
        bulan_tanam TEXT,
        status_tanaman TEXT,
        sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_blok_kode_blok ON blok(kode_blok)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_blok_deleted ON blok(deleted)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_blok_sync_status ON blok(sync_status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_blok_status ON blok(status)`);
        electron_log_1.default.info('[DB-MGR] Blok table created/verified');
    }
    /**
     * Initialize transaction database (kas, bank, gudang) with D1 schema
     */
    async initTransactionDatabase(module, year, month) {
        const dbPath = this.getTransactionDatabasePath(module, year, month);
        const db = await this.getDatabase(dbPath);
        // Create transaction table based on module type
        switch (module) {
            case 'kas':
                this.createKasTransactionTable(db, year, month);
                break;
            case 'bank':
                this.createBankTransactionTable(db, year, month);
                break;
            case 'gudang':
                this.createGudangTransactionTable(db, year, month);
                break;
        }
        this.saveDatabase(db, dbPath);
        return db;
    }
    /**
     * Create Kas transaction table matching D1 schema
     */
    createKasTransactionTable(db, year, month) {
        const tableName = `kas_${year}_${String(month).padStart(2, '0')}`;
        db.run(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        tanggal TEXT NOT NULL,
        kode_akun TEXT NOT NULL,
        uraian TEXT NOT NULL,
        debet REAL DEFAULT 0,
        kredit REAL DEFAULT 0,
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        modified_at TEXT DEFAULT (datetime('now')),
        device_id TEXT,
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_akun ON ${tableName}(kode_akun)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
        electron_log_1.default.info(`[DB-MGR] Kas transaction table ${tableName} created/verified`);
    }
    /**
     * Create Bank transaction table matching D1 schema
     */
    createBankTransactionTable(db, year, month) {
        const tableName = `bank_${year}_${String(month).padStart(2, '0')}`;
        db.run(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        tanggal TEXT NOT NULL,
        kode_akun TEXT NOT NULL,
        uraian TEXT NOT NULL,
        debet REAL DEFAULT 0,
        kredit REAL DEFAULT 0,
        no_bukti TEXT,
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        modified_at TEXT DEFAULT (datetime('now')),
        device_id TEXT,
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_akun ON ${tableName}(kode_akun)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_no_bukti ON ${tableName}(no_bukti)`);
        electron_log_1.default.info(`[DB-MGR] Bank transaction table ${tableName} created/verified`);
    }
    /**
     * Create Gudang transaction table matching D1 schema
     */
    createGudangTransactionTable(db, year, month) {
        const tableName = `gudang_${year}_${String(month).padStart(2, '0')}`;
        db.run(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        tanggal TEXT NOT NULL,
        kode_barang TEXT NOT NULL,
        nama_barang TEXT NOT NULL,
        quantity REAL NOT NULL,
        satuan TEXT NOT NULL,
        harga_satuan REAL DEFAULT 0,
        total_harga REAL DEFAULT 0,
        jenis_transaksi TEXT NOT NULL CHECK(jenis_transaksi IN ('masuk', 'keluar')),
        uraian TEXT,
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        modified_at TEXT DEFAULT (datetime('now')),
        device_id TEXT,
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_barang ON ${tableName}(kode_barang)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_jenis ON ${tableName}(jenis_transaksi)`);
        electron_log_1.default.info(`[DB-MGR] Gudang transaction table ${tableName} created/verified`);
    }
    /**
     * Initialize sync database with D1 schema
     */
    async initSyncDatabase() {
        const dbPath = this.getSyncDatabasePath();
        const db = await this.getDatabase(dbPath);
        // Sync queue table
        db.run(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
        module TEXT NOT NULL CHECK(module IN ('kas', 'bank', 'gudang')),
        periode TEXT NOT NULL,
        record_id TEXT NOT NULL,
        data TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed', 'completed')),
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
        // Sync log table
        db.run(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('up', 'down')),
        module TEXT NOT NULL,
        records_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'partial', 'failed')),
        errors TEXT,
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      )
    `);
        // Device registry table
        db.run(`
      CREATE TABLE IF NOT EXISTS device_registry (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT,
        last_sync_at TEXT,
        last_seen TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
        // Indexes for sync tables
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_module_periode ON sync_queue(module, periode)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sync_log_direction ON sync_log(direction)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_device_registry_user_id ON device_registry(user_id)`);
        this.saveDatabase(db, dbPath);
        electron_log_1.default.info('[DB-MGR] Sync database created/verified');
        return db;
    }
    /**
     * Initialize all local databases (master + sync)
     */
    async initAllDatabases() {
        electron_log_1.default.info('[DB-MGR] Initializing all local databases...');
        // Initialize master databases
        await this.initMasterDatabase('users');
        await this.initMasterDatabase('coa');
        await this.initMasterDatabase('aspek_kerja');
        await this.initMasterDatabase('blok');
        // Initialize sync database
        await this.initSyncDatabase();
        // Initialize current period transaction databases
        const now = new Date();
        await this.initTransactionDatabase('kas', now.getFullYear(), now.getMonth() + 1);
        await this.initTransactionDatabase('bank', now.getFullYear(), now.getMonth() + 1);
        await this.initTransactionDatabase('gudang', now.getFullYear(), now.getMonth() + 1);
        electron_log_1.default.info('[DB-MGR] All local databases initialized successfully');
    }
    /**
     * Get existing transaction database or create new one
     */
    async getTransactionDatabase(module, year, month) {
        const dbPath = this.getTransactionDatabasePath(module, year, month);
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return await this.initTransactionDatabase(module, year, month);
    }
    /**
     * Get list of existing periods for a module
     */
    getExistingPeriods(module) {
        const moduleDir = path.join(this.basePath, module);
        const periods = [];
        if (!fs.existsSync(moduleDir)) {
            return periods;
        }
        const years = fs.readdirSync(moduleDir);
        for (const year of years) {
            const yearPath = path.join(moduleDir, year);
            if (!fs.statSync(yearPath).isDirectory())
                continue;
            const yearNum = parseInt(year, 10);
            if (isNaN(yearNum))
                continue;
            const files = fs.readdirSync(yearPath);
            for (const file of files) {
                // Expected format: kas_2026_01.db
                const match = file.match(new RegExp(`^${module}_(\\d{4})_(\\d{2})\\.db$`));
                if (match) {
                    periods.push({
                        year: parseInt(match[1], 10),
                        month: parseInt(match[2], 10),
                    });
                }
            }
        }
        return periods.sort((a, b) => {
            if (a.year !== b.year)
                return a.year - b.year;
            return a.month - b.month;
        });
    }
    /**
     * Get database info for diagnostics
     */
    getStats() {
        const masterModules = ['users', 'coa', 'aspek_kerja', 'blok'];
        const modules = ['kas', 'bank', 'gudang'];
        const transactionPeriods = {};
        for (const module of modules) {
            transactionPeriods[module] = this.getExistingPeriods(module);
        }
        return {
            poolSize: this.pool.size,
            initialized: this.initialized,
            basePath: this.basePath,
            masterDatabases: masterModules.map(m => this.getMasterDatabasePath(m)),
            transactionPeriods,
        };
    }
}
// Export singleton instance
exports.localDatabaseManager = LocalDatabaseManager.getInstance();
exports.default = exports.localDatabaseManager;
