#!/usr/bin/env node

/**
 * Seed Test Data for GitHub Actions Tests
 * Run this before tests to populate database
 * 
 * NOTE: Users are NOT seeded - the app auto-creates default admin user
 * if no users exist (see createDefaultAdmin in userDatabase.ts)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database paths - CORRECT paths matching the app's expected locations
const BASE_DIR = path.join(process.env.APPDATA || process.env.HOME, 'SoftwareSawit');
const DATA_DIR = path.join(BASE_DIR, 'data');

// NOTE: Users database NOT seeded - app auto-creates default admin

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

  const coaData = [
    ['1', '1-1000', 'Kas', 'Aktiva Lancar', null],
    ['2', '1-1100', 'Bank', 'Aktiva Lancar', '1'],
    ['3', '1-1200', 'Piutang', 'Aktiva Lancar', '1'],
    ['4', '2-1000', 'Utang Usaha', 'Utang Lancar', null],
    ['5', '3-1000', 'Modal', 'Ekuitas', null],
    ['6', '4-1000', 'Pendapatan', 'Pendapatan', null],
    ['7', '5-1000', 'Beban Gaji', 'Beban', null],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO coa VALUES (?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))');
  const insertMany = db.transaction((data) => {
    for (const row of data) {
      stmt.run(...row);
    }
  });
  insertMany(coaData);
  console.log('Seeded ' + coaData.length + ' COA records');
}

function seedAspekKerja(db) {
  console.log('Seeding Aspek Kerja...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS aspek_kerja (
      id TEXT PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      coa_id TEXT,
      jenis TEXT,
      status_aktif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const akData = [
    ['1', 'AK01', 'Panen', '1', 'Operasional'],
    ['2', 'AK02', 'Pemeliharaan', '1', 'Operasional'],
    ['3', 'AK03', 'Transport', '1', 'Operasional'],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO aspek_kerja VALUES (?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))');
  const insertMany = db.transaction((data) => {
    for (const row of data) {
      stmt.run(...row);
    }
  });
  insertMany(akData);
  console.log('Seeded ' + akData.length + ' Aspek Kerja records');
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

  const blokData = [
    ['1', 'B01', 'Blok A', 2025, 10.5, 1050, 100, 'Januari'],
    ['2', 'B02', 'Blok B', 2025, 8.2, 820, 100, 'Februari'],
    ['3', 'B03', 'Blok C', 2024, 12.0, 1200, 100, 'Maret'],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO blok VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, datetime("now"), datetime("now"))');
  const insertMany = db.transaction((data) => {
    for (const row of data) {
      stmt.run(...row);
    }
  });
  insertMany(blokData);
  console.log('Seeded ' + blokData.length + ' Blok records');
}

function seedTransactions(db, name) {
  console.log('Seeding ' + name + ' transactions...');
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

  const txData = [
    ['1', name + '-001', '2026-01-15', name + ' Masuk', 500000, 'Test ' + name + ' 1', '1', 'Pending Approval 1', 'admin'],
    ['2', name + '-002', '2026-01-20', name + ' Keluar', 300000, 'Test ' + name + ' 2', '2', 'Fully Approved', 'admin'],
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, datetime("now"), datetime("now"))');
  const insertMany = db.transaction((data) => {
    for (const row of data) {
      stmt.run(...row);
    }
  });
  insertMany(txData);
  console.log('Seeded ' + txData.length + ' ' + name + ' transactions');
}

function main() {
  console.log('Starting test data seeding...');
  console.log('Base Dir: ' + BASE_DIR);
  console.log('Data Dir: ' + DATA_DIR);

  try {
    // Seed COA (includes Aspek Kerja and Blok)
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

    console.log('Test data seeded successfully!');
    console.log('  COA DB: ' + COA_DB);
    console.log('  KAS DB: ' + KAS_DB);
    console.log('  BANK DB: ' + BANK_DB);
    console.log('  GUDANG DB: ' + GUDANG_DB);
    console.log('NOTE: Users DB NOT seeded - app auto-creates default admin');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
