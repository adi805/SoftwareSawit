const initSqlJs = require('sql.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('C:\\Users\\acer\\AppData\\Roaming\\software-sawit\\data\\users.db'));
  const result = db.exec('SELECT id, username, password_hash, role, status FROM users');
  
  if (result.length > 0) {
    console.log('Users found:');
    result[0].values.forEach(row => {
      console.log('ID:', row[0]);
      console.log('Username:', row[1]);
      console.log('Password Hash:', row[2]);
      console.log('Hash Length:', row[2].length);
      console.log('Hash Starts with $2:', row[2].startsWith('$2'));
      console.log('Role:', row[3]);
      console.log('Status:', row[4]);
      console.log('---');
    });
  } else {
    console.log('No users found in database');
  }
  
  db.close();
}).catch(err => {
  console.error('Error:', err);
});
