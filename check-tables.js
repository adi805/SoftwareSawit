const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('C:/Users/acer/AppData/Roaming/software-sawit/data/kas/2026/04.db'));
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log(JSON.stringify(res));
}).catch(console.error);
