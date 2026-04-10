"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLES = void 0;
exports.initUserDatabase = initUserDatabase;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.validatePasswordStrength = validatePasswordStrength;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.clearAllUsers = clearAllUsers;
exports.getUserById = getUserById;
exports.getUserByUsername = getUserByUsername;
exports.getAllUsers = getAllUsers;
exports.login = login;
exports.logout = logout;
exports.validateSession = validateSession;
exports.refreshSession = refreshSession;
exports.getActiveSessions = getActiveSessions;
exports.terminateSession = terminateSession;
exports.logActivity = logActivity;
exports.getActivityLog = getActivityLog;
exports.changePassword = changePassword;
exports.adminResetPassword = adminResetPassword;
exports.getRoles = getRoles;
exports.cleanupExpiredSessions = cleanupExpiredSessions;
exports.exportUsersDatabase = exportUsersDatabase;
exports.getUsersForImport = getUsersForImport;
exports.importUsersDatabase = importUsersDatabase;
exports.getUsersDbPath = getUsersDbPath;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
const uuid_1 = require("uuid");
const crypto = __importStar(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
let db = null;
const ROLES = ['Administrator', 'Inputan Kas', 'Inputan Bank', 'Inputan Gudang', 'Approver'];
exports.ROLES = ROLES;
const DB_PATH = path.join(electron_1.app.getPath('userData'), 'data', 'users.db');
// Initialize database
async function initUserDatabase() {
    electron_log_1.default.info('[UserDB] Initializing user database...');
    try {
        const SQL = await (0, sql_js_1.default)();
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            electron_log_1.default.info(`[UserDB] Created data directory: ${dataDir}`);
        }
        // Load existing database or create new one
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            electron_log_1.default.info('[UserDB] Loaded existing database');
            // Migrate existing database to add missing columns
            migrateDatabase();
        }
        else {
            db = new SQL.Database();
            electron_log_1.default.info('[UserDB] Created new database');
        }
        // Create tables
        createTables();
        // Load login attempts from database
        loadLoginAttempts();
        // Create default admin user if no users exist
        const userCount = getUserCount();
        if (userCount === 0) {
            await createDefaultAdmin();
        }
        // Save database
        saveDatabase();
        electron_log_1.default.info('[UserDB] User database initialized successfully');
    }
    catch (error) {
        electron_log_1.default.error('[UserDB] Failed to initialize database:', error);
        throw error;
    }
}
function createTables() {
    if (!db)
        return;
    // Users table
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Sessions table (updated with last_activity for idle timeout)
    db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
    // Activity log table
    db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    // Login attempts table (for persistent lockout tracking)
    db.run(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      locked_until DATETIME,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    electron_log_1.default.info('[UserDB] Tables created');
}
function migrateDatabase() {
    if (!db)
        return;
    electron_log_1.default.info('[UserDB] Running database migrations...');
    // Check if sessions table has last_activity column
    const result = db.exec("PRAGMA table_info(sessions)");
    const columns = result.length > 0 ? result[0].values.map(row => row[1]) : [];
    if (!columns.includes('last_activity')) {
        electron_log_1.default.info('[UserDB] Migration: Adding last_activity column to sessions table');
        db.run('ALTER TABLE sessions ADD COLUMN last_activity DATETIME DEFAULT CURRENT_TIMESTAMP');
        saveDatabase();
        electron_log_1.default.info('[UserDB] Migration complete: last_activity column added');
    }
    else {
        electron_log_1.default.info('[UserDB] Migration: sessions table already has last_activity column');
    }
}
async function createDefaultAdmin() {
    if (!db)
        return;
    const adminId = (0, uuid_1.v4)();
    const passwordHash = await hashPassword('Admin123!');
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [adminId, 'admin', passwordHash, 'Administrator', 'Administrator', 'active', now, now]);
    electron_log_1.default.info('[UserDB] Default admin user created');
}
function getUserCount() {
    if (!db)
        return 0;
    const result = db.exec('SELECT COUNT(*) as count FROM users');
    return result.length > 0 ? result[0].values[0][0] : 0;
}
function saveDatabase() {
    if (!db)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}
