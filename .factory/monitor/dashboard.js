#!/usr/bin/env node
/**
 * Validation Dashboard for SoftwareSawit
 * 
 * Displays current validation status, progress bars, failed assertions,
 * and generates summary reports.
 * 
 * Usage:
 *   node dashboard.js [options]
 * 
 * Options:
 *   --format=<format>   Output format: console, html, json (default: console)
 *   --output=<path>     Output file path (default: stdout for console/json)
 *   --area=<area>       Filter by area (master, user, kas, bank, gudang, sync, admin, log, dev)
 *   --status=<status>   Filter by status: passed, failed, pending
 *   --watch             Watch mode - refresh every 30 seconds
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  validationStatePath: process.env.VALIDATION_STATE_PATH || 'C:/Users/acer/.factory/missions/a5b8148c-b18d-4f59-bf4e-c7dc099afefc/validation-state.json',
  validationContractPath: process.env.VALIDATION_CONTRACT_PATH || 'C:/Users/acer/.factory/missions/a5b8148c-b18d-4f59-bf4e-c7dc099afefc/validation-contract.md',
  artifactsBasePath: path.join(__dirname, 'artifacts'),
  watchInterval: 30000, // 30 seconds
};

// Area definitions for grouping
const AREAS = {
  'MASTER': { name: 'Master Data', color: '\x1b[36m', assertions: [] },
  'USER': { name: 'User Management', color: '\x1b[35m', assertions: [] },
  'KAS': { name: 'Kas Module', color: '\x1b[32m', assertions: [] },
  'BANK': { name: 'Bank Module', color: '\x1b[34m', assertions: [] },
  'GUDANG': { name: 'Gudang Module', color: '\x1b[33m', assertions: [] },
  'CROSS': { name: 'Cross-Area Flows', color: '\x1b[90m', assertions: [] },
  'SYNC': { name: 'Sync System', color: '\x1b[96m', assertions: [] },
  'ADMIN': { name: 'Admin Features', color: '\x1b[95m', assertions: [] },
  'LOG': { name: 'Logging System', color: '\x1b[37m', assertions: [] },
  'DEV': { name: 'DevTools & Debugging', color: '\x1b[94m', assertions: [] }
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Parse command line arguments
function parseArgs() {
  const args = {
    format: 'console',
    output: null,
    area: null,
    status: null,
    watch: false,
    verbose: false
  };
  
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--format=')) {
      args.format = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      args.output = arg.split('=')[1];
    } else if (arg.startsWith('--area=')) {
      args.area = arg.split('=')[1].toUpperCase();
    } else if (arg.startsWith('--status=')) {
      args.status = arg.split('=')[1].toLowerCase();
    } else if (arg === '--watch') {
      args.watch = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return args;
}

function showHelp() {
  console.log(`
Validation Dashboard for SoftwareSawit

Usage: node dashboard.js [options]

Options:
  --format=<format>   Output format: console, html, json (default: console)
  --output=<path>     Output file path
  --area=<area>       Filter by area (master, user, kas, bank, gudang, sync, admin, log, dev)
  --status=<status>   Filter by status: passed, failed, pending
  --watch             Watch mode - refresh every 30 seconds
  --verbose           Show detailed information
  --help, -h          Show this help message

Examples:
  node dashboard.js                           # Show console dashboard
  node dashboard.js --format=html --output=report.html
  node dashboard.js --area=kas --status=failed
  node dashboard.js --watch
`);
}

// Load validation state
function loadValidationState() {
  try {
    const content = fs.readFileSync(CONFIG.validationStatePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error loading validation state: ${err.message}`);
    return null;
  }
}

// Group assertions by area
function groupAssertionsByArea(state) {
  const grouped = {};
  
  // Initialize areas
  for (const [key, area] of Object.entries(AREAS)) {
    grouped[key] = {
      ...area,
      assertions: [],
      stats: { total: 0, passed: 0, failed: 0, pending: 0 }
    };
  }
  
  // Group assertions
  for (const [id, assertion] of Object.entries(state.assertions)) {
    const areaCode = id.split('-')[1];
    const areaKey = Object.keys(AREAS).find(key => areaCode.startsWith(key));
    
    if (areaKey && grouped[areaKey]) {
      grouped[areaKey].assertions.push({ id, ...assertion });
      grouped[areaKey].stats.total++;
      grouped[areaKey].stats[assertion.status]++;
    }
  }
  
  return grouped;
}

// Create progress bar
function createProgressBar(percent, width = 30) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  
  let color = '\x1b[31m'; // Red
  if (percent >= 80) color = '\x1b[32m'; // Green
  else if (percent >= 50) color = '\x1b[33m'; // Yellow
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${color}${bar}${RESET} ${percent.toFixed(1)}%`;
}

// Format console dashboard
function formatConsoleDashboard(state, grouped, args) {
  let output = '';
  
  // Header
  output += `${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}\n`;
  output += `${BOLD}║           SoftwareSawit Validation Dashboard                      ║${RESET}\n`;
  output += `${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}\n\n`;
  
  // Overall Summary
  const summary = state.summary;
  const passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
  
  output += `${BOLD}📊 Overall Progress${RESET}\n`;
  output += `   ${createProgressBar(passRate)}\n`;
  output += `   Total: ${summary.total} | ✅ Passed: ${summary.passed} | ❌ Failed: ${summary.failed} | ⏳ Pending: ${summary.pending || 0}\n`;
  if (summary.lastUpdated) {
    output += `   Last Updated: ${new Date(summary.lastUpdated).toLocaleString()}\n`;
  }
  output += '\n';
  
  // Area Breakdown
  output += `${BOLD}📋 Area Breakdown${RESET}\n`;
  output += `   ${'─'.repeat(60)}\n`;
  
  for (const [key, area] of Object.entries(grouped)) {
    if (area.stats.total === 0) continue;
    if (args.area && key !== args.area) continue;
    
    const areaPassRate = area.stats.total > 0 ? (area.stats.passed / area.stats.total) * 100 : 0;
    const statusIcon = area.stats.failed === 0 ? '✅' : area.stats.passed === 0 ? '❌' : '⚠️';
    
    output += `   ${area.color}${BOLD}${area.name}${RESET}\n`;
    output += `   ${createProgressBar(areaPassRate, 25)} `;
    output += `${area.stats.passed}/${area.stats.total} passed`;
    if (area.stats.failed > 0) {
      output += ` (${area.stats.failed} failed)`;
    }
    output += '\n\n';
  }
  
  // Failed Assertions
  const failedAssertions = [];
  for (const [key, area] of Object.entries(grouped)) {
    if (args.area && key !== args.area) continue;
    
    for (const assertion of area.assertions) {
      if (assertion.status === 'failed') {
        failedAssertions.push({ ...assertion, area: area.name });
      }
    }
  }
  
  if (failedAssertions.length > 0 && (!args.status || args.status === 'failed')) {
    output += `${BOLD}❌ Failed Assertions (${failedAssertions.length})${RESET}\n`;
    output += `   ${'─'.repeat(60)}\n`;
    
    for (const assertion of failedAssertions.slice(0, 20)) {
      output += `   ${assertion.id}\n`;
      output += `   Area: ${assertion.area}\n`;
      if (assertion.error) {
        output += `   Error: ${assertion.error.substring(0, 80)}${assertion.error.length > 80 ? '...' : ''}\n`;
      }
      if (assertion.blockedBy) {
        output += `   Blocked By: ${assertion.blockedBy.substring(0, 80)}${assertion.blockedBy.length > 80 ? '...' : ''}\n`;
      }
      if (assertion.screenshot) {
        output += `   Screenshot: ${assertion.screenshot}\n`;
      }
      output += '\n';
    }
    
    if (failedAssertions.length > 20) {
      output += `   ... and ${failedAssertions.length - 20} more failed assertions\n`;
    }
  }
  
  // Pending Assertions
  const pendingAssertions = [];
  for (const [key, area] of Object.entries(grouped)) {
    if (args.area && key !== args.area) continue;
    
    for (const assertion of area.assertions) {
      if (assertion.status === 'pending') {
        pendingAssertions.push({ ...assertion, area: area.name });
      }
    }
  }
  
  if (pendingAssertions.length > 0 && (!args.status || args.status === 'pending')) {
    output += `${BOLD}⏳ Pending Assertions (${pendingAssertions.length})${RESET}\n`;
    output += `   ${'─'.repeat(60)}\n`;
    
    for (const assertion of pendingAssertions.slice(0, 10)) {
      output += `   ${assertion.id} (${assertion.area})\n`;
    }
    
    if (pendingAssertions.length > 10) {
      output += `   ... and ${pendingAssertions.length - 10} more pending\n`;
    }
    output += '\n';
  }
  
  // Footer
  output += `${BOLD}══════════════════════════════════════════════════════════════════${RESET}\n`;
  output += `Generated: ${new Date().toLocaleString()}\n`;
  
  return output;
}

// Format HTML dashboard
function formatHtmlDashboard(state, grouped, args) {
  const summary = state.summary;
  const passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
  
  let areasHtml = '';
  for (const [key, area] of Object.entries(grouped)) {
    if (area.stats.total === 0) continue;
    if (args.area && key !== args.area) continue;
    
    const areaPassRate = area.stats.total > 0 ? (area.stats.passed / area.stats.total) * 100 : 0;
    const progressColor = areaPassRate >= 80 ? '#22c55e' : areaPassRate >= 50 ? '#eab308' : '#ef4444';
    
    areasHtml += `
      <div class="area-card">
        <h3>${area.name}</h3>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${areaPassRate}%; background: ${progressColor}"></div>
        </div>
        <div class="stats">
          <span class="stat passed">${area.stats.passed} passed</span>
          <span class="stat failed">${area.stats.failed} failed</span>
          <span class="stat total">${area.stats.total} total</span>
        </div>
      </div>
    `;
  }
  
  let failedHtml = '';
  const failedAssertions = [];
  for (const [key, area] of Object.entries(grouped)) {
    if (args.area && key !== args.area) continue;
    
    for (const assertion of area.assertions) {
      if (assertion.status === 'failed') {
        failedAssertions.push({ ...assertion, area: area.name });
      }
    }
  }
  
  if (failedAssertions.length > 0) {
    failedHtml = '<h2>❌ Failed Assertions</h2><div class="failed-list">';
    for (const assertion of failedAssertions) {
      failedHtml += `
        <div class="failed-item">
          <div class="failed-header">
            <code>${assertion.id}</code>
            <span class="area-tag">${assertion.area}</span>
          </div>
          ${assertion.error ? `<div class="error-message">${assertion.error}</div>` : ''}
          ${assertion.blockedBy ? `<div class="blocked-by">Blocked: ${assertion.blockedBy}</div>` : ''}
          ${assertion.screenshot ? `<div class="screenshot-link"><a href="${assertion.screenshot}">📸 View Screenshot</a></div>` : ''}
        </div>
      `;
    }
    failedHtml += '</div>';
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SoftwareSawit Validation Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 {
      text-align: center;
      margin-bottom: 2rem;
      font-size: 2.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .summary-card {
      background: #1e293b;
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      text-align: center;
    }
    .progress-ring {
      width: 200px;
      height: 200px;
      margin: 0 auto 1rem;
      position: relative;
    }
    .progress-ring svg {
      transform: rotate(-90deg);
    }
    .progress-ring-bg {
      fill: none;
      stroke: #334155;
      stroke-width: 10;
    }
    .progress-ring-fill {
      fill: none;
      stroke: ${passRate >= 80 ? '#22c55e' : passRate >= 50 ? '#eab308' : '#ef4444'};
      stroke-width: 10;
      stroke-linecap: round;
      stroke-dasharray: ${2 * Math.PI * 90};
      stroke-dashoffset: ${2 * Math.PI * 90 * (1 - passRate / 100)};
      transition: stroke-dashoffset 0.5s ease;
    }
    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 2.5rem;
      font-weight: bold;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .stat-box {
      background: #334155;
      padding: 1rem;
      border-radius: 0.5rem;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
    }
    .stat-label { color: #94a3b8; }
    .areas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .area-card {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .area-card h3 {
      margin-bottom: 1rem;
      color: #60a5fa;
    }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.75rem;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
    }
    .stat.passed { color: #22c55e; }
    .stat.failed { color: #ef4444; }
    .stat.total { color: #94a3b8; }
    .failed-list {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .failed-item {
      background: #334155;
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1rem;
      border-left: 4px solid #ef4444;
    }
    .failed-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .failed-header code {
      background: #0f172a;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-family: monospace;
    }
    .area-tag {
      background: #4f46e5;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
    }
    .error-message {
      color: #fca5a5;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .blocked-by {
      color: #fbbf24;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .screenshot-link a {
      color: #60a5fa;
      text-decoration: none;
    }
    .screenshot-link a:hover {
      text-decoration: underline;
    }
    .timestamp {
      text-align: center;
      color: #64748b;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 SoftwareSawit Validation Dashboard</h1>
    
    <div class="summary-card">
      <div class="progress-ring">
        <svg width="200" height="200">
          <circle class="progress-ring-bg" cx="100" cy="100" r="90"/>
          <circle class="progress-ring-fill" cx="100" cy="100" r="90"/>
        </svg>
        <div class="progress-text">${passRate.toFixed(1)}%</div>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value" style="color: #22c55e">${summary.passed}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color: #ef4444">${summary.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color: #eab308">${summary.pending || 0}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${summary.total}</div>
          <div class="stat-label">Total</div>
        </div>
      </div>
    </div>
    
    <h2>📋 Area Breakdown</h2>
    <div class="areas-grid">
      ${areasHtml}
    </div>
    
    ${failedHtml}
    
    <div class="timestamp">
      Generated: ${new Date().toLocaleString()}
      ${summary.lastUpdated ? `<br>Last Updated: ${new Date(summary.lastUpdated).toLocaleString()}` : ''}
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

// Format JSON report
function formatJsonReport(state, grouped, args) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: state.summary,
    areas: {}
  };
  
  for (const [key, area] of Object.entries(grouped)) {
    if (area.stats.total === 0) continue;
    if (args.area && key !== args.area) continue;
    
    report.areas[key] = {
      name: area.name,
      stats: area.stats,
      assertions: area.assertions.filter(a => {
        if (args.status) return a.status === args.status;
        return true;
      })
    };
  }
  
  return JSON.stringify(report, null, 2);
}

// Generate and output dashboard
function generateDashboard(args) {
  const state = loadValidationState();
  if (!state) {
    console.error('Failed to load validation state');
    process.exit(1);
  }
  
  const grouped = groupAssertionsByArea(state);
  
  let output;
  switch (args.format) {
    case 'html':
      output = formatHtmlDashboard(state, grouped, args);
      break;
    case 'json':
      output = formatJsonReport(state, grouped, args);
      break;
    case 'console':
    default:
      output = formatConsoleDashboard(state, grouped, args);
      break;
  }
  
  if (args.output) {
    fs.writeFileSync(args.output, output, 'utf8');
    console.log(`Dashboard saved to ${args.output}`);
  } else {
    console.log(output);
  }
  
  return state.summary;
}

// Watch mode
function watchMode(args) {
  console.log('Watch mode enabled. Press Ctrl+C to exit.\n');
  
  function refresh() {
    console.clear();
    generateDashboard(args);
    console.log(`\n⏱️  Refreshing in ${CONFIG.watchInterval / 1000}s...`);
  }
  
  refresh();
  setInterval(refresh, CONFIG.watchInterval);
}

// Main
function main() {
  const args = parseArgs();
  
  if (args.watch) {
    watchMode(args);
  } else {
    const summary = generateDashboard(args);
    
    // Exit with error code if there are failures
    if (summary.failed > 0) {
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  CONFIG,
  AREAS,
  loadValidationState,
  groupAssertionsByArea,
  formatConsoleDashboard,
  formatHtmlDashboard,
  formatJsonReport,
  generateDashboard
};
