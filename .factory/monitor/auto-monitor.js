/**
 * GitHub Actions Auto-Monitor
 * Monitors workflow runs for adi805/SoftwareSawit repository
 * Polls every 5 minutes for updates
 * 
 * Required Environment Variable:
 *   GITHUB_PAT - GitHub Personal Access Token
 * 
 * Usage:
 *   set GITHUB_PAT=your_token_here
 *   node auto-monitor.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const CONFIG = {
  owner: 'adi805',
  repo: 'SoftwareSawit',
  workflowName: 'User Testing - Electron GUI Tests',
  pollInterval: 5 * 60 * 1000, // 5 minutes
  retryDelay: 30 * 1000, // 30 seconds on error
  maxRetries: 3,
  pat: process.env.GITHUB_PAT
};

// Validate configuration
if (!CONFIG.pat) {
  console.error('❌ Error: GITHUB_PAT environment variable is required');
  console.error('   Set it with: set GITHUB_PAT=your_token_here');
  process.exit(1);
}

// Paths
const BASE_DIR = path.join(__dirname);
const LOG_DIR = path.join(BASE_DIR, 'logs');
const STATE_DIR = path.join(BASE_DIR, 'state');
const LOG_FILE = path.join(LOG_DIR, 'auto-monitor.log');
const STATE_FILE = path.join(STATE_DIR, 'monitor-state.json');
const PID_FILE = path.join(STATE_DIR, 'monitor.pid');

// Ensure directories exist
[LOG_DIR, STATE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// State management
let state = {
  lastCheck: null,
  knownRuns: {},
  lastRunId: null,
  totalChecks: 0,
  notificationsSent: 0,
  startTime: new Date().toISOString()
};

// Load existing state if available
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = { ...state, ...saved };
      log('info', 'Loaded previous state');
    }
  } catch (err) {
    log('error', `Failed to load state: ${err.message}`);
  }
}

// Save state to file
function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    log('error', `Failed to save state: ${err.message}`);
  }
}

// Save PID file
function savePid() {
  try {
    fs.writeFileSync(PID_FILE, process.pid.toString());
  } catch (err) {
    log('error', `Failed to save PID: ${err.message}`);
  }
}

// Remove PID file
function removePid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (err) {
    log('error', `Failed to remove PID: ${err.message}`);
  }
}

// Logging with colors
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = {
    info: COLORS.cyan,
    success: COLORS.green,
    warn: COLORS.yellow,
    error: COLORS.red,
    notify: COLORS.magenta
  }[level] || COLORS.reset;

  const levelStr = level.toUpperCase().padEnd(7);
  const consoleLine = `${color}[${timestamp}] [${levelStr}]${COLORS.reset} ${message}`;
  const fileLine = `[${timestamp}] [${levelStr}] ${message}`;

  console.log(consoleLine);

  // Append to log file
  try {
    fs.appendFileSync(LOG_FILE, fileLine + '\n');
  } catch (err) {
    console.error(`Failed to write to log: ${err.message}`);
  }
}

// Windows notification
function sendWindowsNotification(title, message) {
  try {
    const psCommand = `
      Add-Type -AssemblyName System.Windows.Forms
      $notify = New-Object System.Windows.Forms.NotifyIcon
      $notify.Icon = [System.Drawing.SystemIcons]::Information
      $notify.Visible = $true
      $notify.ShowBalloonTip(5000, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)
    `;
    spawn('powershell.exe', ['-Command', psCommand], { detached: true, stdio: 'ignore' });
    log('notify', `Notification sent: ${title} - ${message}`);
  } catch (err) {
    log('error', `Failed to send notification: ${err.message}`);
  }
}

// GitHub API request
function githubApiRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'User-Agent': 'GitHub-Actions-Monitor',
        'Authorization': `token ${CONFIG.pat}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`JSON parse error: ${err.message}`));
          }
        } else if (res.statusCode === 401) {
          reject(new Error('Authentication failed - check PAT'));
        } else if (res.statusCode === 403) {
          reject(new Error('Rate limit exceeded or access forbidden'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// Get workflow runs
async function getWorkflowRuns() {
  const endpoint = `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?per_page=10`;
  return await githubApiRequest(endpoint);
}

// Get jobs for a run
async function getRunJobs(runId) {
  const endpoint = `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/jobs`;
  return await githubApiRequest(endpoint);
}

// Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Format status with color
function formatStatus(status, conclusion) {
  if (status === 'queued') return `${COLORS.yellow}⏳ QUEUED${COLORS.reset}`;
  if (status === 'in_progress') return `${COLORS.blue}🔄 RUNNING${COLORS.reset}`;
  if (status === 'completed') {
    if (conclusion === 'success') return `${COLORS.green}✅ SUCCESS${COLORS.reset}`;
    if (conclusion === 'failure') return `${COLORS.red}❌ FAILED${COLORS.reset}`;
    if (conclusion === 'cancelled') return `${COLORS.yellow}⚠️ CANCELLED${COLORS.reset}`;
    return `${COLORS.dim}${conclusion}${COLORS.reset}`;
  }
  return status;
}

// Check for new runs and status changes
async function checkWorkflows() {
  state.lastCheck = new Date().toISOString();
  state.totalChecks++;

  try {
    log('info', 'Checking GitHub Actions workflows...');
    const data = await getWorkflowRuns();
    const runs = data.workflow_runs || [];

    if (runs.length === 0) {
      log('warn', 'No workflow runs found');
      return;
    }

    // Filter for our target workflow
    const targetRuns = runs.filter(r => r.name === CONFIG.workflowName);

    if (targetRuns.length === 0) {
      log('warn', `No runs found for workflow "${CONFIG.workflowName}"`);
      return;
    }

    const latestRun = targetRuns[0];
    const runId = latestRun.id;

    // Check if this is a new run
    if (state.lastRunId !== runId) {
      if (state.lastRunId) {
        log('notify', `🚀 NEW WORKFLOW RUN STARTED`);
        sendWindowsNotification(
          'GitHub Actions - New Run',
          `Workflow "${CONFIG.workflowName}" started (Run #${latestRun.run_number})`
        );
        state.notificationsSent++;
      }
      state.lastRunId = runId;
    }

    // Check if we've seen this run before
    const knownRun = state.knownRuns[runId];
    const currentStatus = {
      id: runId,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      runNumber: latestRun.run_number,
      branch: latestRun.head_branch,
      commit: latestRun.head_commit?.message?.substring(0, 50) || 'N/A',
      url: latestRun.html_url,
      createdAt: latestRun.created_at,
      updatedAt: latestRun.updated_at
    };

    // Log current status
    const statusStr = formatStatus(latestRun.status, latestRun.conclusion);
    log('info', `Run #${latestRun.run_number} | ${statusStr} | Branch: ${latestRun.head_branch}`);

    // Check for status changes
    if (knownRun) {
      // Status changed from in_progress to completed
      if (knownRun.status === 'in_progress' && latestRun.status === 'completed') {
        const duration = latestRun.updated_at && latestRun.created_at
          ? formatDuration(new Date(latestRun.updated_at) - new Date(latestRun.created_at))
          : 'unknown';

        if (latestRun.conclusion === 'success') {
          log('success', `✅ WORKFLOW COMPLETED SUCCESSFULLY in ${duration}`);
          sendWindowsNotification(
            'GitHub Actions - Success',
            `Workflow "${CONFIG.workflowName}" completed successfully in ${duration}`
          );
        } else if (latestRun.conclusion === 'failure') {
          log('error', `❌ WORKFLOW FAILED after ${duration}`);
          sendWindowsNotification(
            'GitHub Actions - Failed',
            `Workflow "${CONFIG.workflowName}" failed! Check logs.`
          );

          // Get job details for failed jobs
          try {
            const jobsData = await getRunJobs(runId);
            const failedJobs = (jobsData.jobs || []).filter(j => j.conclusion === 'failure');
            for (const job of failedJobs) {
              log('error', `  └─ Failed job: ${job.name}`);
            }
          } catch (err) {
            log('error', `Failed to get job details: ${err.message}`);
          }
        }
        state.notificationsSent++;
      }
    }

    // Update known runs (keep last 20)
    state.knownRuns[runId] = currentStatus;
    const runIds = Object.keys(state.knownRuns);
    if (runIds.length > 20) {
      const toDelete = runIds.slice(0, runIds.length - 20);
      toDelete.forEach(id => delete state.knownRuns[id]);
    }

    saveState();
    log('success', `Check complete. Total checks: ${state.totalChecks}, Notifications: ${state.notificationsSent}`);

  } catch (err) {
    log('error', `Check failed: ${err.message}`);
    throw err;
  }
}

// Main monitoring loop
let isRunning = true;
let checkTimeout = null;

async function monitorLoop() {
  let retries = 0;

  while (isRunning) {
    try {
      await checkWorkflows();
      retries = 0;

      if (isRunning) {
        log('info', `Next check in ${CONFIG.pollInterval / 1000 / 60} minutes...`);
        await new Promise(resolve => {
          checkTimeout = setTimeout(resolve, CONFIG.pollInterval);
        });
      }
    } catch (err) {
      retries++;
      if (retries >= CONFIG.maxRetries) {
        log('error', `Max retries (${CONFIG.maxRetries}) exceeded. Waiting for next interval.`);
        retries = 0;
        if (isRunning) {
          await new Promise(resolve => {
            checkTimeout = setTimeout(resolve, CONFIG.pollInterval);
          });
        }
      } else {
        log('warn', `Retry ${retries}/${CONFIG.maxRetries} in ${CONFIG.retryDelay / 1000}s...`);
        await new Promise(resolve => {
          checkTimeout = setTimeout(resolve, CONFIG.retryDelay);
        });
      }
    }
  }
}

// Graceful shutdown
function shutdown() {
  log('info', 'Shutting down monitor...');
  isRunning = false;
  if (checkTimeout) {
    clearTimeout(checkTimeout);
  }
  removePid();
  saveState();
  log('info', 'Monitor stopped');
  process.exit(0);
}

// Handle signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGUSR2', () => {
  log('info', 'Status request received');
  console.log('\n=== Monitor Status ===');
  console.log(`Started: ${state.startTime}`);
  console.log(`Last check: ${state.lastCheck || 'Never'}`);
  console.log(`Total checks: ${state.totalChecks}`);
  console.log(`Notifications sent: ${state.notificationsSent}`);
  console.log(`Current PID: ${process.pid}`);
  console.log('=====================\n');
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  log('error', `Uncaught exception: ${err.message}`);
  log('error', err.stack);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', `Unhandled rejection at: ${promise}, reason: ${reason}`);
});

// Main entry point
async function main() {
  console.log(`
${COLORS.cyan}╔════════════════════════════════════════════════════════╗
║     GitHub Actions Auto-Monitor                        ║
║     Repository: ${CONFIG.owner}/${CONFIG.repo}                    ║
║     Workflow: ${CONFIG.workflowName.substring(0, 30)}...    ║
║     Poll Interval: ${CONFIG.pollInterval / 1000 / 60} minutes                           ║
╚════════════════════════════════════════════════════════╝${COLORS.reset}
`);

  loadState();
  savePid();

  log('info', `Monitor started with PID: ${process.pid}`);
  log('info', `Log file: ${LOG_FILE}`);
  log('info', `State file: ${STATE_FILE}`);

  // Do initial check immediately
  try {
    await checkWorkflows();
  } catch (err) {
    log('error', `Initial check failed: ${err.message}`);
  }

  // Start monitoring loop
  await monitorLoop();
}

main().catch(err => {
  log('error', `Fatal error: ${err.message}`);
  shutdown();
});
