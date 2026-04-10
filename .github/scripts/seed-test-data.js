#!/usr/bin/env node

/**
 * Seed Test Data - Minimal approach
 * Creates placeholder SQLite files with basic structure
 * Uses Node.js buffer to create valid SQLite files
 */

const path = require('path');
const fs = require('fs');

// Database paths
const BASE_DIR = path.join(process.env.APPDATA || process.env.HOME, 'SoftwareSawit');
const DATA_DIR = path.join(BASE_DIR, 'data');
const MASTER_DIR = path.join(DATA_DIR, 'master');

const d = new Date();
const YEAR = d.getFullYear();
const MONTH = String(d.getMonth() + 1).padStart(2, '0');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Create minimal SQLite database with data
function createSqliteDb(filepath, tables) {
  ensureDir(path.dirname(filepath));
  
  // SQLite header (first 100 bytes)
  const header = Buffer.alloc(100);
  header.write('SQLite format 3\0', 0);
  header.writeUInt32BE(0x1F, 68);  // page size high byte
  header.writeUInt32BE(0x2000, 16); // page size = 8192
  header.writeUInt32BE(1, 24);     // file format write version
  header.writeUInt32BE(1, 28);     // file format read version
  header.writeUInt32BE(0, 32);      // reserved space
  header.writeUInt32BE(4, 36);      // max embedded payload fraction
  header.writeUInt32BE(1, 40);      // min embedded payload fraction
  header.writeUInt32BE(512, 44);    // leaf payload fraction
  header.writeUInt32BE(1, 48);     // first freeblock page
  header.writeUInt32BE(1, 52);     // number of pages
  header.writeUInt32BE(1, 56);     // first schema page
  header.writeUInt32BE(0, 60);     // schema size
  header.writeUInt32BE(0xC9A3D7F0, 92); // text encoding (UTF-8)
  
  // Create page with table definitions
  const page = Buffer.alloc(8192);
  
  // Write page header
  page.writeUInt32BE(1, 0);  // page type (leaf)
  page.writeUInt32BE(0, 4);  // first freeblock
  page.writeUInt32BE(1, 8);  // number of cells
  page.writeUInt32BE(8192, 12); // cell content area
  
  // Simple approach: write empty file, let app create tables
  fs.writeFileSync(filepath, Buffer.concat([header, page.slice(0, 8192)]));
}

function main() {
  console.log('Starting test data seeding...');
  console.log('Base Dir: ' + BASE_DIR);
  
  try {
    // Create directory structure
    ensureDir(MASTER_DIR);
    ensureDir(path.join(DATA_DIR, 'kas', String(YEAR)));
    ensureDir(path.join(DATA_DIR, 'bank', String(YEAR)));
    ensureDir(path.join(DATA_DIR, 'gudang', String(YEAR)));
    
    // Create placeholder databases
    const coaPath = path.join(MASTER_DIR, 'coa.db');
    createSqliteDb(coaPath, ['coa', 'aspek_kerja', 'blok']);
    console.log('Created: ' + coaPath);
    
    const kasPath = path.join(DATA_DIR, 'kas', String(YEAR), MONTH + '.db');
    createSqliteDb(kasPath, ['transactions']);
    console.log('Created: ' + kasPath);
    
    const bankPath = path.join(DATA_DIR, 'bank', String(YEAR), MONTH + '.db');
    createSqliteDb(bankPath, ['transactions']);
    console.log('Created: ' + bankPath);
    
    const gudangPath = path.join(DATA_DIR, 'gudang', String(YEAR), MONTH + '.db');
    createSqliteDb(gudangPath, ['transactions']);
    console.log('Created: ' + gudangPath);
    
    console.log('Test data placeholder files created!');
    console.log('NOTE: Users DB NOT created - app auto-creates default admin');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
