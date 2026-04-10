const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.env.APPDATA, 'software-sawit', 'data');

async function inspectDb(dbPath, tableName) {
  if (!fs.existsSync(dbPath)) {
    return { exists: false, error: 'File not found' };
  }
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableList = tables[0]?.values.map(v => v[0]) || [];
  
  let schema = null;
  if (tableName) {
    const schemaResult = db.exec(`PRAGMA table_info(${tableName})`);
    schema = schemaResult[0]?.values.map(v => ({ name: v[1], type: v[2], notnull: v[3], dflt_value: v[4], pk: v[5] }));
  }
  
  db.close();
  return { exists: true, tables: tableList, schema };
}

async function main() {
  const results = {};
  
  const dbs = [
    { name: 'users_master', path: path.join(DATA_DIR, 'master', 'users.db'), table: 'users' },
    { name: 'coa_master', path: path.join(DATA_DIR, 'master', 'coa.db'), table: 'coa' },
    { name: 'aspek_kerja_master', path: path.join(DATA_DIR, 'master', 'aspek_kerja.db'), table: 'aspek_kerja' },
    { name: 'blok_master', path: path.join(DATA_DIR, 'master', 'blok.db'), table: 'blok' },
    { name: 'sync_db', path: path.join(DATA_DIR, 'sync', 'sync.db'), table: 'sync_queue' },
    { name: 'kas_2026_04', path: path.join(DATA_DIR, 'kas', '2026', 'kas_2026_04.db'), table: 'kas_2026_04' },
    { name: 'bank_2026_04', path: path.join(DATA_DIR, 'bank', '2026', 'bank_2026_04.db'), table: 'bank_2026_04' },
    { name: 'gudang_2026_04', path: path.join(DATA_DIR, 'gudang', '2026', 'gudang_2026_04.db'), table: 'gudang_2026_04' },
  ];
  
  for (const dbInfo of dbs) {
    results[dbInfo.name] = await inspectDb(dbInfo.path, dbInfo.table);
  }
  
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
