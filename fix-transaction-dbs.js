const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const basePath = 'C:/Users/acer/AppData/Roaming/software-sawit/data';
const modules = ['kas', 'bank', 'gudang'];

async function fixDatabases() {
  const SQL = await initSqlJs();
  const year = 2026;
  const month = '04';

  for (const module of modules) {
    const dbPath = path.join(basePath, module, String(year), `${month}.db`);
    if (!fs.existsSync(dbPath)) {
      console.log(`Skipping ${dbPath} - does not exist`);
      continue;
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    // Create missing reference tables with columns expected by queries
    db.run(`
      CREATE TABLE IF NOT EXISTS coa (
        id TEXT PRIMARY KEY,
        kode TEXT,
        nama TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS aspek_kerja (
        id TEXT PRIMARY KEY,
        kode TEXT,
        nama TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS blok (
        id TEXT PRIMARY KEY,
        kode_blok TEXT,
        nama TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT
      )
    `);

    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    db.close();
    console.log(`Fixed ${dbPath}`);
  }
}

fixDatabases().catch(console.error);
