#!/usr/bin/env node

/**
 * SoftwareSawit MCP Server Launcher
 * 
 * A robust launcher script that:
 * - Checks if port 3456 is already in use and kills old process
 * - Starts mcp-server.js
 * - Verifies it's running with health check
 * - Restarts if not responding within 5 seconds
 * - Uses exponential backoff for restarts
 * - Prevents restart loops (max 3 restarts per minute)
 */

'use strict';

const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  port: parseInt(process.env.MCP_PORT || '3456', 10),
  host: process.env.MCP_HOST || '127.0.0.1',
  healthCheckUrl: 'http://127.0.0.1:3456/health',
  statusCheckUrl: 'http://127.0.0.1:3456/status',
  mcpServerPath: path.join(__dirname, 'mcp-server.js'),
  lockFile: path.join(process.env.APPDATA || '', 'software-sawit', 'data', '..', 'mcp-server.lock'),
  pidFile: path.join(process.env.APPDATA || '', 'software-sawit', 'data', '..', 'mcp-server.pid'),
  
  // Timeouts (in milliseconds)
  healthCheckTimeout: 5000,
  healthCheckRetries: 3,
  healthCheckRetryDelay: 1000,
  shutdownTimeout: 5000,
  
  // Backoff configuration
  initialBackoff: 1000,    // 1 second
  maxBackoff: 30000,       // 30 seconds
  backoffMultiplier: 2,
  maxRestartsPerMinute: 3,
  
  // Logging
  enableConsoleLogging: true,
  logFile: path.join(process.env.APPDATA || '', 'software-sawit', 'data', '..', 'logs', 'launcher.log')
};

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};
const currentLogLevel = LOG_LEVELS[process.env.LAUNCHER_LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function getTimestamp() {
  return new Date().toISOString();
}

function formatLog(level, message, meta = {}) {
  const entry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...meta
  };
  return JSON.stringify(entry);
}

function writeLog(level, message, meta = {}) {
  if (level < currentLogLevel) return;
  
  const logLine = formatLog(level, message, meta);
  
  if (CONFIG.enableConsoleLogging) {
    const prefix = level === LOG_LEVELS.ERROR ? '[ERROR]' : 
                   level === LOG_LEVELS.WARN ? '[WARN]' : 
                   level === LOG_LEVELS.DEBUG ? '[DEBUG]' : '[INFO]';
    console.log(`${prefix} ${message}`, Object.keys(meta).length > 0 ? JSON.stringify(meta) : '');
  }
  
  try {
    const logDir = path.dirname(CONFIG.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
    }
    fs.appendFileSync(CONFIG.logFile, logLine + '\n');
  } catch (err) {
    // Ignore log file errors
  }
}

const log = {
  debug: (msg, meta) => writeLog(LOG_LEVELS.DEBUG, msg, meta),
  info: (msg, meta) => writeLog(LOG_LEVELS.INFO, msg, meta),
  warn: (msg, meta) => writeLog(LOG_LEVELS.WARN, msg, meta),
  error: (msg, meta) => writeLog(LOG_LEVELS.ERROR, msg, meta)
};

// ============================================================================
// Process Management
// ============================================================================

let currentProcess = null;
let currentPid = null;
let isRunning = false;
let isShuttingDown = false;

// Restart tracking for exponential backoff
const restartHistory = [];
const MAX_RESTARTS_PER_MINUTE = CONFIG.maxRestartsPerMinute;

function addRestart() {
  const now = Date.now();
  // Clean old entries (older than 1 minute)
  while (restartHistory.length > 0 && restartHistory[0] < now - 60000) {
    restartHistory.shift();
  }
  restartHistory.push(now);
}

function getRecentRestarts() {
  const now = Date.now();
  return restartHistory.filter(time => time > now - 60000).length;
}

function shouldRestart() {
  return getRecentRestarts() < MAX_RESTARTS_PER_MINUTE;
}

function getBackoffDelay(attempt) {
  const delay = Math.min(
    CONFIG.initialBackoff * Math.pow(CONFIG.backoffMultiplier, attempt),
    CONFIG.maxBackoff
  );
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

// ============================================================================
// Port & Process Management
// ============================================================================

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        resolve(false);
      } else if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    socket.connect(port, host);
  });
}

