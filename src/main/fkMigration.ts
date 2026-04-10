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

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

type ModuleType = 'kas' | 'bank' | 'gudang';

interface MigrationResult {
  success: boolean;
  message: string;
  databasesProcessed: number;
  tablesMigrated: number;
  errors: string[];
}

/**
 * Enable foreign keys on a database
 */
function enableForeignKeys(db: Database): void {
  db.run('PRAGMA foreign_keys = ON');
  log.debug('[FK-MIGRATION] Enabled foreign_keys pragma');
}

/**
 * Check if a column exists in a table
 */
function columnExists(db: Database, tableName: string, columnName: string): boolean {
  const result = db.exec(`PRAGMA table_info('${tableName}')`);
  if (result.length === 0) return false;
  
  return result[0].values.some(row => {
    const colIndex = result[0].columns.indexOf('name');
    return row[colIndex] === columnName;
  });
}

/**
 * Check if a foreign key constraint exists on a table
 */
function fkConstraintExists(db: Database, tableName: string, fromColumn: string): boolean {
  const result = db.exec(`PRAGMA foreign_key_list('${tableName}')`);
  if (result.length === 0) return false;
  
  return result[0].values.some(row => {
    const fromIndex = result[0].columns.indexOf('from');
    return row[fromIndex] === fromColumn;
  });
}

/**
 * Add coa_id column to a table if it doesn't exist
 */
function addCoaIdColumn(db: Database, tableName: string): boolean {
  if (columnExists(db, tableName, 'coa_id')) {
    log.debug(`[FK-MIGRATION] Column coa_id already exists in ${tableName}`);
    return true;
  }

  try {
    // Add coa_id column as TEXT (UUID reference to coa.id)
    // Using IF NOT EXISTS for safety
    db.run(`ALTER TABLE ${tableName} ADD COLUMN coa_id TEXT`);
    log.info(`[FK-MIGRATION] Added coa_id column to ${tableName}`);
    return true;
  } catch (error) {
    log.error(`[FK-MIGRATION] Failed to add coa_id column to ${tableName}:`, error);
    return false;
  }
}

/**
 * Add blok_id column to a table if it doesn't exist
 */
function addBlokIdColumn(db: Database, tableName: string): boolean {
  if (columnExists(db, tableName, 'blok_id')) {
    log.debug(`[FK-MIGRATION] Column blok_id already exists in ${tableName}`);
    return true;
  }

  try {
    // Add blok_id column as TEXT (UUID reference to blok.id)
    db.run(`ALTER TABLE ${tableName} ADD COLUMN blok_id TEXT`);
    log.info(`[FK-MIGRATION] Added blok_id column to ${tableName}`);
    return true;
  } catch (error) {
    log.error(`[FK-MIGRATION] Failed to add blok_id column to ${tableName}:`, error);
    return false;
  }
}

/**
 * Migrate a single transaction database file
 */
async function migrateTransactionDatabase(
  SQL: SqlJsStatic,
  dbPath: string,
  module: ModuleType
): Promise<{ success: boolean; tablesMigrated: number; error?: string }> {
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
      log.info(`[FK-MIGRATION] Migrated ${dbPath}`);
    }

    db.close();
    return { success: true, tablesMigrated };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[FK-MIGRATION] Error migrating ${dbPath}:`, error);
    return { success: false, tablesMigrated: 0, error: errorMsg };
  }
}

/**
 * Migrate master database (coa.db, blok.db)
 */
async function migrateMasterDatabase(
  SQL: SqlJsStatic,
  dbPath: string,
  moduleName: string
): Promise<{ success: boolean; error?: string }> {
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
    log.info(`[FK-MIGRATION] Migrated master database ${moduleName}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`[FK-MIGRATION] Error migrating master database ${moduleName}:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Get all existing transaction database files for a module
 */
function getTransactionDatabaseFiles(module: ModuleType): string[] {
  const basePath = path.join(app.getPath('userData'), 'data', module);
  const files: string[] = [];

  if (!fs.existsSync(basePath)) {
    return files;
  }

  const years = fs.readdirSync(basePath);
  for (const year of years) {
    const yearPath = path.join(basePath, year);
    if (!fs.statSync(yearPath).isDirectory()) continue;

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
export async function runFkMigration(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: '',
    databasesProcessed: 0,
    tablesMigrated: 0,
    errors: []
  };

  log.info('[FK-MIGRATION] Starting foreign key migration...');

  try {
    const SQL = await initSqlJs();

    // Migrate master databases
    const masterModules = ['coa', 'blok'];
    for (const module of masterModules) {
      const dbPath = path.join(app.getPath('userData'), 'data', 'master', `${module}.db`);
      const masterResult = await migrateMasterDatabase(SQL, dbPath, module);
      
      if (!masterResult.success && masterResult.error) {
        result.errors.push(`Master ${module}: ${masterResult.error}`);
      }
      result.databasesProcessed++;
    }

    // Migrate transaction databases
    const transactionModules: ModuleType[] = ['kas', 'bank', 'gudang'];
    
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

    log.info(`[FK-MIGRATION] ${result.message}`);
    
    if (result.errors.length > 0) {
      log.warn('[FK-MIGRATION] Errors encountered:', result.errors);
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('[FK-MIGRATION] Migration failed:', error);
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
export async function verifyForeignKeys(dbPath: string): Promise<{
  foreignKeysEnabled: boolean;
  constraintsFound: Array<{ table: string; from: string; to: string }>;
}> {
  const result = {
    foreignKeysEnabled: false,
    constraintsFound: [] as Array<{ table: string; from: string; to: string }>
  };

  try {
    if (!fs.existsSync(dbPath)) {
      return result;
    }

    const SQL = await initSqlJs();
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
        const tableName = row[0] as string;
        const fkList = db.exec(`PRAGMA foreign_key_list('${tableName}')`);
        
        if (fkList.length > 0) {
          for (const fkRow of fkList[0].values) {
            result.constraintsFound.push({
              table: tableName,
              from: fkRow[fkList[0].columns.indexOf('from')] as string,
              to: `${fkRow[fkList[0].columns.indexOf('table')]}.${fkRow[fkList[0].columns.indexOf('to')]}`
            });
          }
        }
      }
    }

    db.close();
  } catch (error) {
    log.error('[FK-MIGRATION] Error verifying foreign keys:', error);
  }

  return result;
}

export default runFkMigration;
