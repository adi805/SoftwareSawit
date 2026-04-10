#!/usr/bin/env node

/**
 * Seed Test Data for GitHub Actions Tests
 * Run this before tests to populate database
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Database paths - CORRECT paths matching the app's expected locations
const BASE_DIR = path.join(process.env.APPDATA || process.env.HOME, 'SoftwareSawit');
const DATA_DIR = path.join(BASE_DIR, 'data');

// User database
const USERS_DB = path.join(DATA_DIR, 'users.db');

// Master databases
const MASTER_DIR = path.join(DATA_DIR, 'master');
const COA_DB = path.join(MASTER_DIR, 'coa.db');

// Transaction databases (year/month based)
const currentDate = new Date();
const YEAR = currentDate.getFullYear();
const MONTH = String(currentDate.getMonth() + 1).padStart(2, '0');

const KAS_DIR = path.join(DATA_DIR, 'kas', String(YEAR));
const KAS_DB = path.join(KAS_DIR, MONTH + '.db');

const BANK_DIR = path.join(DATA_DIR, 'bank', String(YEAR));
const BANK_DB = path.join(BANK_DIR, MONTH + '.db');

const GUDANG_DIR = path.join(DATA_DIR, 'gudang', String(YEAR));
const GUDANG_DB = path.join(GUDANG_DIR, MONTH + '.db');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function seedCOA(db) {
  console.log('Seeding COA...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS coa (
      id TEXT PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      tipe TEXT NOT NULL,
      parent_id TEXT,
      status_aktif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO coa (id, kode, nama, tipe, parent_id, status_aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const coaData = [
    ['1', '1-1000', 'Kas', 'Aktiva Lancar', null],
    ['2', '1-1100', 'Bank', 'Aktiva Lancar', '1'],
    ['3', '1-1200', 'Piutang', 'Aktiva Lancar', '1'],
    ['4', '2-1000', 'Utang Usaha', 'Utang Lancar', null],
    ['5', '3-1000', 'Modal', 'Ekuitas', null],
    ['6', '4-1000', 'Pendapatan', 'Pendapatan', null],
    ['7', '5-1000', 'Beban Gaji', 'Beban', null],
  ];

  const insertMany = db.transaction((data) => {
    for (const row of data) {
      insert.run(...row);
    }
  });
  insertMany(coaData);
  console.log(`Seeded ${coaData.length} COA records`);
}

function seedAspekKerja(db) {
  console.log('Seeding Aspek Kerja...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS aspek_kerja (
      id TEXT PRIMARY KEY,
      kode TEXT UNUNIQUE NOT NULL,
      nama TEXT NOT NULL,
      coa_id TEXT,
      jenis TEXT,
      status_aktif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO aspek_kerja (id, kode, nama, coa_id, jenis, status_aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const akData = [
    ['1', 'AK01', 'Panen', '1', 'Operasional'],
    ['2', 'AK02', 'Pemeliharaan', '1', 'Operasional'],
    ['3', 'AK03', 'Transport', '1', 'Operasional'],
  ];

  const insertMany = db.transaction((data) => {
    for (const row of data) {
      insert.run(...row);
    }
  });
  insertMany(akData);
  console.log(`Seeded ${akData.length} Aspek Kerja records`);
}

function seedBlok(db) {
  console.log('Seeding Blok...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS blok (
      id TEXT PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      tahun_tanam INTEGER,
      luas REAL,
      pokok INTEGER,
      sph REAL,
      bulan_tanam TEXT,
      status_2025 TEXT,
      status_2026 TEXT,
      status_2027 TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO blok (id, kode, nama, tahun_tanam, luas, pokok, sph, bulan_tanam)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const blokData = [
    ['1', 'B01', 'Blok A', 2025, 10.5, 1050, 100, 'Januari'],
    ['2', 'B02', 'Blok B', 2025, 8.2, 820, 100, 'Februari'],
    ['3', 'B03', 'Blok C', 2024, 12.0, 1200, 100, 'Maret'],
  ];

  const insertMany = db.transaction((data) => {
    for (const row of data) {
      insert.run(...row);
    }
  });
  insertMany(blokData);
  console.log(`Seeded ${blokData.length} Blok records`);
}

function seedTransactions(db, name) {
  console.log(`Seeding ${name} transactions...`);
  db.exec(`
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
      status TEXT DEFAULT 'Pending Approval 1',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions (id, transaction_number, transaction_date, transaction_type, amount, description, coa_id, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txData = [
    ['1', `${name}-001`, '2026-01-15', `${name} Masuk`, 500000, 'Test transaction 1', '1', 'Pending Approval 1', 'admin'],
    ['2', `${name}-002`, '2026-01-20', `${name} Keluar`, 300000, 'Test transaction 2', '2', 'Fully Approved', 'admin'],
  ];

  const insertMany = db.transaction((data) => {
    for (const row of data) {
      insert.run(...row);
    }
  });
  insertMany(txData);
  console.log(`Seeded ${txData.length} ${name} transactions`);
}

async function seedUsers(db) {
  console.log('Seeding Users (admin)...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT DEFAULT (datetime('now', '+7 days')),
      last_activity TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      attempt_time TEXT DEFAULT CURRENT_TIMESTAMP,
      success INTEGER DEFAULT 0
    );
  `);

  // Hash password using bcrypt (matching the app's hashPassword function)
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const userData = [
    ['admin-001', 'admin', passwordHash, 'Administrator', 'Administrator', 'active'],
  ];

  const insertMany = db.transaction((data) => {
    for (const row of data) {
      insert.run(...row);
    }
  });
  insertMany(userData);
  console.log(`Seeded ${userData.length} users with bcrypt hash`);
}

async function main() {
  console.log('Starting test data seeding...');
  console.log(`Base Dir: ${BASE_DIR}`);
  console.log(`Data Dir: ${DATA_DIR}`);

  try {
    // Seed Users (MUST be first - app checks user count to create default admin)
    ensureDir(DATA_DIR);
    const usersDb = new Database(USERS_DB);
    await seedUsers(usersDb);
    usersDb.close();

    // Seed COA
    ensureDir(MASTER_DIR);
    const coaDb = new Database(COA_DB);
    seedCOA(coaDb);
    seedAspekKerja(coaDb);
    seedBlok(coaDb);
    coaDb.close();

    // Seed Kas transactions
    ensureDir(KAS_DIR);
    const kasDb = new Database(KAS_DB);
    seedTransactions(kasDb, 'Kas');
    kasDb.close();

    // Seed Bank transactions
    ensureDir(BANK_DIR);
    const bankDb = new Database(BANK_DB);
    seedTransactions(bankDb, 'Bank');
    bankDb.close();

    // Seed Gudang transactions
    ensureDir(GUDANG_DIR);
    const gudangDb = new Database(GUDANG_DB);
    seedTransactions(gudangDb, 'Gudang');
    gudangDb.close();

    console.log('✅ Test data seeded successfully!');
    console.log('  USERS DB:', USERS_DB);
    console.log('  COA DB:', COA_DB);
    console.log('  KAS DB:', KAS_DB);
    console.log('  BANK DB:', BANK_DB);
    console.log('  GUDANG DB:', GUDANG_DB);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

main();
