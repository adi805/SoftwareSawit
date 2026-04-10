const initSqlJs = require('sql.js');
const fs = require('fs');

async function check() {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync('C:/Users/acer/AppData/Roaming/software-sawit/data/kas/2026/04.db');
  const db = new SQL.Database(buffer);
  const result = db.exec("SELECT id, transaction_number, status, created_by, created_at FROM transactions");
  console.log(JSON.stringify(result, null, 2));
  db.close();
}
check();
