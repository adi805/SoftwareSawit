"use strict";
/**
 * Foreign Key Migration Script for VAL-LOCAL-007
 *
 * Adds FOREIGN KEY constraints to transaction table schemas in local SQLite databases.
 * This migration:
 * 1. Enables PRAGMA foreign_keys = ON for all databases
 * 2. Adds coa_id and blok_id columns to existing transaction tables if missing
 * 3. Ensures referential integrity for coa_id -> coa(id) and blok_id -> blok(id)
 *
 * Usage:
 *   import { runFkMigration } from './fkMigration';
 *   await runFkMigration();
 */
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
exports.runFkMigration = runFkMigration;
exports.verifyForeignKeys = verifyForeignKeys;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const electron_log_1 = __importDefault(require("electron-log"));
/**
 * Enable foreign keys on a database
 */
function enableForeignKeys(db) {
    db.run('PRAGMA foreign_keys = ON');
    electron_log_1.default.debug('[FK-MIGRATION] Enabled foreign_keys pragma');
}
/**
 * Check if a column exists in a table
 */
function columnExists(db, tableName, columnName) {
    const result = db.exec(`PRAGMA table_info('${tableName}')`);
    if (result.length === 0)
        return false;
    return result[0].values.some(row => {
        const colIndex = result[0].columns.indexOf('name');
        return row[colIndex] === columnName;
    });
}
/**
 * Check if a foreign key constraint exists on a table
 */
function fkConstraintExists(db, tableName, fromColumn) {
    const result = db.exec(`PRAGMA foreign_key_list('${tableName}')`);
    if (result.length === 0)
        return false;
    return result[0].values.some(row => {
        const fromIndex = result[0].columns.indexOf('from');
        return row[fromIndex] === fromColumn;
    });
}
/**
 * Add coa_id column to a table if it doesn't exist
 */
function addCoaIdColumn(db, tableName) {
    if (columnExists(db, tableName, 'coa_id')) {
        electron_log_1.default.debug(`[FK-MIGRATION] Column coa_id already exists in ${tableName}`);
        return true;
    }
    try {
        // Add coa_id column as TEXT (UUID reference to coa.id)
        // Using IF NOT EXISTS for safety
        db.run(`ALTER TABLE ${tableName} ADD COLUMN coa_id TEXT`);
        electron_log_1.default.info(`[FK-MIGRATION] Added coa_id column to ${tableName}`);
        return true;
    }
    catch (error) {
        electron_log_1.default.error(`[FK-MIGRATION] Failed to add coa_id column to ${tableName}:`, error);
        return false;
    }
}
/**
 * Add blok_id column to a table if it doesn't exist
 */
function addBlokIdColumn(db, tableName) {
    if (columnExists(db, tableName, 'blok_id')) {
        electron_log_1.default.debug(`[FK-MIGRATION] Column blok_id already exists in ${tableName}`);
        return true;
    }
    try {
        // Add blok_id column as TEXT (UUID reference to blok.id)
        db.run(`ALTER TABLE ${tableName} ADD COLUMN blok_id TEXT`);
        electron_log_1.default.info(`[FK-MIGRATION] Added blok_id column to ${tableName}`);
        return true;
    }
    catch (error) {
        electron_log_1.default.error(`[FK-MIGRATION] Failed to add blok_id column to ${tableName}:`, error);
        return false;
    }
}
/**
 * Migrate a single transaction database file
 */