function getProcessOnPort(port) {
  return new Promise((resolve) => {
    // Use tasklist on Windows to find process
    const cmd = process.platform === 'win32' 
      ? `netstat -ano | findstr :${port}`
      : `lsof -i :${port} -t 2>/dev/null || echo ""`;
    
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      
      // Parse PID from netstat output (Windows format)
      // Example: TCP    0.0.0.0:3456    0.0.0.0:0    LISTENING    12345
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 4 && parts[0].startsWith('TCP')) {
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(pid) && pid > 0) {
            resolve(pid);
            return;
          }
        }
      }
      
      // Fallback: try to get PID from tasklist
      if (process.platform === 'win32') {
        exec(`tasklist /FI "PID eq ${port}" /FO CSV /NH`, { timeout: 5000 }, (err, taskOut) => {
          if (!err && taskOut.trim()) {
            const match = taskOut.trim().match(/(\d+)/);
            if (match) {
              resolve(parseInt(match[1], 10));
              return;
            }
          }
          resolve(null);
        });
      } else {
        resolve(null);
      }
    });
  });
}

async function killProcessOnPort(port) {
  log.info(`Checking for existing process on port ${port}...`);
  
  const pid = await getProcessOnPort(port);
  if (!pid) {
    log.info('No process found on port');
    return true;
  }
  
  log.info(`Found process with PID: ${pid}`);
  
  // Don't kill our own child process
  if (currentProcess && pid === currentPid) {
    log.info('Process is our own child, skipping');
    return true;
  }
  
  return new Promise((resolve) => {
    const killCmd = process.platform === 'win32' 
      ? `taskkill /PID ${pid} /F`
      : `kill -9 ${pid}`;
    
    log.info(`Killing process ${pid}...`);
    exec(killCmd, { timeout: 5000 }, (error) => {
      if (error) {
        log.error(`Failed to kill process ${pid}`, { error: error.message });
        // Try alternative method on Windows
        if (process.platform === 'win32') {
          exec(`powershell -Command "Stop-Process -Id ${pid} -Force"`, { timeout: 5000 }, (err) => {
            if (err) {
              resolve(false);
            } else {
              log.info(`Process ${pid} killed via PowerShell`);
              resolve(true);
            }
          });
        } else {
          resolve(false);
        }
      } else {
        log.info(`Process ${pid} killed successfully`);
        resolve(true);
      }
    });
  });
}

async function cleanupStaleLockFile() {
  try {
    if (fs.existsSync(CONFIG.lockFile)) {
      const lockData = JSON.parse(fs.readFileSync(CONFIG.lockFile, 'utf-8'));
      const lockPid = lockData.pid;
      
      // Check if process is still running
      const isRunning = await checkProcessRunning(lockPid);
      if (!isRunning) {
        log.info(`Removing stale lock file (PID ${lockPid} not running)`);
        fs.unlinkSync(CONFIG.lockFile);
      } else {
        log.info(`Lock file belongs to running process ${lockPid}`);
      }
    }
  } catch (err) {
    log.warn('Could not read lock file', { error: err.message });
  }
}

function checkProcessRunning(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve(false);
      return;
    }
    
    const cmd = process.platform === 'win32'
      ? `tasklist /FI "PID eq ${pid}" /FO CSV /NH`
      : `ps -p ${pid} -o pid= 2>/dev/null || echo ""`;
    
    exec(cmd, { timeout: 3000 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      
      if (process.platform === 'win32') {
        // tasklist returns CSV format
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const taskPid = parseInt(parts[1]?.replace(/"/g, '') || '0', 10);
            if (taskPid === pid) {
              resolve(true);
              return;
            }
          }
        }
        resolve(false);
      } else {
        resolve(stdout.trim().length > 0);
      }
    });
  });
}

// ============================================================================
// Health Check
// ============================================================================

