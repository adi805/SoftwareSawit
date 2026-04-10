/**
 * Local Database Manager for SoftwareSawit
 * 
 * Manages SQLite database connections with:
 * - Connection pooling for multiple database files
 * - Per-module per-periode database files
 * - Schema mirroring D1 cloud database
 * - Master data shared across all periods
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

// Database connection pool
interface PooledConnection {
  db: Database;
  lastUsed: number;
  path: string;
}

type ModuleType = 'kas' | 'bank' | 'gudang';
type MasterModuleType = 'users' | 'coa' | 'aspek_kerja' | 'blok';

// Pool configuration
const POOL_MAX_SIZE = 20;

class LocalDatabaseManager {
  private static instance: LocalDatabaseManager;
  private pool: Map<string, PooledConnection> = new Map();
  private SQL: SqlJsStatic | null = null;
  private basePath: string;
  private initialized: boolean = false;

  private constructor() {
    this.basePath = path.join(app.getPath('userData'), 'data');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): LocalDatabaseManager {
    if (!LocalDatabaseManager.instance) {
      LocalDatabaseManager.instance = new LocalDatabaseManager();
    }
    return LocalDatabaseManager.instance;
  }

  /**
   * Initialize the database manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    log.info('[DB-MGR] Initializing Local Database Manager...');

    try {
      this.SQL = await initSqlJs();
      this.ensureDataDirectory();
      this.initialized = true;
      log.info('[DB-MGR] Database Manager initialized successfully');
    } catch (error) {
      log.error('[DB-MGR] Failed to initialize Database Manager:', error);
      throw error;
    }
  }

  /**
   * Ensure base data directory exists
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      log.info('[DB-MGR] Created data directory:', this.basePath);
    }

    // Create module directories
    const modules: ModuleType[] = ['kas', 'bank', 'gudang'];

    // Create master directory
    const masterDir = path.join(this.basePath, 'master');
    if (!fs.existsSync(masterDir)) {
      fs.mkdirSync(masterDir, { recursive: true });
      log.info('[DB-MGR] Created master directory:', masterDir);
    }

    // Create module directories with year subdirectories
    for (const module of modules) {
      const moduleDir = path.join(this.basePath, module);
      if (!fs.existsSync(moduleDir)) {
        fs.mkdirSync(moduleDir, { recursive: true });
        log.info('[DB-MGR] Created module directory:', moduleDir);
      }
    }

    // Create sync directory
    const syncDir = path.join(this.basePath, 'sync');
    if (!fs.existsSync(syncDir)) {
      fs.mkdirSync(syncDir, { recursive: true });
      log.info('[DB-MGR] Created sync directory:', syncDir);
    }
  }

  /**
   * Get database path for master module
   */
  public getMasterDatabasePath(module: MasterModuleType): string {
    return path.join(this.basePath, 'master', `${module}.db`);
  }

  /**
   * Get database path for transaction module and periode
   */
  public getTransactionDatabasePath(module: ModuleType, year: number, month: number): string {
    const yearStr = String(year);
    const monthStr = String(month).padStart(2, '0');
    return path.join(this.basePath, module, yearStr, `${module}_${yearStr}_${monthStr}.db`);
  }

  /**
   * Get sync database path
   */
  public getSyncDatabasePath(): string {
    return path.join(this.basePath, 'sync', 'sync.db');
  }

  /**
   * Generate cache key for connection pool
   */
  private getPoolKey(dbPath: string): string {
    return dbPath;
  }

  /**
   * Get database from pool or create new connection
   */
  public async getDatabase(dbPath: string): Promise<Database> {
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
    let db: Database;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new this.SQL.Database(buffer);
      log.debug('[DB-MGR] Loaded existing database:', dbPath);
    } else {
      db = new this.SQL.Database();
      log.debug('[DB-MGR] Created new database:', dbPath);
    }

    // Enable foreign key enforcement (VAL-LOCAL-007)
    db.run('PRAGMA foreign_keys = ON');

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
  private evictOldestConnection(): void {
    let oldestKey: string | null = null;
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
        log.debug('[DB-MGR] Evicted oldest connection:', oldestKey);
      }
    }
  }

  /**
   * Save database to file
   */
  public saveDatabase(db: Database, dbPath: string): void {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      
      // Ensure directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(dbPath, buffer);
      log.debug('[DB-MGR] Saved database:', dbPath);
    } catch (error) {
      log.error('[DB-MGR] Failed to save database:', error);
    }
  }

  /**
   * Close and save all connections in pool
   */
  public closeAll(): void {
    log.info('[DB-MGR] Closing all database connections...');

    for (const conn of this.pool.values()) {
      this.saveDatabase(conn.db, conn.path);
      conn.db.close();
      log.debug('[DB-MGR] Closed:', conn.path);
    }

    this.pool.clear();
    this.initialized = false;
    log.info('[DB-MGR] All connections closed');
  }

  /**
   * Initialize master database with D1 schema
   */
  public async initMasterDatabase(module: MasterModuleType): Promise<Database> {
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
  private createUsersTable(db: Database): void {
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
    log.info('[DB-MGR] Users table created/verified');
  }

  /**
   * Create COA table matching D1 schema
   */
  private createCOATable(db: Database): void {
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
    log.info('[DB-MGR] COA table created/verified');
  }

  /**
   * Create Aspek Kerja table matching D1 schema
   */
  private createAspekKerjaTable(db: Database): void {
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
    log.info('[DB-MGR] Aspek Kerja table created/verified');
  }

  /**
   * Create Blok table matching D1 schema
   */
  private createBlokTable(db: Database): void {
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
    log.info('[DB-MGR] Blok table created/verified');
  }

  /**
   * Initialize transaction database (kas, bank, gudang) with D1 schema
   */
  public async initTransactionDatabase(module: ModuleType, year: number, month: number): Promise<Database> {
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
   * Includes coa_id and blok_id for foreign key references (VAL-LOCAL-007)
   */
  private createKasTransactionTable(db: Database, year: number, month: number): void {
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
        updated_at TEXT DEFAULT (datetime('now')),
        coa_id TEXT,
        blok_id TEXT,
        FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE SET NULL,
        FOREIGN KEY (blok_id) REFERENCES blok(id) ON DELETE SET NULL
      )
    `);

    // For existing tables, add missing columns using ALTER TABLE
    this.addTransactionTableColumns(db, tableName);

    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_akun ON ${tableName}(kode_akun)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_coa_id ON ${tableName}(coa_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_blok_id ON ${tableName}(blok_id)`);
    log.info(`[DB-MGR] Kas transaction table ${tableName} created/verified`);
  }

  /**
   * Create Bank transaction table matching D1 schema
   * Includes coa_id and blok_id for foreign key references (VAL-LOCAL-007)
   */
  private createBankTransactionTable(db: Database, year: number, month: number): void {
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
        updated_at TEXT DEFAULT (datetime('now')),
        coa_id TEXT,
        blok_id TEXT,
        FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE SET NULL,
        FOREIGN KEY (blok_id) REFERENCES blok(id) ON DELETE SET NULL
      )
    `);

    // For existing tables, add missing columns using ALTER TABLE
    this.addTransactionTableColumns(db, tableName);

    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_akun ON ${tableName}(kode_akun)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_no_bukti ON ${tableName}(no_bukti)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_coa_id ON ${tableName}(coa_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_blok_id ON ${tableName}(blok_id)`);
    log.info(`[DB-MGR] Bank transaction table ${tableName} created/verified`);
  }

  /**
   * Create Gudang transaction table matching D1 schema
   * Includes coa_id and blok_id for foreign key references (VAL-LOCAL-007)
   */
  private createGudangTransactionTable(db: Database, year: number, month: number): void {
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
        updated_at TEXT DEFAULT (datetime('now')),
        coa_id TEXT,
        blok_id TEXT,
        FOREIGN KEY (coa_id) REFERENCES coa(id) ON DELETE SET NULL,
        FOREIGN KEY (blok_id) REFERENCES blok(id) ON DELETE SET NULL
      )
    `);

    // For existing tables, add missing columns using ALTER TABLE
    this.addTransactionTableColumns(db, tableName);

    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_tanggal ON ${tableName}(tanggal)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status ON ${tableName}(sync_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_kode_barang ON ${tableName}(kode_barang)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted ON ${tableName}(deleted)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_jenis ON ${tableName}(jenis_transaksi)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_coa_id ON ${tableName}(coa_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_${tableName}_blok_id ON ${tableName}(blok_id)`);
    log.info(`[DB-MGR] Gudang transaction table ${tableName} created/verified`);
  }

  /**
   * Add coa_id and blok_id columns to existing transaction tables (VAL-LOCAL-007)
   * This is a migration helper that adds columns if they don't exist
   */
  private addTransactionTableColumns(db: Database, tableName: string): void {
    // Check if coa_id column exists, add if not
    const coaIdCheck = db.exec(`PRAGMA table_info('${tableName}')`);
    const hasCoaId = coaIdCheck.length > 0 && coaIdCheck[0].values.some(row => {
      const nameIndex = coaIdCheck[0].columns.indexOf('name');
      return row[nameIndex] === 'coa_id';
    });

    if (!hasCoaId) {
      try {
        db.run(`ALTER TABLE ${tableName} ADD COLUMN coa_id TEXT`);
        log.info(`[DB-MGR] Added coa_id column to ${tableName}`);
      } catch (error) {
        log.warn(`[DB-MGR] Could not add coa_id column to ${tableName}:`, error);
      }
    }

    // Check if blok_id column exists, add if not
    const blokIdCheck = db.exec(`PRAGMA table_info('${tableName}')`);
    const hasBlokId = blokIdCheck.length > 0 && blokIdCheck[0].values.some(row => {
      const nameIndex = blokIdCheck[0].columns.indexOf('name');
      return row[nameIndex] === 'blok_id';
    });

    if (!hasBlokId) {
      try {
        db.run(`ALTER TABLE ${tableName} ADD COLUMN blok_id TEXT`);
        log.info(`[DB-MGR] Added blok_id column to ${tableName}`);
      } catch (error) {
        log.warn(`[DB-MGR] Could not add blok_id column to ${tableName}:`, error);
      }
    }
  }

  /**
   * Initialize sync database with D1 schema
   */
  public async initSyncDatabase(): Promise<Database> {
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
    log.info('[DB-MGR] Sync database created/verified');
    return db;
  }

  /**
   * Initialize all local databases (master + sync)
   */
  public async initAllDatabases(): Promise<void> {
    log.info('[DB-MGR] Initializing all local databases...');

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

    log.info('[DB-MGR] All local databases initialized successfully');
  }

  /**
   * Get existing transaction database or create new one
   */
  public async getTransactionDatabase(module: ModuleType, year: number, month: number): Promise<Database> {
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
  public getExistingPeriods(module: ModuleType): Array<{ year: number; month: number }> {
    const moduleDir = path.join(this.basePath, module);
    const periods: Array<{ year: number; month: number }> = [];

    if (!fs.existsSync(moduleDir)) {
      return periods;
    }

    const years = fs.readdirSync(moduleDir);
    for (const year of years) {
      const yearPath = path.join(moduleDir, year);
      if (!fs.statSync(yearPath).isDirectory()) continue;
      
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum)) continue;

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
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }

  /**
   * Get database info for diagnostics
   */
  public getStats(): {
    poolSize: number;
    initialized: boolean;
    basePath: string;
    masterDatabases: string[];
    transactionPeriods: Record<ModuleType, Array<{ year: number; month: number }>>;
  } {
    const masterModules: MasterModuleType[] = ['users', 'coa', 'aspek_kerja', 'blok'];
    const modules: ModuleType[] = ['kas', 'bank', 'gudang'];

    const transactionPeriods = {} as Record<ModuleType, Array<{ year: number; month: number }>>;
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
export const localDatabaseManager = LocalDatabaseManager.getInstance();
export default localDatabaseManager;