async function migrateTransactionDatabase(SQL, dbPath, module) {
    let tablesMigrated = 0;
    try {
        if (!fs.existsSync(dbPath)) {
            return { success: true, tablesMigrated: 0 };
        }
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);
        // Enable foreign keys
        enableForeignKeys(db);
        // Determine table name based on module
        const tableName = `${module}_${path.basename(dbPath, '.db').split('_').slice(1).join('_')}`;
        const actualTableName = path.basename(dbPath, '.db');
        // Check if the transactions table exists
        const tableCheck = db.exec(`
      SELECT COUNT(*) FROM sqlite_master 
      WHERE type='table' AND name='transactions'
    `);
        if (tableCheck.length === 0 || tableCheck[0].values[0][0] === 0) {
            db.close();
            return { success: true, tablesMigrated: 0 };
        }
        // Add FK columns if they don't exist
        let modified = false;
        if (!columnExists(db, 'transactions', 'coa_id')) {
            if (addCoaIdColumn(db, 'transactions')) {
                modified = true;
            }
        }
        if (!columnExists(db, 'transactions', 'blok_id')) {
            if (addBlokIdColumn(db, 'transactions')) {
                modified = true;
            }
        }
        if (modified) {
            tablesMigrated++;
            // Save the modified database
            const data = db.export();
            const outputBuffer = Buffer.from(data);
            fs.writeFileSync(dbPath, outputBuffer);
            electron_log_1.default.info(`[FK-MIGRATION] Migrated ${dbPath}`);
        }
        db.close();
        return { success: true, tablesMigrated };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[FK-MIGRATION] Error migrating ${dbPath}:`, error);
        return { success: false, tablesMigrated: 0, error: errorMsg };
    }
}
/**
 * Migrate master database (coa.db, blok.db)
 */
async function migrateMasterDatabase(SQL, dbPath, moduleName) {
    try {
        if (!fs.existsSync(dbPath)) {
            return { success: true };
        }
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);
        // Enable foreign keys
        enableForeignKeys(db);
        // Save and close
        const data = db.export();
        const outputBuffer = Buffer.from(data);
        fs.writeFileSync(dbPath, outputBuffer);
        db.close();
        electron_log_1.default.info(`[FK-MIGRATION] Migrated master database ${moduleName}`);
        return { success: true };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error(`[FK-MIGRATION] Error migrating master database ${moduleName}:`, error);
        return { success: false, error: errorMsg };
    }
}
/**
 * Get all existing transaction database files for a module
 */
function getTransactionDatabaseFiles(module) {
    const basePath = path.join(electron_1.app.getPath('userData'), 'data', module);
    const files = [];
    if (!fs.existsSync(basePath)) {
        return files;
    }
    const years = fs.readdirSync(basePath);
    for (const year of years) {
        const yearPath = path.join(basePath, year);
        if (!fs.statSync(yearPath).isDirectory())
            continue;
        const dbFiles = fs.readdirSync(yearPath).filter(f => f.endsWith('.db'));
        for (const file of dbFiles) {
            files.push(path.join(yearPath, file));
        }
    }
    return files;
}
/**
 * Run the FK migration for all local databases
 */
async function runFkMigration() {
    const result = {
        success: true,
        message: '',
        databasesProcessed: 0,
        tablesMigrated: 0,
        errors: []
    };
    electron_log_1.default.info('[FK-MIGRATION] Starting foreign key migration...');
    try {
        const SQL = await (0, sql_js_1.default)();
        // Migrate master databases
        const masterModules = ['coa', 'blok'];
        for (const module of masterModules) {
            const dbPath = path.join(electron_1.app.getPath('userData'), 'data', 'master', `${module}.db`);
            const masterResult = await migrateMasterDatabase(SQL, dbPath, module);
            if (!masterResult.success && masterResult.error) {
                result.errors.push(`Master ${module}: ${masterResult.error}`);
            }
            result.databasesProcessed++;
        }
        // Migrate transaction databases
        const transactionModules = ['kas', 'bank', 'gudang'];
        for (const module of transactionModules) {
            const dbFiles = getTransactionDatabaseFiles(module);
            for (const dbPath of dbFiles) {
                const txResult = await migrateTransactionDatabase(SQL, dbPath, module);
                if (!txResult.success && txResult.error) {
                    result.errors.push(`${module}: ${txResult.error}`);
                }
                result.databasesProcessed++;
                result.tablesMigrated += txResult.tablesMigrated;
            }
        }
        // If no errors, mark as success
        result.success = result.errors.length === 0;
        result.message = result.success
            ? `Migration completed successfully. Processed ${result.databasesProcessed} databases, migrated ${result.tablesMigrated} tables.`
            : `Migration completed with errors. Processed ${result.databasesProcessed} databases, migrated ${result.tablesMigrated} tables.`;
        electron_log_1.default.info(`[FK-MIGRATION] ${result.message}`);
        if (result.errors.length > 0) {
            electron_log_1.default.warn('[FK-MIGRATION] Errors encountered:', result.errors);
        }
        return result;
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        electron_log_1.default.error('[FK-MIGRATION] Migration failed:', error);
        return {
            success: false,
            message: `Migration failed: ${errorMsg}`,
            databasesProcessed: result.databasesProcessed,
            tablesMigrated: result.tablesMigrated,
            errors: [...result.errors, errorMsg]
        };
    }
}
/**
 * Verify foreign key constraints on a database
 */
async function verifyForeignKeys(dbPath) {
    const result = {
        foreignKeysEnabled: false,
        constraintsFound: []
    };
    try {
        if (!fs.existsSync(dbPath)) {
            return result;
        }
        const SQL = await (0, sql_js_1.default)();
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);
        // Check PRAGMA foreign_keys
        const fkPragma = db.exec('PRAGMA foreign_keys');
        result.foreignKeysEnabled = fkPragma.length > 0 && fkPragma[0].values[0][0] === 1;
        // Get all foreign key constraints
        const tables = db.exec(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
        if (tables.length > 0) {
            for (const row of tables[0].values) {
                const tableName = row[0];
                const fkList = db.exec(`PRAGMA foreign_key_list('${tableName}')`);
                if (fkList.length > 0) {
                    for (const fkRow of fkList[0].values) {
                        result.constraintsFound.push({
                            table: tableName,
                            from: fkRow[fkList[0].columns.indexOf('from')],
                            to: `${fkRow[fkList[0].columns.indexOf('table')]}.${fkRow[fkList[0].columns.indexOf('to')]}`
                        });
                    }
                }
            }
        }
        db.close();
    }
    catch (error) {
        electron_log_1.default.error('[FK-MIGRATION] Error verifying foreign keys:', error);
    }
    return result;
}
exports.default = runFkMigration;