function healthCheck(url = CONFIG.healthCheckUrl) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: CONFIG.healthCheckTimeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({ ok: true, data: json });
          } catch {
            resolve({ ok: true, data: data });
          }
        } else {
          resolve({ ok: false, statusCode: res.statusCode });
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

async function waitForServer(timeout = CONFIG.healthCheckTimeout, retryDelay = CONFIG.healthCheckRetryDelay) {
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < timeout) {
    attempts++;
    log.debug(`Health check attempt ${attempts}...`);
    
    const result = await healthCheck();
    if (result.ok) {
      log.info('Server is healthy', { attempts, responseTime: `${Date.now() - startTime}ms` });
      return { success: true, attempts, responseTime: Date.now() - startTime };
    }
    
    log.debug(`Health check failed: ${result.error || result.statusCode || 'unknown'}`);
    
    // Wait before retrying
    await new Promise(r => setTimeout(r, retryDelay));
  }
  
  log.warn(`Server failed to become healthy within ${timeout}ms (${attempts} attempts)`);
  return { success: false, attempts };
}

// ============================================================================
// Server Process Management
// ============================================================================

function savePidFile(pid) {
  try {
    const pidData = {
      pid,
      port: CONFIG.port,
      startTime: new Date().toISOString(),
      launcherPid: process.pid
    };
    fs.writeFileSync(CONFIG.pidFile, JSON.stringify(pidData, null, 2), { mode: 0o644 });
  } catch (err) {
    log.warn('Could not save PID file', { error: err.message });
  }
}

function deletePidFile() {
  try {
    if (fs.existsSync(CONFIG.pidFile)) {
      fs.unlinkSync(CONFIG.pidFile);
    }
  } catch (err) {
    // Ignore
  }
}

function startServerProcess() {
  log.info('Starting mcp-server.js...', { path: CONFIG.mcpServerPath });
  
  const nodePath = process.execPath;
  const args = [CONFIG.mcpServerPath];
  
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MCP_PORT: String(CONFIG.port),
    MCP_HOST: CONFIG.host
  };
  
  const proc = spawn(nodePath, args, {
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  currentPid = proc.pid;
  currentProcess = proc;
  
  // Log stdout
  proc.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        log.debug(`[server] ${line}`);
      }
    }
  });
  
  // Log stderr
  proc.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        log.warn(`[server:stderr] ${line}`);
      }
    }
  });
  
  proc.on('exit', (code, signal) => {
    log.info('Server process exited', { code, signal, pid: proc.pid });
    currentProcess = null;
    currentPid = null;
    
    if (!isShuttingDown && code !== 0 && code !== null) {
      log.warn(`Server exited with code ${code}`);
    }
  });
  
  proc.on('error', (err) => {
    log.error('Server process error', { error: err.message });
    currentProcess = null;
    currentPid = null;
  });
  
  // Save PID
  savePidFile(proc.pid);
  
  return proc;
}

