#!/usr/bin/env node

/**
 * Seed Test Data for GitHub Actions Tests
 * Uses sql.js (pure JavaScript SQLite)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const BASE_DIR = path.join(process.env.APPDATA || process.env.HOME, 'SoftwareSawit');
const DATA_DIR = path.join(BASE_DIR, 'data');

const MASTER_DIR = path.join(DATA_DIR, 'master');
const COA_DB = path.join(MASTER_DIR, 'coa.db');

const d = new Date();
const YEAR = d.getFullYear();
const MONTH = String(d.getMonth() + 1).padStart(2, '0');

const KAS_DB = path.join(DATA_DIR, 'kas', String(YEAR), MONTH + '.db');
const BANK_DB = path.join(DATA_DIR, 'bank', String(YEAR), MONTH + '.db');
const GUDANG_DB = path.join(DATA_DIR, 'gudang', String(YEAR), MONTH + '.db');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveDb(db, filepath) {
  const data = db.export();
  fs.writeFileSync(filepath, Buffer.from(data));
  console.log('Saved: ' + filepath);
}

initSqlJs().then(function(SQL) {
  console.log('Starting test data seeding...');
  console.log('Base Dir: ' + BASE_DIR);
  
  try {
    // COA
    ensureDir(MASTER_DIR);
    const coaDb = new SQL.Database();
    coaDb.run('CREATE TABLE coa (id TEXT,kode TEXT,nama TEXT,tipe TEXT,parent_id TEXT,status_aktif INTEGER,created_at TEXT,updated_at TEXT)');
    [
      ['1','1-1000','Kas','Aktiva Lancar',null],
      ['2','1-1100','Bank','Aktiva Lancar','1'],
      ['3','1-1200','Piutang','Aktiva Lancar','1'],
      ['4','2-1000','Utang Usaha','Utang Lancar',null],
      ['5','3-1000','Modal','Ekuitas',null],
      ['6','4-1000','Pendapatan','Pendapatan',null],
      ['7','5-1000','Beban Gaji','Beban',null]
    ].forEach(function(r) {
      coaDb.run('INSERT INTO coa VALUES (?,?,?,?,?,1,datetime("now"),datetime("now"))', r);
    });
    
    // Aspek Kerja
    coaDb.run('CREATE TABLE aspek_kerja (id TEXT,kode TEXT,nama TEXT,coa_id TEXT,jenis TEXT,status_aktif INTEGER,created_at TEXT,updated_at TEXT)');
    [['1','AK01','Panen','1','Operasional'],['2','AK02','Pemeliharaan','1','Operasional'],['3','AK03','Transport','1','Operasional']].forEach(function(r) {
      coaDb.run('INSERT INTO aspek_kerja VALUES (?,?,?,?,?,1,datetime("now"),datetime("now"))', r);
    });
    
    // Blok
    coaDb.run('CREATE TABLE blok (id TEXT,kode TEXT,nama TEXT,tahun_tanam INTEGER,luas REAL,pokok INTEGER,sph REAL,bulan_tanam TEXT)');
    [['1','B01','Blok A',2025,10.5,1050,100,'Januari'],['2','B02','Blok B',2025,8.2,820,100,'Februari'],['3','B03','Blok C',2024,12.0,1200,100,'Maret']].forEach(function(r) {
      coaDb.run('INSERT INTO blok VALUES (?,?,?,?,?,?,?,?)', r);
    });
    
    saveDb(coaDb, COA_DB);
    coaDb.close();
    console.log('Seeded COA, Aspek Kerja, Blok');
    
    // Kas
    ensureDir(path.join(DATA_DIR, 'kas', String(YEAR)));
    const kasDb = new SQL.Database();
    kasDb.run('CREATE TABLE transactions (id TEXT,transaction_number TEXT,transaction_date TEXT,transaction_type TEXT,amount REAL,description TEXT,coa_id TEXT,aspek_kerja_id TEXT,blok_id TEXT,status TEXT,created_by TEXT)');
    [['1','KAS-001','2026-01-15','Kas Masuk',500000,'Test 1','1','Pending Approval 1','admin'],['2','KAS-002','2026-01-20','Kas Keluar',300000,'Test 2','2','Fully Approved','admin']].forEach(function(r) {
      kasDb.run('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?)', r);
    });
    saveDb(kasDb, KAS_DB);
    kasDb.close();
    console.log('Seeded Kas transactions');
    
    // Bank
    ensureDir(path.join(DATA_DIR, 'bank', String(YEAR)));
    const bankDb = new SQL.Database();
    bankDb.run('CREATE TABLE transactions (id TEXT,transaction_number TEXT,transaction_date TEXT,transaction_type TEXT,amount REAL,description TEXT,coa_id TEXT,aspek_kerja_id TEXT,blok_id TEXT,status TEXT,created_by TEXT)');
    [['1','BANK-001','2026-01-15','Bank Masuk',500000,'Test 1','1','Pending Approval 1','admin'],['2','BANK-002','2026-01-20','Bank Keluar',300000,'Test 2','2','Fully Approved','admin']].forEach(function(r) {
      bankDb.run('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?)', r);
    });
    saveDb(bankDb, BANK_DB);
    bankDb.close();
    console.log('Seeded Bank transactions');
    
    // Gudang
    ensureDir(path.join(DATA_DIR, 'gudang', String(YEAR)));
    const gudangDb = new SQL.Database();
    gudangDb.run('CREATE TABLE transactions (id TEXT,transaction_number TEXT,transaction_date TEXT,transaction_type TEXT,amount REAL,description TEXT,coa_id TEXT,aspek_kerja_id TEXT,blok_id TEXT,status TEXT,created_by TEXT)');
    [['1','GUDANG-001','2026-01-15','Gudang Masuk',500000,'Test 1','1','Pending Approval 1','admin'],['2','GUDANG-002','2026-01-20','Gudang Keluar',300000,'Test 2','2','Fully Approved','admin']].forEach(function(r) {
      gudangDb.run('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?)', r);
    });
    saveDb(gudangDb, GUDANG_DB);
    gudangDb.close();
    console.log('Seeded Gudang transactions');
    
    console.log('Test data seeded successfully!');
    console.log('NOTE: Users DB NOT seeded - app auto-creates default admin');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
}).catch(function(err) {
  console.error('Failed to init sql.js: ' + err.message);
  process.exit(1);
});
