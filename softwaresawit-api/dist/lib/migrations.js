/**
 * D1 Database Migrations and Auto-Table Creation
 *
 * This module provides:
 * 1. Migration execution framework for D1
 * 2. Auto-creation of per-periode transaction tables
 * 3. Table existence checking and index creation
 */
// Migration tracking table name
const MIGRATIONS_TABLE = '_migrations';
/**
 * List of migrations to apply
 * Migrations are idempotent - they use CREATE TABLE IF NOT EXISTS
 */
const migrations = [
    {
        name: '0001_initial_schema',
        sql: `
      -- MASTER TABLES
      
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
      );
      
      CREATE TABLE IF NOT EXISTS coa (
        id TEXT PRIMARY KEY,
        kode TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        jenis TEXT NOT NULL CHECK(jenis IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
        kategori TEXT,
        parent_kode TEXT,
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS aspek_kerja (
        id TEXT PRIMARY KEY,
        kode TEXT UNIQUE NOT NULL,
        nama TEXT NOT NULL,
        kategori TEXT,
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
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
        sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
        deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      
      -- SYNC TABLES
      
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
      );
      
      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        direction TEXT NOT NULL CHECK(direction IN ('up', 'down')),
        module TEXT NOT NULL,
        records_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'partial', 'failed')),
        errors TEXT,
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );
      
      CREATE TABLE IF NOT EXISTS device_registry (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_name TEXT,
        last_sync_at TEXT,
        last_seen TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      -- INDEXES FOR MASTER TABLES
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted);
      CREATE INDEX IF NOT EXISTS idx_coa_kode ON coa(kode);
      CREATE INDEX IF NOT EXISTS idx_coa_deleted ON coa(deleted);
      CREATE INDEX IF NOT EXISTS idx_coa_sync_status ON coa(sync_status);
      CREATE INDEX IF NOT EXISTS idx_aspek_kerja_kode ON aspek_kerja(kode);
      CREATE INDEX IF NOT EXISTS idx_aspek_kerja_deleted ON aspek_kerja(deleted);
      CREATE INDEX IF NOT EXISTS idx_blok_kode_blok ON blok(kode_blok);
      CREATE INDEX IF NOT EXISTS idx_blok_deleted ON blok(deleted);
      CREATE INDEX IF NOT EXISTS idx_blok_sync_status ON blok(sync_status);
      CREATE INDEX IF NOT EXISTS idx_blok_status ON blok(status);
      
      -- INDEXES FOR SYNC TABLES
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_module_periode ON sync_queue(module, periode);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at);
      CREATE INDEX IF NOT EXISTS idx_sync_log_direction ON sync_log(direction);
      CREATE INDEX IF NOT EXISTS idx_device_registry_user_id ON device_registry(user_id);
      
      -- MIGRATIONS TRACKING
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `
    },
    {
        name: '0002_seed_data',
        sql: `
      -- Seed initial COA data only if table is empty
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-1001', '1101', 'Kas', 'asset', 'Aset Lancar', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '1101');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-1002', '1102', 'Bank', 'asset', 'Aset Lancar', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '1102');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-1003', '1103', 'Piutang', 'asset', 'Aset Lancar', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '1103');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-2001', '2101', 'Hutang Dagang', 'liability', 'Hutang Lancar', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '2101');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-3001', '3001', 'Modal', 'equity', 'Modal', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '3001');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-4001', '4101', 'Pendapatan Penjualan', 'revenue', 'Pendapatan', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '4101');
      
      INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status)
      SELECT 'coa-5001', '5101', 'Beban Gaji', 'expense', 'Beban Operasional', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM coa WHERE kode = '5101');
      
      -- Seed initial aspek_kerja data
      INSERT INTO aspek_kerja (id, kode, nama, kategori, sync_status)
      SELECT 'aspek-001', 'AK-001', 'Pemeliharaan Kebun', 'operasional', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM aspek_kerja WHERE kode = 'AK-001');
      
      INSERT INTO aspek_kerja (id, kode, nama, kategori, sync_status)
      SELECT 'aspek-002', 'AK-002', 'Panen', 'operasional', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM aspek_kerja WHERE kode = 'AK-002');
      
      INSERT INTO aspek_kerja (id, kode, nama, kategori, sync_status)
      SELECT 'aspek-003', 'AK-003', 'Pengangkutan', 'transport', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM aspek_kerja WHERE kode = 'AK-003');
      
      -- Seed default admin user
      INSERT INTO users (id, username, password, nama, role, modules, sync_status)
      SELECT 'user-admin-001', 'admin', 'admin123', 'Administrator', 'admin', '["kas", "bank", "gudang"]', 'synced'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
    `
    }
];
/**
 * Run all pending migrations on the database
 * Migrations are idempotent - already applied migrations are skipped
 */
