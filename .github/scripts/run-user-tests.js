/**
 * User Testing Runner for SoftwareSawit
 * 
 * This script launches the Electron app and runs 146 user assertions
 * grouped by functional areas. It uses Playwright to control the Electron
 * app and capture screenshots for verification.
 * 
 * Usage:
 *   node run-user-tests.js
 * 
 * Environment Variables:
 *   TEST_AREAS - Comma-separated list of areas to test (default: all)
 *   SCREENSHOT_MODE - all|failures|none (default: all)
 *   TEST_GROUP - Current test group (auth|transactions|sync|approval)
 *   TEST_PATTERN - Pattern for filtering tests
 *   HEADLESS - Run in headless mode (default: false for Windows)
 */

const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');

// ==========================================
// Import Test Modules
// ==========================================
const AuthTests = require('../tests/auth.test.js');
const MasterDataTests = require('../tests/master.test.js');
const KasTests = require('../tests/kas.test.js');
const BankTests = require('../tests/bank.test.js');
const GudangTests = require('../tests/gudang.test.js');
const SyncTests = require('../tests/sync.test.js');
const CrossTests = require('../tests/cross.test.js');

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
  testAreas: (process.env.TEST_AREAS || 'all').split(',').map(s => s.trim()),
  screenshotMode: process.env.SCREENSHOT_MODE || 'all',
  testGroup: process.env.TEST_GROUP || 'all',
  testPattern: process.env.TEST_PATTERN || '',
  headless: process.env.HEADLESS === 'true' || false,
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
  appPath: path.resolve(__dirname, '../../'),
  mainPath: path.resolve(__dirname, '../../dist/main/main.js'),
  resultsDir: path.resolve(__dirname, '../../test-results'),
  screenshotsDir: path.resolve(__dirname, '../../test-results/screenshots'),
  reportsDir: path.resolve(__dirname, '../../test-results/reports'),
  logsDir: path.resolve(__dirname, '../../test-results/logs'),
};

// ==========================================
// Test Results Tracking
// ==========================================
const testResults = {
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    startTime: null,
    endTime: null,
  },
  results: [],
  screenshots: [],
};

let electronApp = null;
let mainWindow = null;
let currentArea = '';

