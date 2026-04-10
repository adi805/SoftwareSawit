-- Migration: 0001_initial_schema
-- Description: Create all master tables, sync tables, and base transaction table structure
-- Created: 2026-04-08

-- ============================================
-- MASTER TABLES
-- ============================================

-- Users table for authentication
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

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted);

-- Chart of Accounts (COA)
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

CREATE INDEX IF NOT EXISTS idx_coa_kode ON coa(kode);
CREATE INDEX IF NOT EXISTS idx_coa_deleted ON coa(deleted);
CREATE INDEX IF NOT EXISTS idx_coa_sync_status ON coa(sync_status);

-- Aspek Kerja (Work Aspects)
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

CREATE INDEX IF NOT EXISTS idx_aspek_kerja_kode ON aspek_kerja(kode);
CREATE INDEX IF NOT EXISTS idx_aspek_kerja_deleted ON aspek_kerja(deleted);

-- Blok (Plantation Blocks)
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

CREATE INDEX IF NOT EXISTS idx_blok_kode_blok ON blok(kode_blok);
CREATE INDEX IF NOT EXISTS idx_blok_deleted ON blok(deleted);
CREATE INDEX IF NOT EXISTS idx_blok_sync_status ON blok(sync_status);
CREATE INDEX IF NOT EXISTS idx_blok_status ON blok(status);

-- ============================================
-- SYNC INFRASTRUCTURE TABLES
-- ============================================

-- Sync queue for pending operations
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

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_module_periode ON sync_queue(module, periode);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);

-- Sync log for audit trail
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

CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_log_direction ON sync_log(direction);

-- Device registry for multi-device tracking
CREATE TABLE IF NOT EXISTS device_registry (
    device_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT,
    last_sync_at TEXT,
    last_seen TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_device_registry_user_id ON device_registry(user_id);

-- ============================================
-- TRANSACTION TABLES (per module per periode)
-- Note: These tables are auto-created per periode via ensureTableExists
-- This migration establishes the base template structure
-- ============================================

-- Kas transaction base template (created per periode as kas_YYYY_MM)
CREATE TABLE IF NOT EXISTS kas_template (
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
);

-- Bank transaction base template (created per periode as bank_YYYY_MM)
CREATE TABLE IF NOT EXISTS bank_template (
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
);

-- Gudang transaction base template (created per periode as gudang_YYYY_MM)
CREATE TABLE IF NOT EXISTS gudang_template (
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
);