export async function runMigrations(db) {
    const applied = [];
    const errors = [];
    // First, ensure the migrations table exists
    await db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
    // Get list of already applied migrations
    const appliedMigrations = await db
        .prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`)
        .all();
    const appliedSet = new Set(appliedMigrations.results.map((r) => r.name));
    // Run pending migrations
    for (const migration of migrations) {
        if (appliedSet.has(migration.name)) {
            console.log(`Migration ${migration.name} already applied, skipping...`);
            continue;
        }
        try {
            console.log(`Applying migration: ${migration.name}`);
            await db.exec(migration.sql);
            // Record the migration
            await db
                .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`)
                .bind(migration.name)
                .run();
            applied.push(migration.name);
            console.log(`Migration ${migration.name} applied successfully`);
        }
        catch (error) {
            console.error(`Error applying migration ${migration.name}:`, error);
            errors.push(`${migration.name}: ${error.message}`);
        }
    }
    return { applied, errors };
}
/**
 * Get migration status
 */
export async function getMigrationStatus(db) {
    try {
        const result = await db
            .prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`)
            .all();
        const appliedSet = new Set(result.results.map((r) => r.name));
        const applied = Array.from(appliedSet);
        const pending = migrations
            .filter(m => !appliedSet.has(m.name))
            .map(m => m.name);
        return { applied, pending };
    }
    catch {
        // Migrations table doesn't exist yet
        return { applied: [], pending: migrations.map(m => m.name) };
    }
}
// ============================================
// PER-PERIODE TABLE AUTO-CREATION
// ============================================
/**
 * Table creation templates for each module
 */
const TABLE_TEMPLATES = {
    kas: `
    CREATE TABLE IF NOT EXISTS {tableName} (
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
      FOREIGN KEY (kode_akun) REFERENCES coa(kode) ON DELETE RESTRICT
    );
  `,
    bank: `
    CREATE TABLE IF NOT EXISTS {tableName} (
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
      FOREIGN KEY (kode_akun) REFERENCES coa(kode) ON DELETE RESTRICT
    );
  `,
    gudang: `
    CREATE TABLE IF NOT EXISTS {tableName} (
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
      FOREIGN KEY (kode_barang) REFERENCES coa(kode) ON DELETE RESTRICT
    );
  `
};
/**
 * Index templates for each table
 */
const INDEX_TEMPLATES = {
    kas: [
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_tanggal ON {tableName}(tanggal)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_sync_status ON {tableName}(sync_status)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_kode_akun ON {tableName}(kode_akun)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_deleted ON {tableName}(deleted)'
    ],
    bank: [
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_tanggal ON {tableName}(tanggal)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_sync_status ON {tableName}(sync_status)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_kode_akun ON {tableName}(kode_akun)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_deleted ON {tableName}(deleted)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_no_bukti ON {tableName}(no_bukti)'
    ],
    gudang: [
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_tanggal ON {tableName}(tanggal)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_sync_status ON {tableName}(sync_status)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_kode_barang ON {tableName}(kode_barang)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_deleted ON {tableName}(deleted)',
        'CREATE INDEX IF NOT EXISTS idx_{tableName}_jenis ON {tableName}(jenis_transaksi)'
    ]
};
/**
 * Parse YYYY/MM or YYYY_MM format to table suffix
 */
export function parsePeriodeToTableSuffix(yearMonth) {
    // Handle both YYYY/MM and YYYY_MM formats
    const normalized = yearMonth.replace('/', '_');
    return normalized;
}
/**
 * Get the full table name for a module and periode
 */
export function getTableName(module, periode) {
    return `${module}_${parsePeriodeToTableSuffix(periode)}`;
}
/**
 * Ensure a transaction table exists for the given module and periode
 * Creates table and indexes if they don't exist
 */
export async function ensureTransactionTableExists(db, module, periode) {
    const tableName = getTableName(module, periode);
    // Check if table exists
    const existing = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
        .bind(tableName)
        .first();
    if (existing) {
        console.log(`Table ${tableName} already exists`);
        return;
    }
    console.log(`Creating table: ${tableName}`);
    // Create table from template
    const createTableSQL = TABLE_TEMPLATES[module].replace(/{tableName}/g, tableName);
    await db.exec(createTableSQL);
    // Create indexes
    const indexes = INDEX_TEMPLATES[module];
    for (const indexSQL of indexes) {
        await db.exec(indexSQL.replace(/{tableName}/g, tableName));
    }
    console.log(`Table ${tableName} and indexes created successfully`);
}
/**
 * Get list of existing transaction tables for a module
 */
export async function getTransactionTables(db, module) {
    const result = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?`)
        .bind(`${module}_%`)
        .all();
    return result.results.map((r) => r.name);
}
/**
 * Check if a specific transaction table exists
 */
export async function transactionTableExists(db, module, periode) {
    const tableName = getTableName(module, periode);
    const result = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
        .bind(tableName)
        .first();
    return !!result;
}
/**
 * Get all tables in the database (for debugging/migration)
 */
export async function listAllTables(db) {
    const result = await db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all();
    return result.results.map((r) => r.name);
}