function stopServerProcess(timeout = CONFIG.shutdownTimeout) {
  return new Promise((resolve) => {
    if (!currentProcess || !currentPid) {
      log.info('No server process to stop');
      resolve(true);
      return;
    }
    
    log.info(`Stopping server process (PID: ${currentPid})...`);
    
    const killTimeout = setTimeout(() => {
      log.warn('Graceful shutdown timed out, forcing kill...');
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /PID ${currentPid} /F`, { timeout: 2000 }, () => {});
        } else {
          process.kill(currentPid, 'SIGKILL');
        }
      } catch (err) {
        // Ignore
      }
      resolve(false);
    }, timeout);
    
    currentProcess.once('exit', () => {
      clearTimeout(killTimeout);
      log.info('Server process stopped gracefully');
      resolve(true);
    });
    
    try {
      currentProcess.kill('SIGTERM');
    } catch (err) {
      clearTimeout(killTimeout);
      log.warn('Could not send SIGTERM', { error: err.message });
      resolve(false);
    }
  });
}

// ============================================================================
// Main Launcher Logic
// ============================================================================

async function checkAndClearPort() {
  const inUse = await isPortInUse(CONFIG.port, CONFIG.host);
  
  if (inUse) {
    log.info(`Port ${CONFIG.port} is in use, attempting to clear...`);
    
    const killed = await killProcessOnPort(CONFIG.port);
    
    if (killed) {
      // Wait a bit for port to be released
      await new Promise(r => setTimeout(r, 1000));
      
      // Verify port is free
      const stillInUse = await isPortInUse(CONFIG.port, CONFIG.host);
      if (stillInUse) {
        log.warn('Port still in use after kill attempt, will retry when starting');
      } else {
        log.info('Port cleared successfully');
      }
    } else {
      log.warn('Could not clear port, will retry when starting');
    }
  } else {
    log.info(`Port ${CONFIG.port} is available`);
  }
}

async function runLauncherCycle(attempt = 0) {
  if (isShuttingDown) return;
  
  addRestart();
  
  if (!shouldRestart()) {
    log.error('Too many restarts in the last minute, stopping to prevent loop');
    console.error(`
[LAUNCHER] ERROR: Too many restarts detected (${MAX_RESTARTS_PER_MINUTE}/minute max)
           The launcher will now exit to prevent a restart loop.
           Please check the server logs and fix any issues before restarting manually.
`);
    process.exit(1);
  }
  
  const backoffDelay = getBackoffDelay(attempt);
  log.info(`Starting server (attempt ${attempt + 1}, backoff: ${backoffDelay}ms)`);
  
  // Start the server
  startServerProcess();
  
  // Wait for backoff period before health check
  await new Promise(r => setTimeout(r, backoffDelay));
  
  // Check if server is running
  const healthResult = await waitForServer(CONFIG.healthCheckTimeout);
  
  if (healthResult.success) {
    isRunning = true;
    log.info('Server launched and verified successfully');
    console.log(`
[LAUNCHER] MCP Server is running
  PID:     ${currentPid}
  Port:    ${CONFIG.port}
  Status:  Healthy (${healthResult.responseTime}ms response time)
`);
    
    // Start monitoring
    startMonitoring();
    return;
  }
  
  // Server failed to start properly
  log.warn(`Server failed health check (attempt ${attempt + 1})`);
  
  // Stop the process if still running
  await stopServerProcess(2000);
  
  // Retry with backoff
  if (attempt < CONFIG.healthCheckRetries - 1) {
    log.info(`Retrying in ${getBackoffDelay(attempt + 1)}ms...`);
    await new Promise(r => setTimeout(r, getBackoffDelay(attempt + 1)));
    await runLauncherCycle(attempt + 1);
  } else {
    log.error('Max retries reached, server failed to start');
    console.error(`
[LAUNCHER] ERROR: Failed to start MCP server after ${CONFIG.healthCheckRetries} attempts
           Check the server logs at: ${CONFIG.logFile}
`);
    process.exit(1);
  }
}

// ============================================================================
// Monitoring
// ============================================================================

let monitorInterval = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

function startMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  
  // Check health every 10 seconds
  monitorInterval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(monitorInterval);
      return;
    }
    
    const result = await healthCheck();
    
    if (!result.ok) {
      consecutiveFailures++;
      log.warn(`Health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, { 
        error: result.error,
        statusCode: result.statusCode 
      });
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log.error('Too many consecutive health check failures, restarting server...');
        consecutiveFailures = 0;
        
        clearInterval(monitorInterval);
        
        await stopServerProcess(2000);
        await new Promise(r => setTimeout(r, 1000));
        await runLauncherCycle(0);
      }
    } else {
      if (consecutiveFailures > 0) {
        log.info('Health check recovered');
      }
      consecutiveFailures = 0;
    }
  }, 10000);
}

// ============================================================================
// Signal Handlers
// ============================================================================

async function shutdown(signal) {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress');
    return;
  }
  
  isShuttingDown = true;
  log.info(`Shutdown signal received (${signal})`);
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  
  await stopServerProcess(CONFIG.shutdownTimeout);
  deletePidFile();
  
  log.info('Launcher shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) });
  shutdown('unhandledRejection');
});

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     SoftwareSawit MCP Server Launcher v1.0.0              ║
╠═══════════════════════════════════════════════════════════╣
║  Port:    ${CONFIG.port}                                              ║
║  Server:  ${path.basename(CONFIG.mcpServerPath)}                              ║
║  PID:     ${process.pid}                                            ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  log.info('Launcher starting', { 
    port: CONFIG.port, 
    serverPath: CONFIG.mcpServerPath,
    pid: process.pid 
  });
  
  // Cleanup stale lock file
  await cleanupStaleLockFile();
  
  // Check and clear port if needed
  await checkAndClearPort();
  
  // Run the launcher cycle
  await runLauncherCycle(0);
}

main().catch((err) => {
  log.error('Launcher error', { error: err.message, stack: err.stack });
  console.error('[LAUNCHER] Fatal error:', err.message);
  process.exit(1);
});
