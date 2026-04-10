#!/usr/bin/env node
/**
 * GitHub Actions Monitor for SoftwareSawit Validation
 * 
 * This script monitors GitHub Actions workflow runs and updates the validation
 * state based on test results. It polls the GitHub API for workflow status,
 * downloads artifacts, and maps test results to validation assertions.
 * 
 * Usage:
 *   node github-actions-monitor.js [options]
 * 
 * Options:
 *   --run-id <id>      Monitor specific run ID
 *   --poll-interval <s>  Polling interval in seconds (default: 60)
 *   --once             Run once and exit (don't poll)
 *   --dry-run          Don't update validation-state.json
 *   --verbose          Enable verbose logging
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');

// Configuration
const CONFIG = {
  owner: 'adi805',
  repo: 'SoftwareSawit',
  workflowName: 'User Testing - Electron GUI Tests',
  validationStatePath: process.env.VALIDATION_STATE_PATH || 'C:/Users/acer/.factory/missions/a5b8148c-b18d-4f59-bf4e-c7dc099afefc/validation-state.json',
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 60000, // 60 seconds
  maxRetries: 3,
  retryDelay: 5000,
  githubApiBase: 'api.github.com',
  artifactsDir: path.join(__dirname, 'artifacts'),
  logsDir: path.join(__dirname, 'logs'),
};

// State tracking
let currentRunId = null;
let isRunning = true;
let pollTimer = null;
let rateLimitRemaining = 60;
let rateLimitReset = 0;

// Logging
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data,
    runId: currentRunId
  };
  
  // Console output
  const colors = {
    INFO: '\x1b[36m',
    SUCCESS: '\x1b[32m',
    WARN: '\x1b[33m',
    ERROR: '\x1b[31m',
    DEBUG: '\x1b[90m',
    RESET: '\x1b[0m'
  };
  
  const color = colors[level] || colors.INFO;
  console.log(`${color}[${timestamp}] [${level}]${colors.RESET} ${message}`);
  
  if (data && process.argv.includes('--verbose')) {
    console.log(JSON.stringify(data, null, 2));
  }
  
  // File logging
  const logFile = path.join(CONFIG.logsDir, `monitor-${new Date().toISOString().split('T')[0]}.log`);
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    if (!fs.existsSync(CONFIG.logsDir)) {
      fs.mkdirSync(CONFIG.logsDir, { recursive: true });
    }
    fs.appendFileSync(logFile, logLine);
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

// GitHub API request with rate limiting and retries
function githubApiRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const retries = options.retries || CONFIG.maxRetries;
    
    function attempt(attemptNum) {
      // Check rate limit
      if (rateLimitRemaining <= 1 && Date.now() < rateLimitReset * 1000) {
        const waitMs = (rateLimitReset * 1000) - Date.now();
        log('WARN', `Rate limit reached. Waiting ${Math.ceil(waitMs / 1000)}s...`);
        setTimeout(() => attempt(attemptNum), waitMs + 1000);
        return;
      }
      
      const token = process.env.GITHUB_TOKEN;
      const headers = {
        'User-Agent': 'SoftwareSawit-Validation-Monitor',
        'Accept': 'application/vnd.github.v3+json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      
      const reqOptions = {
        hostname: CONFIG.githubApiBase,
        path: `/repos/${CONFIG.owner}/${CONFIG.repo}${endpoint}`,
        method: 'GET',
        headers,
        timeout: 30000
      };
      
      const req = https.request(reqOptions, (res) => {
        // Update rate limit info
        rateLimitRemaining = parseInt(res.headers['x-ratelimit-remaining']) || rateLimitRemaining;
        rateLimitReset = parseInt(res.headers['x-ratelimit-reset']) || rateLimitReset;
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else if (res.statusCode === 403 && rateLimitRemaining <= 0) {
            log('WARN', 'Rate limited by GitHub API');
            if (attemptNum < retries) {
              const waitMs = (rateLimitReset * 1000) - Date.now();
              setTimeout(() => attempt(attemptNum + 1), Math.max(waitMs + 1000, CONFIG.retryDelay));
            } else {
              reject(new Error(`Rate limit exceeded. Reset at ${new Date(rateLimitReset * 1000)}`));
            }
          } else if (res.statusCode >= 500 && attemptNum < retries) {
            log('WARN', `Server error ${res.statusCode}, retrying...`);
            setTimeout(() => attempt(attemptNum + 1), CONFIG.retryDelay * attemptNum);
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (err) => {
        if (attemptNum < retries) {
          log('WARN', `Request failed, retrying... (${err.message})`);
          setTimeout(() => attempt(attemptNum + 1), CONFIG.retryDelay * attemptNum);
        } else {
          reject(err);
        }
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (attemptNum < retries) {
          log('WARN', 'Request timeout, retrying...');
          setTimeout(() => attempt(attemptNum + 1), CONFIG.retryDelay * attemptNum);
        } else {
          reject(new Error('Request timeout'));
        }
      });
      
      req.end();
    }
    
    attempt(1);
  });
}

// Get workflow runs
async function getWorkflowRuns(status = null, perPage = 10) {
  let endpoint = `/actions/runs?per_page=${perPage}`;
  if (status) {
    endpoint += `&status=${status}`;
  }
  
  const data = await githubApiRequest(endpoint);
  return data.workflow_runs || [];
}

// Get specific workflow run
async function getWorkflowRun(runId) {
  return await githubApiRequest(`/actions/runs/${runId}`);
}

// Get workflow run artifacts
async function getRunArtifacts(runId) {
  const data = await githubApiRequest(`/actions/runs/${runId}/artifacts`);
  return data.artifacts || [];
}

// Download artifact
async function downloadArtifact(artifact, destPath) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
      'User-Agent': 'SoftwareSawit-Validation-Monitor',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
    
    // Archive download URL requires a redirect
    const reqOptions = {
      hostname: CONFIG.githubApiBase,
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/artifacts/${artifact.id}/zip`,
      method: 'GET',
      headers,
      timeout: 60000
    };
    
    const req = https.request(reqOptions, (res) => {
      if (res.statusCode === 302 || res.statusCode === 307) {
        // Follow redirect
        const redirectUrl = new URL(res.headers.location);
        const redirectReq = https.get(redirectUrl, (redirectRes) => {
          if (redirectRes.statusCode !== 200) {
            reject(new Error(`Download failed: ${redirectRes.statusCode}`));
            return;
          }
          
          const chunks = [];
          redirectRes.on('data', chunk => chunks.push(chunk));
          redirectRes.on('end', () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(destPath, buffer);
            resolve(destPath);
          });
        });
        
        redirectReq.on('error', reject);
      } else if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(destPath, buffer);
          resolve(destPath);
        });
      } else {
        reject(new Error(`Unexpected status: ${res.statusCode}`));
      }
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
    
    req.end();
  });
}

// Extract ZIP file
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    try {
      // Use PowerShell on Windows, unzip on Unix
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;
        execSync(psCommand, { stdio: 'pipe', shell: 'powershell.exe' });
      } else {
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
      }
      
      resolve(destDir);
    } catch (err) {
      reject(new Error(`Failed to extract ${zipPath}: ${err.message}`));
    }
  });
}

// Parse test report and map to assertions
function parseTestReport(reportPath) {
  try {
    const content = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(content);
    
    const results = {
      timestamp: report.timestamp || new Date().toISOString(),
      runId: report.run_id,
      summary: report.summary || {},
      assertions: {}
    };
    
    // Map test results to validation assertions
    // The report should contain results array with test names
    if (report.results && Array.isArray(report.results)) {
      for (const result of report.results) {
        // Try to extract assertion ID from test name or metadata
        const assertionId = result.assertionId || result.validationId || extractAssertionId(result.name);
        
        if (assertionId) {
          results.assertions[assertionId] = {
            status: result.status,
            error: result.error || result.message || null,
            duration: result.duration,
            screenshot: result.screenshot || null,
            area: result.area || 'unknown'
          };
        }
      }
    }
    
    // Also check groups if present
    if (report.groups && Array.isArray(report.groups)) {
      for (const group of report.groups) {
        if (group.results && Array.isArray(group.results)) {
          for (const result of group.results) {
            const assertionId = result.assertionId || result.validationId || extractAssertionId(result.name);
            
            if (assertionId && !results.assertions[assertionId]) {
              results.assertions[assertionId] = {
                status: result.status,
                error: result.error || result.message || null,
                duration: result.duration,
                screenshot: result.screenshot || null,
                area: result.area || group.name || 'unknown'
              };
            }
          }
        }
      }
    }
    
    return results;
  } catch (err) {
    log('ERROR', `Failed to parse test report: ${err.message}`);
    return null;
  }
}

// Extract assertion ID from test name
function extractAssertionId(testName) {
  if (!testName) return null;
  
  // Match patterns like VAL-USER-001, VAL-KAS-010, etc.
  const match = testName.match(/VAL-[A-Z]+-\d+/);
  if (match) {
    return match[0];
  }
  
  // Try to map common test names to assertion IDs
  const nameMap = {
    'login': 'VAL-USER-050',
    'logout': 'VAL-USER-060',
    'create user': 'VAL-USER-001',
    'edit user': 'VAL-USER-010',
    'delete user': 'VAL-USER-020',
    'kas masuk': 'VAL-KAS-001',
    'kas keluar': 'VAL-KAS-002',
    'bank masuk': 'VAL-BANK-001',
    'bank keluar': 'VAL-BANK-002',
    'gudang masuk': 'VAL-GUDANG-001',
    'gudang keluar': 'VAL-GUDANG-002',
    'approve': 'VAL-KAS-037',
    'sync': 'VAL-SYNC-001',
    'coa': 'VAL-MASTER-COAS-001'
  };
  
  const lowerName = testName.toLowerCase();
  for (const [key, value] of Object.entries(nameMap)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  
  return null;
}

// Update validation state
function updateValidationState(results, dryRun = false) {
  try {
    // Read current validation state
    let validationState;
    try {
      const content = fs.readFileSync(CONFIG.validationStatePath, 'utf8');
      validationState = JSON.parse(content);
    } catch (err) {
      log('ERROR', `Failed to read validation state: ${err.message}`);
      return false;
    }
    
    if (!validationState.assertions) {
      validationState.assertions = {};
    }
    
    let updatedCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    
    // Update assertions based on test results
    for (const [assertionId, result] of Object.entries(results.assertions)) {
      const currentAssertion = validationState.assertions[assertionId];
      
      if (!currentAssertion) {
        log('WARN', `Assertion ${assertionId} not found in validation state`);
        continue;
      }
      
      // Only update if status changed
      if (currentAssertion.status !== result.status) {
        const oldStatus = currentAssertion.status;
        
        validationState.assertions[assertionId] = {
          ...currentAssertion,
          status: result.status,
          lastRun: results.timestamp,
          runId: results.runId,
          error: result.error,
          duration: result.duration,
          screenshot: result.screenshot,
          updatedAt: new Date().toISOString()
        };
        
        // Remove blockedBy if test passed
        if (result.status === 'passed') {
          delete validationState.assertions[assertionId].blockedBy;
          passedCount++;
        } else {
          failedCount++;
        }
        
        log('INFO', `Updated ${assertionId}: ${oldStatus} -> ${result.status}${result.error ? ' (' + result.error + ')' : ''}`);
        updatedCount++;
      }
    }
    
    // Update summary
    const assertions = Object.values(validationState.assertions);
    validationState.summary = {
      total: assertions.length,
      passed: assertions.filter(a => a.status === 'passed').length,
      failed: assertions.filter(a => a.status === 'failed').length,
      pending: assertions.filter(a => a.status === 'pending').length,
      lastUpdated: new Date().toISOString(),
      lastRunId: results.runId
    };
    
    log('SUCCESS', `Validation state updated: ${updatedCount} assertions changed (${passedCount} passed, ${failedCount} failed)`);
    log('INFO', `Summary: ${validationState.summary.passed}/${validationState.summary.total} passed (${((validationState.summary.passed / validationState.summary.total) * 100).toFixed(1)}%)`);
    
    if (!dryRun && updatedCount > 0) {
      // Write updated state atomically
      const tempPath = CONFIG.validationStatePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(validationState, null, 2), 'utf8');
      fs.renameSync(tempPath, CONFIG.validationStatePath);
      log('SUCCESS', `Validation state saved to ${CONFIG.validationStatePath}`);
    } else if (dryRun) {
      log('INFO', 'Dry run - no changes saved');
    }
    
    return true;
  } catch (err) {
    log('ERROR', `Failed to update validation state: ${err.message}`);
    return false;
  }
}

// Process artifacts for a run
async function processRunArtifacts(runId) {
  log('INFO', `Processing artifacts for run ${runId}...`);
  
  try {
    const artifacts = await getRunArtifacts(runId);
    log('INFO', `Found ${artifacts.length} artifacts`);
    
    if (artifacts.length === 0) {
      log('WARN', 'No artifacts found for this run');
      return null;
    }
    
    // Create artifacts directory
    const runArtifactsDir = path.join(CONFIG.artifactsDir, `run-${runId}`);
    if (!fs.existsSync(runArtifactsDir)) {
      fs.mkdirSync(runArtifactsDir, { recursive: true });
    }
    
    let aggregateReport = null;
    
    for (const artifact of artifacts) {
      log('INFO', `Downloading artifact: ${artifact.name} (${artifact.size_in_bytes} bytes)`);
      
      const zipPath = path.join(runArtifactsDir, `${artifact.name}.zip`);
      const extractPath = path.join(runArtifactsDir, artifact.name);
      
      try {
        // Download artifact
        await downloadArtifact(artifact, zipPath);
        log('DEBUG', `Downloaded to ${zipPath}`);
        
        // Extract artifact
        await extractZip(zipPath, extractPath);
        log('DEBUG', `Extracted to ${extractPath}`);
        
        // Look for test reports
        const reportPath = path.join(extractPath, 'reports', 'test-report.json');
        const aggregatePath = path.join(extractPath, 'aggregate-report.json');
        
        if (fs.existsSync(aggregatePath)) {
          log('INFO', `Found aggregate report: ${aggregatePath}`);
          aggregateReport = parseTestReport(aggregatePath);
        } else if (fs.existsSync(reportPath)) {
          log('INFO', `Found test report: ${reportPath}`);
          const report = parseTestReport(reportPath);
          if (report && !aggregateReport) {
            aggregateReport = report;
          }
        }
        
        // Clean up ZIP file
        fs.unlinkSync(zipPath);
      } catch (err) {
        log('ERROR', `Failed to process artifact ${artifact.name}: ${err.message}`);
      }
    }
    
    return aggregateReport;
  } catch (err) {
    log('ERROR', `Failed to process artifacts: ${err.message}`);
    return null;
  }
}

// Monitor a specific run
async function monitorRun(runId) {
  log('INFO', `Monitoring workflow run ${runId}...`);
  currentRunId = runId;
  
  try {
    const run = await getWorkflowRun(runId);
    
    log('INFO', `Run status: ${run.status}${run.conclusion ? ' (' + run.conclusion + ')' : ''}`);
    log('INFO', `Workflow: ${run.name}`);
    log('INFO', `Branch: ${run.head_branch}`);
    log('INFO', `Started: ${run.run_started_at}`);
    
    if (run.status !== 'completed') {
      log('INFO', `Run is still ${run.status}. Waiting...`);
      return { completed: false, run };
    }
    
    // Run completed - process artifacts
    log('SUCCESS', `Run completed with conclusion: ${run.conclusion}`);
    
    const results = await processRunArtifacts(runId);
    
    if (results) {
      const dryRun = process.argv.includes('--dry-run');
      updateValidationState(results, dryRun);
      return { completed: true, run, results };
    } else {
      log('WARN', 'No test results found in artifacts');
      return { completed: true, run, results: null };
    }
  } catch (err) {
    log('ERROR', `Failed to monitor run: ${err.message}`);
    return { completed: false, error: err.message };
  }
}

// Find and monitor latest run
async function monitorLatestRun() {
  log('INFO', 'Checking for latest workflow runs...');
  
  try {
    const runs = await getWorkflowRuns(null, 5);
    
    if (runs.length === 0) {
      log('WARN', 'No workflow runs found');
      return;
    }
    
    // Find the user testing workflow
    const userTestingRun = runs.find(r => r.name === CONFIG.workflowName);
    
    if (!userTestingRun) {
      log('WARN', `No runs found for workflow "${CONFIG.workflowName}"`);
      log('INFO', 'Available workflows:');
      runs.slice(0, 5).forEach(r => log('INFO', `  - ${r.name} (${r.status})`));
      return;
    }
    
    // Check if we've already processed this run
    const runId = userTestingRun.id;
    const processedRunsPath = path.join(CONFIG.logsDir, 'processed-runs.json');
    let processedRuns = [];
    
    try {
      if (fs.existsSync(processedRunsPath)) {
        processedRuns = JSON.parse(fs.readFileSync(processedRunsPath, 'utf8'));
      }
    } catch (e) {
      processedRuns = [];
    }
    
    if (processedRuns.includes(runId) && userTestingRun.status === 'completed') {
      log('INFO', `Run ${runId} already processed`);
      return;
    }
    
    // Monitor the run
    const result = await monitorRun(runId);
    
    // Mark as processed if completed
    if (result.completed && !processedRuns.includes(runId)) {
      processedRuns.push(runId);
      fs.writeFileSync(processedRunsPath, JSON.stringify(processedRuns, null, 2));
    }
  } catch (err) {
    log('ERROR', `Failed to monitor latest run: ${err.message}`);
  }
}

// Main polling loop
async function startMonitoring() {
  log('INFO', '========================================');
  log('INFO', 'GitHub Actions Monitor Started');
  log('INFO', `Repository: ${CONFIG.owner}/${CONFIG.repo}`);
  log('INFO', `Workflow: ${CONFIG.workflowName}`);
  log('INFO', `Poll Interval: ${CONFIG.pollInterval}ms`);
  log('INFO', `Validation State: ${CONFIG.validationStatePath}`);
  log('INFO', '========================================');
  
  // Ensure directories exist
  if (!fs.existsSync(CONFIG.artifactsDir)) {
    fs.mkdirSync(CONFIG.artifactsDir, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.logsDir)) {
    fs.mkdirSync(CONFIG.logsDir, { recursive: true });
  }
  
  // Handle specific run ID
  const runIdArg = process.argv.find(arg => arg.startsWith('--run-id='));
  if (runIdArg) {
    const runId = runIdArg.split('=')[1];
    await monitorRun(runId);
    process.exit(0);
  }
  
  // Single run mode
  if (process.argv.includes('--once')) {
    await monitorLatestRun();
    process.exit(0);
  }
  
  // Continuous monitoring
  async function poll() {
    if (!isRunning) return;
    
    await monitorLatestRun();
    
    if (isRunning) {
      pollTimer = setTimeout(poll, CONFIG.pollInterval);
    }
  }
  
  // Start polling
  poll();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    log('INFO', 'Shutting down monitor...');
    isRunning = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    log('INFO', 'Shutting down monitor...');
    isRunning = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
    process.exit(0);
  });
}

// Run if called directly
if (require.main === module) {
  startMonitoring().catch(err => {
    log('ERROR', `Monitor failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  CONFIG,
  log,
  githubApiRequest,
  getWorkflowRuns,
  getWorkflowRun,
  getRunArtifacts,
  downloadArtifact,
  extractZip,
  parseTestReport,
  updateValidationState,
  monitorRun,
  monitorLatestRun
};