// ==========================================
// Utility Functions
// ==========================================

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // Also write to log file
  const logFile = path.join(CONFIG.logsDir, 'test-run.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

function ensureDirectories() {
  [CONFIG.resultsDir, CONFIG.screenshotsDir, CONFIG.reportsDir, CONFIG.logsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

async function captureScreenshot(name, page = mainWindow) {
  if (CONFIG.screenshotMode === 'none') return null;
  
  const timestamp = Date.now();
  const filename = `${currentArea}_${name}_${timestamp}.png`;
  const filepath = path.join(CONFIG.screenshotsDir, filename);
  
  try {
    await page.screenshot({ path: filepath, fullPage: true });
    testResults.screenshots.push({
      name,
      filename,
      path: filepath,
      timestamp: new Date().toISOString(),
      area: currentArea,
    });
    log(`Screenshot captured: ${filename}`);
    return filepath;
  } catch (error) {
    log(`Failed to capture screenshot: ${error.message}`, 'error');
    return null;
  }
}

function recordResult(name, status, error = null, duration = 0, metadata = {}) {
  const result = {
    id: `test-${testResults.results.length + 1}`,
    name,
    status,
    error: error ? error.message || String(error) : null,
    duration,
    timestamp: new Date().toISOString(),
    area: currentArea,
    group: CONFIG.testGroup,
    ...metadata,
  };
  
  testResults.results.push(result);
  testResults.summary.total++;
  
  if (status === 'passed') {
    testResults.summary.passed++;
    log(`✅ PASSED: ${name} (${duration}ms)`);
  } else if (status === 'failed') {
    testResults.summary.failed++;
    log(`❌ FAILED: ${name} - ${result.error}`, 'error');
  } else if (status === 'skipped') {
    testResults.summary.skipped++;
    log(`⏭️ SKIPPED: ${name}`);
  }
  
  return result;
}

async function runAssertion(name, assertionFn, metadata = {}) {
  const startTime = Date.now();
  
  try {
    await assertionFn();
    const duration = Date.now() - startTime;
    return recordResult(name, 'passed', null, duration, metadata);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Capture screenshot on failure if mode is 'failures' or 'all'
    if (CONFIG.screenshotMode !== 'none') {
      await captureScreenshot(`failure_${name}`);
    }
    
    // If optional, mark as skipped instead of failed
    if (metadata.optional) {
      return recordResult(name, 'skipped', error, duration, metadata);
    }
    
    return recordResult(name, 'failed', error, duration, metadata);
  }
}

function shouldRunArea(area) {
  if (CONFIG.testAreas.includes('all')) return true;
  return CONFIG.testAreas.some(a => area.toLowerCase().includes(a.toLowerCase()));
}

function shouldRunTest(testName) {
  if (!CONFIG.testPattern) return true;
  const patterns = CONFIG.testPattern.split(',').map(p => p.trim().toLowerCase());
  return patterns.some(p => testName.toLowerCase().includes(p));
}

// ==========================================
// Electron App Lifecycle
// ==========================================

async function launchApp() {
  log('Launching Electron application...');
  
  // Check if main.js exists
  if (!fs.existsSync(CONFIG.mainPath)) {
    throw new Error(`Main script not found at ${CONFIG.mainPath}. Run 'npm run build' first.`);
  }
  
  electronApp = await electron.launch({
    args: [CONFIG.mainPath],
    cwd: CONFIG.appPath,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: 'true',
      ELECTRON_ENABLE_STACK_DUMPING: 'true',
    },
    // Windows-specific: Don't use headless mode for GUI tests
    headless: CONFIG.headless,
  });
  
  // Wait for the first BrowserWindow
  mainWindow = await electronApp.firstWindow();
  
  // Set viewport size
  await mainWindow.setViewportSize({ width: 1400, height: 900 });
  
  // Wait for app to be ready
  await mainWindow.waitForLoadState('domcontentloaded');
  await mainWindow.waitForTimeout(2000); // Additional wait for React to mount
  
  log('Electron application launched successfully');
  return { app: electronApp, window: mainWindow };
}

async function closeApp() {
  if (electronApp) {
    log('Closing Electron application...');
    await electronApp.close();
    electronApp = null;
    mainWindow = null;
  }
}

// ==========================================
// Main Test Runner - Using Modular Test Classes
// ==========================================

async function runAllTests() {
  testResults.summary.startTime = new Date().toISOString();
  
  try {
    ensureDirectories();
    log('Starting User Testing Suite');
    log(`Configuration: ${JSON.stringify(CONFIG, null, 2)}`);
    
    // Launch Electron app
    await launchApp();
    
    // Initialize test classes with shared dependencies
    const authTests = new AuthTests(mainWindow, captureScreenshot, runAssertion);
    const masterTests = new MasterDataTests(mainWindow, captureScreenshot, runAssertion);
    const kasTests = new KasTests(mainWindow, captureScreenshot, runAssertion);
    const bankTests = new BankTests(mainWindow, captureScreenshot, runAssertion);
    const gudangTests = new GudangTests(mainWindow, captureScreenshot, runAssertion);
    const syncTests = new SyncTests(mainWindow, captureScreenshot, runAssertion);
    const crossTests = new CrossTests(mainWindow, captureScreenshot, runAssertion);
    
    // Run tests based on configuration
    const testAreas = [
      { name: 'auth', instance: authTests, method: 'runAll' },
      { name: 'master', instance: masterTests, method: 'runAll' },
      { name: 'kas', instance: kasTests, method: 'runAll' },
      { name: 'bank', instance: bankTests, method: 'runAll' },
      { name: 'gudang', instance: gudangTests, method: 'runAll' },
      { name: 'sync', instance: syncTests, method: 'runAll' },
      { name: 'cross', instance: crossTests, method: 'runAll' },
    ];
    
    for (const area of testAreas) {
      if (shouldRunArea(area.name) || CONFIG.testAreas.includes('all')) {
        try {
          log(`Running ${area.name} tests...`);
          await area.instance[area.method]();
        } catch (error) {
          log(`Error in ${area.name} tests: ${error.message}`, 'error');
          // Continue with other areas
        }
      } else {
        log(`Skipping area: ${area.name}`);
      }
    }
    
  } catch (error) {
    log(`Fatal error during test execution: ${error.message}`, 'error');
    console.error(error);
  } finally {
    // Close app
    await closeApp();
    
    // Finalize results
    testResults.summary.endTime = new Date().toISOString();
    testResults.summary.duration = new Date(testResults.summary.endTime) - new Date(testResults.summary.startTime);
    
    // Generate report
    await generateReport();
  }
}

async function generateReport() {
  const reportPath = path.join(CONFIG.reportsDir, 'test-report.json');
  const htmlReportPath = path.join(CONFIG.reportsDir, 'test-report.html');
  
  // JSON Report
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  log(`JSON report saved to: ${reportPath}`);
  
  // HTML Report
  const htmlReport = generateHTMLReport();
  fs.writeFileSync(htmlReportPath, htmlReport);
  log(`HTML report saved to: ${htmlReportPath}`);
  
  // Console summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total:    ${testResults.summary.total}`);
  console.log(`Passed:   ${testResults.summary.passed} ✅`);
  console.log(`Failed:   ${testResults.summary.failed} ❌`);
  console.log(`Skipped:  ${testResults.summary.skipped} ⏭️`);
  console.log(`Duration: ${(testResults.summary.duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));
  
  // Exit with error code if tests failed
  if (testResults.summary.failed > 0) {
    process.exitCode = 1;
  }
}

function generateHTMLReport() {
  const passRate = testResults.summary.total > 0 
    ? ((testResults.summary.passed / testResults.summary.total) * 100).toFixed(1) 
    : 0;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SoftwareSawit Test Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h3 { font-size: 14px; color: #666; margin-bottom: 10px; text-transform: uppercase; }
    .card .value { font-size: 32px; font-weight: bold; }
    .card.passed .value { color: #10b981; }
    .card.failed .value { color: #ef4444; }
    .card.skipped .value { color: #f59e0b; }
    .card.total .value { color: #3b82f6; }
    .progress-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-fill { height: 100%; background: #10b981; border-radius: 4px; transition: width 0.3s; }
    .results-table { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .results-table table { width: 100%; border-collapse: collapse; }
    .results-table th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
    .results-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .results-table tr:hover { background: #f9fafb; }
    .status-badge { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-passed { background: #d1fae5; color: #065f46; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-skipped { background: #fef3c7; color: #92400e; }
    .error-message { color: #ef4444; font-size: 12px; margin-top: 5px; }
    .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 20px; }
    .screenshot { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .screenshot img { width: 100%; height: 200px; object-fit: cover; }
    .screenshot .info { padding: 10px; }
    .screenshot .name { font-weight: 600; font-size: 14px; }
    .screenshot .area { font-size: 12px; color: #666; }
    .timestamp { color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 SoftwareSawit Test Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <p>Group: ${CONFIG.testGroup}</p>
    </div>
    
    <div class="summary-cards">
      <div class="card total">
        <h3>Total Tests</h3>
        <div class="value">${testResults.summary.total}</div>
      </div>
      <div class="card passed">
        <h3>Passed</h3>
        <div class="value">${testResults.summary.passed}</div>
      </div>
      <div class="card failed">
        <h3>Failed</h3>
        <div class="value">${testResults.summary.failed}</div>
      </div>
      <div class="card skipped">
        <h3>Skipped</h3>
        <div class="value">${testResults.summary.skipped}</div>
      </div>
    </div>
    
    <div class="card" style="margin-bottom: 20px;">
      <h3>Pass Rate</h3>
      <div style="display: flex; align-items: center; gap: 15px;">
        <span style="font-size: 24px; font-weight: bold; color: ${passRate >= 80 ? '#10b981' : passRate >= 50 ? '#f59e0b' : '#ef4444'};">${passRate}%</span>
        <div class="progress-bar" style="flex: 1;">
          <div class="progress-fill" style="width: ${passRate}%;"></div>
        </div>
      </div>
      <p class="timestamp">Duration: ${(testResults.summary.duration / 1000).toFixed(2)}s</p>
    </div>
    
    <div class="results-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Test Name</th>
            <th>Area</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${testResults.results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.name}</td>
              <td>${r.area}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span></td>
              <td>${r.duration}ms</td>
              <td>${r.error ? `<div class="error-message">${r.error}</div>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    ${testResults.screenshots.length > 0 ? `
    <h2 style="margin: 30px 0 15px;">📸 Screenshots</h2>
    <div class="screenshots">
      ${testResults.screenshots.map(s => `
        <div class="screenshot">
          <img src="../screenshots/${s.filename}" alt="${s.name}" loading="lazy">
          <div class="info">
            <div class="name">${s.name}</div>
            <div class="area">${s.area}</div>
            <div class="timestamp">${new Date(s.timestamp).toLocaleString()}</div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>
</body>
</html>`;
}

// ==========================================
// Run Tests
// ==========================================
runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
