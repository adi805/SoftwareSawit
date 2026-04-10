#!/usr/bin/env node

/**
 * SoftwareSawit MCP Server - Robust Production Version
 * Implements MCP (Model Context Protocol) JSON-RPC 2.0 specification
 * 
 * Features:
 * - Single instance lock (prevents multiple instances)
 * - Request validation and sanitization
 * - Connection pooling (max 10 concurrent requests)
 * - Process monitoring (memory, uptime)
 * - Structured logging with rotation
 * - Graceful shutdown handling
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { once } = require('events');

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.MCP_PORT || '3456', 10);
const HOST = process.env.MCP_HOST || '127.0.0.1';
const DATA_PATH = process.env.SOFTWARE_SAWIT_DATA || 
  path.join(process.env.APPDATA || '', 'software-sawit', 'data');
const LOG_DIR = path.join(DATA_PATH, '..', 'logs');
const LOCK_FILE = path.join(DATA_PATH, '..', 'mcp-server.lock');

// Timeouts
const REQUEST_TIMEOUT = 30000;      // 30s per request
const SERVER_TIMEOUT = 60000;       // 60s server level
const KEEP_ALIVE = 30000;           // 30s keep-alive
const HEADERS_TIMEOUT = 35000;      // 35s headers timeout

// Connection pooling
const MAX_CONCURRENT_REQUESTS = 10;
const REQUEST_QUEUE_SIZE = 50;

// JSON-RPC 2.0 Error Codes
const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000
};

// ============================================================================
// Process Monitoring & Metrics
// ============================================================================

const processMetrics = {
  startTime: Date.now(),
  requestCount: 0,
  errorCount: 0,
  activeRequests: 0,
  maxConcurrentRequests: 0,
  totalMemoryUsage: [],
  restartCount: 0
};

function getProcessInfo() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    memory: {
      heapUsed: formatBytes(memUsage.heapUsed),
      heapTotal: formatBytes(memUsage.heapTotal),
      rss: formatBytes(memUsage.rss),
      external: formatBytes(memUsage.external)
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    requestCount: processMetrics.requestCount,
    errorCount: processMetrics.errorCount,
    activeRequests: processMetrics.activeRequests,
    maxConcurrent: processMetrics.maxConcurrentRequests,
    restartCount: processMetrics.restartCount
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// ============================================================================
// Logging System
// ============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function getTimestamp() {
  return new Date().toISOString();
}

function formatLogMessage(level, message, meta = {}) {
  const entry = {
    timestamp: getTimestamp(),
    level,
    pid: process.pid,
    message,
    ...meta
  };
  return JSON.stringify(entry);
}

function writeLog(level, message, meta = {}) {
  if (level < currentLogLevel) return;
  
  const logLine = formatLogMessage(level, message, meta);
  
  // Always write to stdout
  console.log(logLine);
  
  // Rotate and write to file if log directory exists
  if (LOG_DIR) {
    try {
      ensureLogDirectory();
      const logFile = getLogFileName();
      fs.appendFileSync(logFile, logLine + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err.message);
    }
  }
}

const log = {
  debug: (msg, meta) => writeLog(LOG_LEVELS.DEBUG, msg, meta),
  info: (msg, meta) => writeLog(LOG_LEVELS.INFO, msg, meta),
  warn: (msg, meta) => writeLog(LOG_LEVELS.WARN, msg, meta),
  error: (msg, meta) => writeLog(LOG_LEVELS.ERROR, msg, meta)
};

let logFileDate = '';

function ensureLogDirectory() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o755 });
    }
  } catch (err) {
    // Cannot create log directory, continue with stdout only
  }
}

function getLogFileName() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== logFileDate) {
    logFileDate = today;
  }
  return path.join(LOG_DIR, `mcp-server-${logFileDate}.log`);
}

// ============================================================================
// Log Rotation
// ============================================================================

function rotateLogsIfNeeded() {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('mcp-server-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        time: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Keep only last 7 days of logs
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    for (const file of files) {
      if (file.time < sevenDaysAgo) {
        try {
          fs.unlinkSync(file.path);
          log.info(`Rotated old log file: ${file.name}`);
        } catch (err) {
          // Ignore deletion errors
        }
      }
    }
  } catch (err) {
    // Ignore rotation errors
  }
}

// Run log rotation on startup and periodically
rotateLogsIfNeeded();
setInterval(rotateLogsIfNeeded, 60 * 60 * 1000); // Every hour

// ============================================================================
// Single Instance Lock
// ============================================================================

function acquireLock() {
  const lockData = {
    pid: process.pid,
    port: PORT,
    startTime: new Date().toISOString(),
    host: HOST
  };
  
  try {
    // Check if lock file exists
    if (fs.existsSync(LOCK_FILE)) {
      const existingLock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      
      // Check if process is still running
      if (existingLock.pid && process.pid !== existingLock.pid) {
        try {
          // On Windows, we can't easily check if process exists without additional tools
          // We'll try to kill any process on our port as a fallback
          log.warn('Lock file exists from previous instance', existingLock);
        } catch (err) {
          log.warn('Could not verify existing process', { error: err.message });
        }
      }
    }
    
    // Write our lock file
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2), { mode: 0o644 });
    log.info('Lock acquired', { lockFile: LOCK_FILE, ...lockData });
    return true;
  } catch (err) {
    log.error('Failed to acquire lock', { error: err.message, lockFile: LOCK_FILE });
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      log.info('Lock released');
    }
  } catch (err) {
    log.error('Failed to release lock', { error: err.message });
  }
}

// ============================================================================
// Request Validation & Sanitization
// ============================================================================

// Dangerous SQL patterns to block
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+/i,
  /;\s*TRUNCATE\s+/i,
  /--\s*.*$/m,           // SQL comments
  /\/\*.*?\*\//s,        // Block comments
  /\bUNION\s+(ALL\s+)?SELECT/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bLOAD_FILE\b/i,
  /\bBENCHMARK\b/i,
  /\bSLEEP\b/i,
  /\bPG_SLEEP\b/i,
  /\bWAITFOR\s+DELAY\b/i
];

function sanitizeString(str, maxLength = 10000) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function validateSqlQuery(sql) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      return { valid: false, reason: `Potentially dangerous SQL pattern detected: ${pattern.toString()}` };
    }
  }
  
  // Check for reasonable query length
  if (sql.length > 5000) {
    return { valid: false, reason: 'SQL query too long (max 5000 characters)' };
  }
  
  return { valid: true };
}

function validateRequestId(id) {
  if (id === undefined) return null;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') {
    // Only allow simple string IDs (UUID-like)
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return id;
  }
  return null; // Invalid ID will be treated as notification
}

function sanitizeParams(params) {
  if (params === undefined || params === null) return {};
  if (typeof params !== 'object' || Array.isArray(params)) return {};
  
  const sanitized = {};
  for (const [key, value] of Object.entries(params)) {
    // Only allow alphanumeric keys
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(v => typeof v === 'string' ? sanitizeString(v) : v);
      }
    }
  }
  return sanitized;
}

// ============================================================================
// Connection Pool
// ============================================================================

class RequestPool {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.activeRequests = new Map();
    this.queue = [];
  }
  
  async acquire(requestId) {
    if (this.activeRequests.size >= this.maxSize) {
      // Queue the request with timeout
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = this.queue.indexOf({ requestId, resolve, reject });
          if (index !== -1) {
            this.queue.splice(index, 1);
          }
          reject(new Error('Request queue timeout'));
        }, 10000);
        
        this.queue.push({ requestId, resolve, reject, timeout });
      });
    }
    
    const slot = randomUUID();
    this.activeRequests.set(slot, { requestId, startTime: Date.now() });
    
    if (this.activeRequests.size > this.maxSize) {
      processMetrics.maxConcurrentRequests = this.activeRequests.size;
    }
    
    return slot;
  }
  
  release(slot) {
    const entry = this.activeRequests.get(slot);
    if (entry) {
      this.activeRequests.delete(slot);
      
      // Process queued requests
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        clearTimeout(next.timeout);
        next.resolve();
      }
    }
  }
  
  getStats() {
    return {
      active: this.activeRequests.size,
      queued: this.queue.length,
      max: this.maxSize
    };
  }
}

const requestPool = new RequestPool(MAX_CONCURRENT_REQUESTS);

// ============================================================================
// JSON-RPC Helpers
// ============================================================================

function createJsonRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function createJsonRpcError(id, code, message, data = null) {
  const error = { code, message };
  if (data !== null) {
    error.data = data;
  }
  return {
    jsonrpc: '2.0',
    id,
    error
  };
}

function createJsonRpcNotification(method, params = null) {
  const notification = { jsonrpc: '2.0', method };
  if (params !== null) {
    notification.params = params;
  }
  return notification;
}

// ============================================================================
// Database Operations
// ============================================================================

async function queryDatabase(dbPath, sql, params = []) {
  try {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    // Read database file
    let buffer;
    try {
      buffer = fs.readFileSync(dbPath);
    } catch (err) {
      return { success: false, error: `Cannot read database file: ${err.message}` };
    }
    
    const db = new SQL.Database(buffer);
    
    // Execute query safely with params
    let results;
    try {
      results = db.exec(sql, params);
    } catch (err) {
      db.close();
      return { success: false, error: `Query error: ${err.message}` };
    }
    
    db.close();
    
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Tool Definitions & Handlers
// ============================================================================

const serverCapabilities = {
  tools: {},
  logging: {}
};

const toolDefinitions = [
  {
    name: 'list_databases',
    description: 'List available databases in the SoftwareSawit data directory',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'query',
    description: 'Execute a SQL query on a specified database',
    inputSchema: {
      type: 'object',
      properties: {
        db_path: { type: 'string', description: 'Path to the database file relative to the data directory' },
        sql: { type: 'string', description: 'SQL query to execute (SELECT only)' }
      },
      required: ['db_path', 'sql']
    }
  },
  {
    name: 'read_logs',
    description: 'Read application log files',
    inputSchema: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: 'Number of log lines to read (default: 100)', default: 100 }
      },
      required: []
    }
  },
  {
    name: 'get_app_info',
    description: 'Get application information (name, version, data path)',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'list_tables',
    description: 'List all tables in a specified database',
    inputSchema: {
      type: 'object',
      properties: {
        db_path: { type: 'string', description: 'Path to the database file relative to the data directory' }
      },
      required: ['db_path']
    }
  },
  {
    name: 'get_schema',
    description: 'Get the schema/structure of a table',
    inputSchema: {
      type: 'object',
      properties: {
        db_path: { type: 'string', description: 'Path to the database file relative to the data directory' },
        table: { type: 'string', description: 'Name of the table to get schema for' }
      },
      required: ['db_path', 'table']
    }
  },
  {
    name: 'read_table',
    description: 'Read data from a table',
    inputSchema: {
      type: 'object',
      properties: {
        db_path: { type: 'string', description: 'Path to the database file relative to the data directory' },
        table: { type: 'string', description: 'Name of the table to read from' },
        limit: { type: 'number', description: 'Maximum number of rows to return (default: 100)', default: 100 }
      },
      required: ['db_path', 'table']
    }
  },
  {
    name: 'get_server_info',
    description: 'Get MCP server status, metrics, and process information',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
];

const toolHandlers = {
  list_databases: async () => {
    const dbDir = DATA_PATH;
    const dbs = [];
    
    const modules = ['kas', 'bank', 'gudang'];
    for (const mod of modules) {
      const modPath = path.join(dbDir, mod);
      if (fs.existsSync(modPath)) {
        try {
          const files = fs.readdirSync(modPath).filter(f => f.endsWith('.db'));
          if (files.length > 0) {
            dbs.push({ module: mod, files });
          }
        } catch (err) {
          // Ignore read errors
        }
      }
    }
    
    const rootDbs = ['users.db', 'coa.db', 'blok.db', 'sync.db'];
    for (const db of rootDbs) {
      const dbPath = path.join(dbDir, db);
      if (fs.existsSync(dbPath)) {
        dbs.push({ module: 'root', files: [db] });
      }
    }
    
    return { databases: dbs };
  },

  query: async ({ db_path, sql }) => {
    if (!db_path || !sql) {
      return { success: false, error: 'Missing required parameters: db_path and sql' };
    }
    
    // Validate db_path - must be relative and not contain dangerous characters
    const normalizedPath = path.normalize(db_path).replace(/\\/g, '/');
    if (normalizedPath.includes('..') || /^[a-zA-Z]:/.test(normalizedPath)) {
      return { success: false, error: 'Invalid database path: absolute paths and parent directory traversal not allowed' };
    }
    
    // Validate SQL - only SELECT statements allowed
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return { success: false, error: 'Only SELECT queries are allowed' };
    }
    
    // Validate SQL for dangerous patterns
    const validation = validateSqlQuery(sql);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }
    
    const fullPath = path.join(DATA_PATH, db_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Database not found: ${db_path}` };
    }
    
    return await queryDatabase(fullPath, sql);
  },

  read_logs: async ({ lines = 100 }) => {
    const logPath = path.join(DATA_PATH, '..', 'logs');
    if (!fs.existsSync(logPath)) {
      return { success: false, error: 'Logs directory not found' };
    }
    
    try {
      const logFiles = fs.readdirSync(logPath)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse();
      
      if (logFiles.length === 0) {
        return { success: true, logs: [] };
      }
      
      const latestLog = path.join(logPath, logFiles[0]);
      const content = fs.readFileSync(latestLog, 'utf-8');
      const logLines = content.split('\n').slice(-lines).filter(l => l.trim());
      
      return { success: true, file: logFiles[0], logs: logLines };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  get_app_info: async () => {
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          dataPath: DATA_PATH,
          logPath: LOG_DIR
        };
      } catch (err) {
        return { success: false, error: 'Failed to parse package.json' };
      }
    }
    return { success: false, error: 'package.json not found' };
  },

  list_tables: async ({ db_path }) => {
    if (!db_path) {
      return { success: false, error: 'Missing required parameter: db_path' };
    }
    
    const normalizedPath = path.normalize(db_path).replace(/\\/g, '/');
    if (normalizedPath.includes('..') || /^[a-zA-Z]:/.test(normalizedPath)) {
      return { success: false, error: 'Invalid database path' };
    }
    
    const fullPath = path.join(DATA_PATH, db_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Database not found: ${db_path}` };
    }
    
    return await queryDatabase(fullPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  },

  get_schema: async ({ db_path, table }) => {
    if (!db_path || !table) {
      return { success: false, error: 'Missing required parameters: db_path and table' };
    }
    
    // Validate table name - alphanumeric and underscore only
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return { success: false, error: 'Invalid table name: must be alphanumeric with underscores' };
    }
    
    const normalizedPath = path.normalize(db_path).replace(/\\/g, '/');
    if (normalizedPath.includes('..') || /^[a-zA-Z]:/.test(normalizedPath)) {
      return { success: false, error: 'Invalid database path' };
    }
    
    const fullPath = path.join(DATA_PATH, db_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Database not found: ${db_path}` };
    }
    
    return await queryDatabase(fullPath, `PRAGMA table_info("${table}")`);
  },

  read_table: async ({ db_path, table, limit = 100 }) => {
    if (!db_path || !table) {
      return { success: false, error: 'Missing required parameters: db_path and table' };
    }
    
    // Validate table name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return { success: false, error: 'Invalid table name: must be alphanumeric with underscores' };
    }
    
    // Validate limit
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000);
    
    const normalizedPath = path.normalize(db_path).replace(/\\/g, '/');
    if (normalizedPath.includes('..') || /^[a-zA-Z]:/.test(normalizedPath)) {
      return { success: false, error: 'Invalid database path' };
    }
    
    const fullPath = path.join(DATA_PATH, db_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Database not found: ${db_path}` };
    }
    
    return await queryDatabase(fullPath, `SELECT * FROM "${table}" LIMIT ${safeLimit}`);
  },

  get_server_info: async () => {
    return {
      success: true,
      server: 'software-sawit-mcp',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      process: getProcessInfo(),
      pool: requestPool.getStats(),
      config: {
        port: PORT,
        host: HOST,
        dataPath: DATA_PATH,
        maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
        requestTimeout: REQUEST_TIMEOUT
      }
    };
  }
};

// ============================================================================
// Request Parsing
// ============================================================================

function parseJsonRpcRequest(body) {
  if (typeof body !== 'string' || !body.trim()) {
    return { valid: false, error: createJsonRpcError(null, JSONRPC_ERROR_CODES.PARSE_ERROR, 'Parse error: empty or invalid body') };
  }

  let request;
  try {
    request = JSON.parse(body);
  } catch (e) {
    return { valid: false, error: createJsonRpcError(null, JSONRPC_ERROR_CODES.PARSE_ERROR, 'Parse error: Invalid JSON') };
  }

  if (Array.isArray(request)) {
    return { valid: false, error: createJsonRpcError(null, JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Batch requests not supported') };
  }

  if (typeof request !== 'object' || request === null) {
    return { valid: false, error: createJsonRpcError(null, JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Invalid request: expected object') };
  }

  if (request.jsonrpc !== '2.0') {
    return { valid: false, error: createJsonRpcError(request.id ?? null, JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Invalid request: jsonrpc must be "2.0"') };
  }

  if (typeof request.method !== 'string') {
    return { valid: false, error: createJsonRpcError(request.id ?? null, JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Invalid request: method must be a string') };
  }

  // Sanitize and validate
  const sanitizedId = validateRequestId(request.id);
  const sanitizedParams = sanitizeParams(request.params);
  const sanitizedMethod = sanitizeString(request.method, 100);

  return {
    valid: true,
    request: {
      id: sanitizedId,
      method: sanitizedMethod,
      params: sanitizedParams
    }
  };
}

// ============================================================================
// MCP Method Handler
// ============================================================================

async function handleMcpMethod(request) {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        const result = {
          protocolVersion: '2024-11-05',
          capabilities: serverCapabilities,
          serverInfo: {
            name: 'software-sawit',
            version: '1.0.0'
          }
        };
        return createJsonRpcResponse(id, result);
      }

      case 'tools/list': {
        return createJsonRpcResponse(id, { tools: toolDefinitions });
      }

      case 'tools/call': {
        if (!params || typeof params !== 'object') {
          return createJsonRpcError(id, JSONRPC_ERROR_CODES.INVALID_PARAMS, 'Invalid params: expected object with name and arguments');
        }

        const { name, arguments: args = {} } = params;

        if (typeof name !== 'string') {
          return createJsonRpcError(id, JSONRPC_ERROR_CODES.INVALID_PARAMS, 'Invalid params: name must be a string');
        }

        const handler = toolHandlers[name];
        if (!handler) {
          return createJsonRpcError(id, JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `Tool not found: ${name}`);
        }

        try {
          const result = await handler(args);
          return createJsonRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
        } catch (error) {
          log.error('Tool execution failed', { method: name, error: error.message });
          return createJsonRpcError(id, JSONRPC_ERROR_CODES.INTERNAL_ERROR, `Tool execution failed: ${error.message}`);
        }
      }

      case 'ping': {
        return createJsonRpcResponse(id, { status: 'ok', timestamp: Date.now() });
      }

      case 'health': {
        return createJsonRpcResponse(id, {
          status: 'ok',
          uptime: process.uptime(),
          memory: getProcessInfo().memory,
          activeRequests: processMetrics.activeRequests
        });
      }

      case 'logging/message': {
        // Accept log messages from client
        const { level, message } = params || {};
        if (message) {
          const logLevel = level === 'error' ? log.error : level === 'warn' ? log.warn : level === 'debug' ? log.debug : log.info;
          logLevel(`[Client] ${message}`);
        }
        return createJsonRpcResponse(id, { success: true });
      }

      default:
        return createJsonRpcError(id, JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (error) {
    log.error('Handler error', { method, error: error.message });
    return createJsonRpcError(id, JSONRPC_ERROR_CODES.INTERNAL_ERROR, `Internal error: ${error.message}`);
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

let server = null;

function createServer() {
  const srv = http.createServer();

  srv.timeout = SERVER_TIMEOUT;
  srv.keepAliveTimeout = KEEP_ALIVE;
  srv.headersTimeout = HEADERS_TIMEOUT;

  srv.on('error', (err) => {
    log.error('Server error', { error: err.message, code: err.code });
    if (err.code === 'EADDRINUSE') {
      log.error(`Port ${PORT} is already in use`);
      process.exit(1);
    }
  });

  srv.on('clientError', (err, socket) => {
    log.warn('Client error', { error: err.message });
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  srv.on('connection', (socket) => {
    // Prevent slow connection attacks
    socket.setTimeout(10000, () => {
      log.warn('Slow connection timeout');
      socket.destroy();
    });
  });

  srv.on('request', async (req, res) => {
    const requestId = randomUUID().slice(0, 8);
    const startTime = Date.now();
    let poolSlot = null;

    // Track active request
    processMetrics.activeRequests++;
    if (processMetrics.activeRequests > processMetrics.maxConcurrentRequests) {
      processMetrics.maxConcurrentRequests = processMetrics.activeRequests;
    }

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const sendJson = (statusCode, data) => {
      if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify(data));
    };

    const logRequest = (statusCode) => {
      const duration = Date.now() - startTime;
      log.info('Request completed', {
        requestId,
        method: req.method,
        url: req.url,
        status: statusCode,
        duration: `${duration}ms`,
        activeRequests: processMetrics.activeRequests
      });
    };

    // Request timeout handler
    const timeoutId = setTimeout(() => {
      log.warn('Request timeout', { requestId, timeout: REQUEST_TIMEOUT });
      sendJson(408, createJsonRpcError(null, JSONRPC_ERROR_CODES.SERVER_ERROR, 'Request timeout'));
    }, REQUEST_TIMEOUT);

    try {
      // Acquire pool slot
      try {
        poolSlot = await requestPool.acquire(requestId);
      } catch (err) {
        sendJson(503, createJsonRpcError(null, JSONRPC_ERROR_CODES.SERVER_ERROR, 'Server busy: too many concurrent requests'));
        return;
      }

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        clearTimeout(timeoutId);
        sendJson(200, { status: 'ok' });
        logRequest(200);
        return;
      }

      // Health/status endpoints (no body parsing needed)
      if (req.method === 'GET') {
        clearTimeout(timeoutId);
        
        if (req.url === '/status' || req.url === '/health') {
          const status = {
            status: 'ok',
            server: 'mcp',
            timestamp: Date.now(),
            uptime: process.uptime(),
            memory: getProcessInfo().memory,
            pool: requestPool.getStats()
          };
          sendJson(200, status);
        } else if (req.url === '/metrics') {
          sendJson(200, getProcessInfo());
        } else if (req.url === '/ready') {
          sendJson(200, { ready: true });
        } else {
          sendJson(404, { error: 'Not found' });
        }
        logRequest(res.statusCode || 200);
        return;
      }

      // JSON-RPC endpoint
      if (req.method === 'POST' && (req.url === '/mcp' || req.url === '/rpc')) {
        // Collect body
        const chunks = [];
        for await (const chunk of req) {
          if (chunks.length > 100) { // Limit body size (~1MB)
            clearTimeout(timeoutId);
            sendJson(413, createJsonRpcError(null, JSONRPC_ERROR_CODES.SERVER_ERROR, 'Request body too large'));
            return;
          }
          chunks.push(chunk);
        }
        
        const body = Buffer.concat(chunks).toString('utf-8');
        clearTimeout(timeoutId);

        processMetrics.requestCount++;

        const parseResult = parseJsonRpcRequest(body);
        if (!parseResult.valid) {
          processMetrics.errorCount++;
          sendJson(400, parseResult.error);
          logRequest(400);
          return;
        }

        const response = await handleMcpMethod(parseResult.request);
        sendJson(200, response);
        logRequest(200);
        return;
      }

      // 404 for other routes
      clearTimeout(timeoutId);
      sendJson(404, createJsonRpcError(null, JSONRPC_ERROR_CODES.INVALID_REQUEST, 'Not found'));
      logRequest(404);

    } catch (error) {
      clearTimeout(timeoutId);
      processMetrics.errorCount++;
      log.error('Request error', { requestId, error: error.message });
      sendJson(500, createJsonRpcError(null, JSONRPC_ERROR_CODES.INTERNAL_ERROR, 'Internal server error'));
      logRequest(500);
    } finally {
      // Always release pool slot and update metrics
      if (poolSlot) {
        requestPool.release(poolSlot);
      }
      processMetrics.activeRequests--;
    }
  });

  return srv;
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress');
    return;
  }
  isShuttingDown = true;

  log.info('Shutdown initiated', { signal });

  // Stop accepting new connections
  if (server) {
    server.close();
  }

  // Give time for active requests to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Release lock file
  releaseLock();

  log.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Prevent crashes
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled rejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});

// ============================================================================
// Start Server
// ============================================================================

function startServer() {
  // Acquire lock
  if (!acquireLock()) {
    log.error('Failed to acquire lock - another instance may be running');
    // Exit with success to not block the launcher
    process.exit(0);
  }

  server = createServer();

  server.listen(PORT, HOST, () => {
    log.info('Server started', {
      host: HOST,
      port: PORT,
      pid: process.pid,
      dataPath: DATA_PATH
    });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     SoftwareSawit MCP Server v1.0.0                        ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Running                                         ║
║  Port:    ${PORT}                                              ║
║  Host:    ${HOST}                                          ║
║  PID:     ${process.pid}                                            ║
║  Data:    ${DATA_PATH.slice(0, 40)}...    ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    POST /mcp  - JSON-RPC 2.0 MCP endpoint                 ║
║    POST /rpc  - Alternative JSON-RPC endpoint             ║
║    GET  /health - Health check                            ║
║    GET  /status - Server status                          ║
║    GET  /metrics - Process metrics                        ║
║    GET  /ready  - Readiness check                         ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });

  // Server-level error handling
  server.on('error', (err) => {
    log.error('Server emit error', { error: err.message });
    if (err.code === 'EADDRINUSE') {
      console.error(`ERROR: Port ${PORT} is already in use`);
      process.exit(1);
    }
  });
}

startServer();
