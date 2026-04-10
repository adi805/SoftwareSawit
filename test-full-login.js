const initSqlJs = require('sql.js');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Simulate the database operations
const DB_PATH = 'C:\\Users\\acer\\AppData\\Roaming\\software-sawit\\data\\users.db';

async function verifyPassword(password, hash) {
  // Handle legacy SHA-256 hashes
  if (hash.length === 64 && !hash.startsWith('$2')) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    console.log('Legacy hash check:', legacyHash === hash);
    return legacyHash === hash;
  }
  return bcrypt.compare(password, hash);
}

async function getUserByUsername(username, db) {
  const result = db.exec(`SELECT id, username, password_hash, full_name, role, status FROM users WHERE username = '${username}'`);
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  const row = result[0].values[0];
  return {
    id: row[0],
    username: row[1],
    password_hash: row[2],
    full_name: row[3],
    role: row[4],
    status: row[5]
  };
}

async function login(username, password) {
  const SQL = await initSqlJs();
  const dbBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(dbBuffer);
  
  console.log('[TEST] Starting login test...');
  console.log('[TEST] Username:', username);
  console.log('[TEST] Password:', password);
  
  const user = await getUserByUsername(username, db);
  console.log('[TEST] User found:', user !== null);
  
  if (!user) {
    db.close();
    return { success: false, message: 'User not found' };
  }
  
  console.log('[TEST] User status:', user.status);
  
  if (user.status !== 'active') {
    db.close();
    return { success: false, message: 'User not active' };
  }
  
  const passwordValid = await verifyPassword(password, user.password_hash);
  console.log('[TEST] Password valid:', passwordValid);
  
  db.close();
  
  if (!passwordValid) {
    return { success: false, message: 'Invalid password' };
  }
  
  return { success: true, message: 'Login successful', user };
}

async function main() {
  const result = await login('admin', 'Admin123!');
  console.log('[TEST] Final result:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('[TEST] Error:', err);
});