// Password utilities - using bcrypt for secure hashing
const BCRYPT_SALT_ROUNDS = 10;
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, BCRYPT_SALT_ROUNDS);
}
async function verifyPassword(password, hash) {
    // Handle legacy SHA-256 hashes (for existing data migration)
    if (hash.length === 64 && !hash.startsWith('$2')) {
        // Legacy SHA-256 hash - verify against it but don't accept for new hashes
        const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
        return legacyHash === hash;
    }
    return bcryptjs_1.default.compare(password, hash);
}
function validatePasswordStrength(password) {
    if (password.length < 8) {
        return { valid: false, message: 'Password minimal 8 karakter' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password harus mengandung huruf besar' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password harus mengandung angka' };
    }
    return { valid: true, message: 'Password valid' };
}
// User CRUD operations
async function createUser(username, password, fullName, role) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Check if username exists
    const existing = db.exec(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
        return { success: false, message: 'Username sudah digunakan' };
    }
    // Validate role
    if (!ROLES.includes(role)) {
        return { success: false, message: 'Role tidak valid' };
    }
    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
        return { success: false, message: passwordValidation.message };
    }
    const userId = (0, uuid_1.v4)();
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    db.run(`INSERT INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, username, passwordHash, fullName, role, 'active', now, now]);
    saveDatabase();
    const user = {
        id: userId,
        username,
        password_hash: '',
        full_name: fullName,
        role,
        status: 'active',
        last_login: null,
        created_at: now,
        updated_at: now,
    };
    logActivity(null, 'USER_CREATED', `Created user: ${username}`, null);
    return { success: true, message: 'User berhasil dibuat', user };
}
function updateUser(userId, fullName, role) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Validate role
    if (!ROLES.includes(role)) {
        return { success: false, message: 'Role tidak valid' };
    }
    const now = new Date().toISOString();
    db.run(`UPDATE users SET full_name = ?, role = ?, updated_at = ? WHERE id = ?`, [fullName, role, now, userId]);
    saveDatabase();
    logActivity(null, 'USER_UPDATED', `Updated user ID: ${userId}`, null);
    return { success: true, message: 'User berhasil diupdate' };
}
function deleteUser(userId, requestingUserId) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Prevent self-delete
    if (userId === requestingUserId) {
        return { success: false, message: 'Tidak dapat menghapus akun sendiri' };
    }
    // Check if this is the last admin
    const user = getUserById(userId);
    if (user && user.role === 'Administrator') {
        const adminCount = db.exec(`SELECT COUNT(*) FROM users WHERE role = 'Administrator' AND status = 'active'`);
        if (adminCount[0].values[0][0] <= 1) {
            return { success: false, message: 'Tidak dapat menghapus admin terakhir' };
        }
    }
    // Delete sessions for this user
    db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    // Delete user
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    saveDatabase();
    logActivity(null, 'USER_DELETED', `Deleted user ID: ${userId}`, null);
    return { success: true, message: 'User berhasil dihapus' };
}
function clearAllUsers() {
    if (!db) {
        return { success: false, message: 'Database not initialized', deletedCount: 0 };
    }
    const adminCount = db.exec(`SELECT COUNT(*) FROM users WHERE role = 'Administrator' AND status = 'active'`);
    const adminCountNum = adminCount.length > 0 && adminCount[0].values.length > 0 ? adminCount[0].values[0][0] : 0;
    if (adminCountNum <= 1) {
        return { success: false, message: 'Tidak dapat menghapus semua user. Minimal harus ada 1 admin.', deletedCount: 0 };
    }
    const countResult = db.exec('SELECT COUNT(*) as count FROM users');
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    if (count === 0) {
        return { success: true, message: 'Tidak ada data User untuk dihapus', deletedCount: 0 };
    }
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM users WHERE role != "Administrator"');
    saveDatabase();
    logActivity(null, 'USERS_CLEARED', `Cleared all non-admin users. Deleted ${count - adminCountNum} records.`, null);
    return { success: true, message: `Berhasil menghapus ${count - adminCountNum} data User (admin dipertahankan)`, deletedCount: count - adminCountNum };
}
function getUserById(userId) {
    if (!db)
        return null;
    const result = db.exec(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return rowToUser(columns, row);
}
function getUserByUsername(username) {
    if (!db)
        return null;
    const result = db.exec(`SELECT * FROM users WHERE username = ?`, [username]);
    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    return rowToUser(columns, row);
}
function getAllUsers() {
    if (!db)
        return [];
    const result = db.exec(`SELECT * FROM users ORDER BY created_at DESC`);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => rowToUser(result[0].columns, row));
}
function rowToUser(columns, row) {
    const user = {};
    columns.forEach((col, idx) => {
        user[col] = row[idx];
    });
    return user;
}
// Session management
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const SESSION_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_SESSION_LIFETIME = 60 * 60 * 1000; // 60 minutes (maximum session lifetime regardless of activity)
// In-memory cache for login attempts (loaded from DB on init)
const loginAttempts = new Map();
// Load login attempts from database
function loadLoginAttempts() {
    if (!db)
        return;
    const result = db.exec(`SELECT * FROM login_attempts`);
    if (result.length > 0) {
        result[0].values.forEach((row) => {
            const username = row[1];
            const attemptCount = row[2];
            const lockedUntil = row[3];
            const attempt = {
                count: attemptCount,
                lockedUntil: lockedUntil ? new Date(lockedUntil).getTime() : null,
            };
            // Only load if lockout is still active
            if (attempt.lockedUntil && attempt.lockedUntil > Date.now()) {
                loginAttempts.set(username, attempt);
            }
            else if (attempt.lockedUntil === null) {
                loginAttempts.set(username, attempt);
            }
        });
    }
    electron_log_1.default.info(`[UserDB] Loaded ${loginAttempts.size} login attempt records`);
}
// Save or update login attempt for username
function saveLoginAttempt(username, attempt) {
    if (!db)
        return;
    const now = new Date().toISOString();
    // Check if record exists
    const existing = db.exec(`SELECT id FROM login_attempts WHERE username = ?`, [username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
        // Update existing
        db.run(`UPDATE login_attempts SET attempt_count = ?, locked_until = ?, last_attempt = ? WHERE username = ?`, [attempt.count, attempt.lockedUntil ? new Date(attempt.lockedUntil).toISOString() : null, now, username]);
    }
    else {
        // Insert new
        db.run(`INSERT INTO login_attempts (id, username, attempt_count, locked_until, last_attempt) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), username, attempt.count, attempt.lockedUntil ? new Date(attempt.lockedUntil).toISOString() : null, now]);
    }
    saveDatabase();
}
// Remove login attempt record (after successful login)
function removeLoginAttempt(username) {
    if (!db)
        return;
    db.run(`DELETE FROM login_attempts WHERE username = ?`, [username]);
    saveDatabase();
}
async function login(username, password) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    // Check lockout
    const attempt = loginAttempts.get(username);
    if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
        const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 1000 / 60);
        return { success: false, message: `Akun terkunci. Coba lagi dalam ${remaining} menit` };
    }
    const user = getUserByUsername(username);
    if (!user) {
        await recordFailedLogin(username);
        return { success: false, message: 'Username atau password salah' };
    }
    if (user.status !== 'active') {
        return { success: false, message: 'Akun tidak aktif' };
    }
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
        await recordFailedLogin(username);
        return { success: false, message: 'Username atau password salah' };
    }
    // Clear failed attempts on successful login
    loginAttempts.delete(username);
    removeLoginAttempt(username);
    // Update last login
    const now = new Date().toISOString();
    db.run(`UPDATE users SET last_login = ? WHERE id = ?`, [now, user.id]);
    saveDatabase();
    // Create session
    const token = (0, uuid_1.v4)();
    const sessionId = (0, uuid_1.v4)();
    const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
    db.run(`INSERT INTO sessions (id, user_id, token, created_at, last_activity, expires_at) VALUES (?, ?, ?, ?, ?, ?)`, [sessionId, user.id, token, now, now, expiresAt]);
    saveDatabase();
    logActivity(user.id, 'LOGIN', 'User logged in', null);
    return {
        success: true,
        message: 'Login berhasil',
        token,
        user: { ...user, password_hash: '' },
    };
}
async function recordFailedLogin(username) {
    let attempt = loginAttempts.get(username);
    if (!attempt) {
        attempt = { count: 0, lockedUntil: null };
    }
    attempt.count++;
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        attempt.lockedUntil = Date.now() + LOCKOUT_DURATION;
        electron_log_1.default.warn(`[UserDB] Account locked for ${username} due to ${attempt.count} failed attempts`);
        // Log the lockout
        if (db) {
            db.run(`INSERT INTO activity_log (id, user_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)`, [(0, uuid_1.v4)(), null, 'ACCOUNT_LOCKED', `Account locked for ${username} after ${attempt.count} failed attempts`, new Date().toISOString()]);
        }
    }
    loginAttempts.set(username, attempt);
    saveLoginAttempt(username, attempt);
}
function logout(token, userId) {
    if (!db)
        return { success: false, message: 'Database not initialized' };
    db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
    saveDatabase();
    logActivity(userId, 'LOGOUT', 'User logged out', null);
    return { success: true, message: 'Logout berhasil' };
}
function validateSession(token) {
    if (!db)
        return { valid: false };
    const result = db.exec(`
    SELECT s.*, u.id as user_id, u.username, u.full_name, u.role, u.status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `, [token]);
    if (result.length === 0 || result[0].values.length === 0) {
        return { valid: false };
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    const session = {};
    const user = {};
    columns.forEach((col, idx) => {
        if (col.startsWith('user_') || ['id', 'username', 'full_name', 'role', 'status'].includes(col)) {
            user[col.replace('user_', '')] = row[idx];
        }
        else {
            session[col] = row[idx];
        }
    });
    const sessionObj = session;
    // Check if session has expired based on expires_at
    const expiresAt = new Date(sessionObj.expires_at).getTime();
    if (expiresAt < Date.now()) {
        // Session expired - delete it
        db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        saveDatabase();
        logActivity(sessionObj.user_id, 'SESSION_EXPIRED', 'Session expired due to max lifetime', null);
        return { valid: false, expired: true };
    }
    // Check if session has exceeded max lifetime (server-side idle timeout enforcement)
    const createdAt = new Date(sessionObj.created_at).getTime();
    if (Date.now() - createdAt > MAX_SESSION_LIFETIME) {
        // Session exceeded max lifetime - delete it
        db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        saveDatabase();
        logActivity(sessionObj.user_id, 'SESSION_EXPIRED', 'Session expired due to max lifetime', null);
        return { valid: false, expired: true };
    }
    // Update last_activity to track idle time
    const now = new Date().toISOString();
    db.run(`UPDATE sessions SET last_activity = ? WHERE token = ?`, [now, token]);
    saveDatabase();
    return {
        valid: true,
        user: user,
        session: sessionObj,
    };
}
function refreshSession(token) {
    if (!db)
        return { success: false };
    // First validate the session to check if it's still valid
    const result = db.exec(`
    SELECT s.*, u.id as user_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `, [token]);
    if (result.length === 0 || result[0].values.length === 0) {
        return { success: false };
    }
    const row = result[0].values[0];
    const columns = result[0].columns;
    const session = {};
    columns.forEach((col, idx) => {
        session[col] = row[idx];
    });
    const sessionObj = session;
    // Check if session has exceeded max lifetime
    const createdAt = new Date(sessionObj.created_at).getTime();
    if (Date.now() - createdAt > MAX_SESSION_LIFETIME) {
        // Session exceeded max lifetime - delete it
        db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
        saveDatabase();
        logActivity(sessionObj.user_id, 'SESSION_EXPIRED', 'Session expired due to max lifetime during refresh', null);
        return { success: false, expired: true };
    }
    // Update last_activity and extend expires_at
    const now = new Date().toISOString();
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
    db.run(`UPDATE sessions SET last_activity = ?, expires_at = ? WHERE token = ?`, [now, newExpiresAt, token]);
    saveDatabase();
    return { success: true, newExpiresAt };
}
function getActiveSessions() {
    if (!db)
        return [];
    const result = db.exec(`
    SELECT s.*, u.username, u.full_name, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > datetime('now')
    ORDER BY s.created_at DESC
  `);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const obj = {};
        result[0].columns.forEach((col, idx) => {
            if (['username', 'full_name', 'role'].includes(col)) {
                if (!obj.user)
                    obj.user = {};
                obj.user[col] = row[idx];
            }
            else {
                obj[col] = row[idx];
            }
        });
        return obj;
    });
}
function terminateSession(sessionId) {
    if (!db)
        return { success: false, message: 'Database not initialized' };
    db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    saveDatabase();
    logActivity(null, 'SESSION_TERMINATED', `Session ${sessionId} terminated by admin`, null);
    return { success: true, message: 'Session berhasil dihentikan' };
}
// Activity logging
function logActivity(userId, action, details, ipAddress) {
    if (!db)
        return;
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    db.run(`INSERT INTO activity_log (id, user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [id, userId, action, details, ipAddress, now]);
    // Don't save on every log entry for performance - batch saves handled elsewhere
}
function getActivityLog(userId, limit = 100) {
    if (!db)
        return [];
    let query = `SELECT * FROM activity_log`;
    const params = [];
    if (userId) {
        query += ` WHERE user_id = ?`;
        params.push(userId);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(String(limit));
    const result = db.exec(query, params);
    if (result.length === 0)
        return [];
    return result[0].values.map((row) => {
        const obj = {};
        result[0].columns.forEach((col, idx) => {
            obj[col] = row[idx];
        });
        return obj;
    });
}
// Password change
async function changePassword(userId, oldPassword, newPassword) {
    if (!db)
        return { success: false, message: 'Database not initialized' };
    const user = getUserById(userId);
    if (!user)
        return { success: false, message: 'User tidak ditemukan' };
    // Verify old password
    const passwordValid = await verifyPassword(oldPassword, user.password_hash);
    if (!passwordValid) {
        logActivity(userId, 'PASSWORD_CHANGE_FAILED', 'Failed password change - incorrect old password', null);
        return { success: false, message: 'Password lama salah' };
    }
    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        logActivity(userId, 'PASSWORD_CHANGE_FAILED', `Failed password change - weak password: ${passwordValidation.message}`, null);
        return { success: false, message: passwordValidation.message };
    }
    // Update password
    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    db.run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [newHash, now, userId]);
    saveDatabase();
    logActivity(userId, 'PASSWORD_CHANGED', 'Password changed successfully', null);
    return { success: true, message: 'Password berhasil diubah' };
}
async function adminResetPassword(adminId, targetUserId, newPassword) {
    if (!db)
        return { success: false, message: 'Database not initialized' };
    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        return { success: false, message: passwordValidation.message };
    }
    const targetUser = getUserById(targetUserId);
    if (!targetUser)
        return { success: false, message: 'User tidak ditemukan' };
    // Update password
    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    db.run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [newHash, now, targetUserId]);
    saveDatabase();
    logActivity(adminId, 'PASSWORD_RESET', `Admin reset password for user: ${targetUser.username}`, null);
    return { success: true, message: 'Password berhasil direset' };
}
// Get roles
function getRoles() {
    return ROLES;
}
// Cleanup expired sessions periodically
function cleanupExpiredSessions() {
    if (!db)
        return;
    db.run(`DELETE FROM sessions WHERE expires_at < datetime('now')`);
    saveDatabase();
}
// Export users database (copy to target path)
function exportUsersDatabase(targetPath) {
    if (!db) {
        return { success: false, message: 'Database not initialized' };
    }
    try {
        // Ensure directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        // Copy the database file
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(targetPath, buffer);
        logActivity(null, 'USER_DB_EXPORTED', `Exported users database to: ${targetPath}`, null);
        electron_log_1.default.info(`[UserDB] Exported database to: ${targetPath}`);
        return { success: true, message: 'Database berhasil di-export' };
    }
    catch (error) {
        electron_log_1.default.error('[UserDB] Export failed:', error);
        return { success: false, message: `Export gagal: ${error}` };
    }
}
// Get users for import conflict detection
function getUsersForImport(sourceDb) {
    const sourceUsers = sourceDb.exec(`SELECT * FROM users`);
    if (sourceUsers.length === 0) {
        return { users: [], conflicts: [] };
    }
    const users = sourceUsers[0].values.map((row) => rowToUser(sourceUsers[0].columns, row));
    // Find conflicts with existing users
    const conflicts = [];
    const existingUsernames = new Set(getAllUsers().map(u => u.username));
    for (const user of users) {
        if (existingUsernames.has(user.username)) {
            conflicts.push(user);
        }
    }
    return { users, conflicts };
}
// Import users database (merge from source)
async function importUsersDatabase(sourcePath, conflictResolution) {
    if (!db) {
        return { success: false, message: 'Database not initialized', imported: 0, conflicts: 0 };
    }
    try {
        // Read source database
        if (!fs.existsSync(sourcePath)) {
            return { success: false, message: 'File tidak ditemukan', imported: 0, conflicts: 0 };
        }
        const sourceBuffer = fs.readFileSync(sourcePath);
        // Validate it's a valid SQLite database
        if (sourceBuffer.length < 16 || !sourceBuffer.slice(0, 16).toString().includes('SQLite')) {
            return { success: false, message: 'File bukan database SQLite yang valid', imported: 0, conflicts: 0 };
        }
        const SQL = await (0, sql_js_1.default)();
        const sourceDb = new SQL.Database(sourceBuffer);
        // Get users from source
        const sourceUsers = sourceDb.exec(`SELECT * FROM users`);
        if (sourceUsers.length === 0) {
            sourceDb.close();
            return { success: false, message: 'Database tidak memiliki data user', imported: 0, conflicts: 0 };
        }
        const users = sourceUsers[0].values.map((row) => rowToUser(sourceUsers[0].columns, row));
        // Check for conflicts
        const existingUsers = getAllUsers();
        const existingUsernames = new Set(existingUsers.map(u => u.username));
        let imported = 0;
        let conflicts = 0;
        for (const user of users) {
            const exists = existingUsernames.has(user.username);
            if (exists && conflictResolution === 'skip') {
                conflicts++;
                continue;
            }
            if (exists && conflictResolution === 'overwrite') {
                // Update existing user
                db.run(`UPDATE users SET full_name = ?, role = ?, status = ?, updated_at = ? WHERE username = ?`, [user.full_name, user.role, user.status, new Date().toISOString(), user.username]);
                imported++;
            }
            else if (exists && conflictResolution === 'merge') {
                // Merge: keep existing data but update role if different
                const existing = existingUsers.find(u => u.username === user.username);
                if (existing && existing.role !== user.role && user.role !== 'Administrator') {
                    db.run(`UPDATE users SET role = ?, updated_at = ? WHERE username = ?`, [user.role, new Date().toISOString(), user.username]);
                }
                imported++;
            }
            else {
                // New user - insert
                const userId = user.id || (0, uuid_1.v4)();
                const now = new Date().toISOString();
                db.run(`INSERT INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, user.username, user.password_hash, user.full_name, user.role, user.status, now, now]);
                imported++;
            }
        }
        saveDatabase();
        sourceDb.close();
        logActivity(null, 'USER_DB_IMPORTED', `Imported ${imported} users from: ${sourcePath}, ${conflicts} conflicts resolved as ${conflictResolution}`, null);
        electron_log_1.default.info(`[UserDB] Imported ${imported} users from ${sourcePath}, ${conflicts} conflicts`);
        return {
            success: true,
            message: `Berhasil import ${imported} user${imported !== 1 ? 's' : ''}${conflicts > 0 ? `, ${conflicts} conflict dilewati` : ''}`,
            imported,
            conflicts
        };
    }
    catch (error) {
        electron_log_1.default.error('[UserDB] Import failed:', error);
        return { success: false, message: `Import gagal: ${error}`, imported: 0, conflicts: 0 };
    }
}
// Get users database path
function getUsersDbPath() {
    return DB_PATH;
}
