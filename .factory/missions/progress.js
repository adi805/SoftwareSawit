#!/usr/bin/env node
/**
 * Mission Progress Tracker
 * Displays real-time progress bar for SoftwareSawit mission
 */

const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const LOG_FILE = path.join(__dirname, '../monitor/logs/auto-monitor.log');

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function renderProgressBar(percentage, width = 50) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatTime(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function display() {
  console.clear();
  const progress = loadProgress();
  
  if (!progress) {
    console.log('❌ Progress file not found');
    return;
  }

  const { passed, failed, pending, percentage } = progress.progress;
  const total = progress.totalAssertions;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           🚀 SoftwareSawit Mission Progress                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Progress Bar
  console.log(`Progress: ${percentage}%`);
  console.log(`[${renderProgressBar(percentage)}]`);
  console.log('');
  
  // Stats
  console.log('📊 Statistics:');
  console.log(`   ✅ Passed:  ${passed}/${total}`);
  console.log(`   ❌ Failed:  ${failed}/${total}`);
  console.log(`   ⏳ Pending: ${pending}/${total}`);
  console.log('');
  
  // Current Run
  console.log('🔄 Current Run:');
  console.log(`   Run #${progress.currentRun.runNumber}: ${progress.currentRun.status}`);
  console.log(`   Last Updated: ${formatTime(progress.lastUpdated)}`);
  console.log('');
  
  // Status
  const statusIcon = progress.status === 'COMPLETED' ? '✅' : 
                     progress.status === 'IN_PROGRESS' ? '⏳' : '❌';
  console.log(`Status: ${statusIcon} ${progress.status}`);
  
  if (progress.estimatedCompletion) {
    console.log(`Estimated Completion: ${formatTime(progress.estimatedCompletion)}`);
  }
  
  console.log('');
  console.log('Press Ctrl+C to exit. Auto-refresh every 10 seconds...');
}

// Initial display
display();

// Auto-refresh
setInterval(display, 10000);
