#!/usr/bin/env node

/**
 * SoftwareSawit Mission Runner
 * Monitors GitHub Actions runs and reports status
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = 'adi805/SoftwareSawit';
const WORKFLOW_ID = '258751131';
const CHECK_INTERVAL = 60000; // 1 minute

class MissionRunner {
  constructor() {
    this.state = {
      currentRun: null,
      lastCheck: null,
      history: []
    };
    this.loadState();
  }

  loadState() {
    const statePath = path.join(__dirname, 'mission-state.json');
    if (fs.existsSync(statePath)) {
      try {
        this.state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        console.log(`[MissionRunner] Loaded state: Run #${this.state.currentRun?.run_number || 'none'}`);
      } catch (e) {
        console.log('[MissionRunner] No previous state found');
      }
    }
  }

  saveState() {
    const statePath = path.join(__dirname, 'mission-state.json');
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }

  async githubApi(endpoint) {
    return new Promise((resolve, reject) => {
      const token = process.env.GITHUB_TOKEN;
      const options = {
        hostname: 'api.github.com',
        path: endpoint,
        method: 'GET',
        headers: {
          'User-Agent': 'SoftwareSawit-Mission-Runner',
          'Accept': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async getLatestRuns() {
    const runs = await this.githubApi(`/repos/${REPO}/actions/runs?per_page=5`);
    return runs.workflow_runs || [];
  }

  async getRunDetails(runId) {
    return await this.githubApi(`/repos/${REPO}/actions/runs/${runId}`);
  }

  async getJobs(runId) {
    const jobs = await this.githubApi(`/repos/${REPO}/actions/runs/${runId}/jobs`);
    return jobs.jobs || [];
  }

  formatDuration(start, end) {
    const ms = new Date(end) - new Date(start);
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  async triggerWorkflow() {
    return new Promise((resolve, reject) => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        reject(new Error('GITHUB_TOKEN not set'));
        return;
      }

      const options = {
        hostname: 'api.github.com',
        path: `/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
        method: 'POST',
        headers: {
          'User-Agent': 'SoftwareSawit-Mission-Runner',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 204) {
            resolve(true);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({ ref: 'master' }));
      req.end();
    });
  }

  async checkAndReport() {
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toISOString()}] Mission Status Check`);
    console.log('='.repeat(60));

    try {
      const runs = await this.getLatestRuns();
      
      if (runs.length === 0) {
        console.log('No workflow runs found');
        return;
      }

      const latest = runs[0];
      this.state.currentRun = {
        id: latest.id,
        run_number: latest.run_number,
        status: latest.status,
        conclusion: latest.conclusion,
        branch: latest.head_branch,
        sha: latest.head_sha.substring(0, 7),
        created_at: latest.created_at,
        started_at: latest.run_started_at,
        html_url: latest.html_url
      };

      console.log(`\nLatest Run: #${latest.run_number}`);
      console.log(`Branch: ${latest.head_branch}`);
      console.log(`Commit: ${latest.head_sha.substring(0, 7)}`);
      console.log(`Status: ${latest.status} ${latest.conclusion ? `(${latest.conclusion})` : ''}`);
      console.log(`URL: ${latest.html_url}`);

      if (latest.status === 'in_progress') {
        console.log('\n⏳ Run is still running...');
        console.log('Checking jobs...');
        
        const jobs = await this.getJobs(latest.id);
        for (const job of jobs) {
          const icon = job.conclusion === 'success' ? '✅' : 
                       job.conclusion === 'failure' ? '❌' : '🔄';
          console.log(`  ${icon} ${job.name}: ${job.status}`);
        }
      }

      if (latest.status === 'completed') {
        console.log('\n📊 Run completed!');
        
        if (latest.conclusion === 'success') {
          console.log('\n🎉 ALL TESTS PASSED! Mission Complete!');
        } else if (latest.conclusion === 'failure') {
          console.log('\n❌ Tests failed. Checking details...');
          const jobs = await this.getJobs(latest.id);
          const failedJobs = jobs.filter(j => j.conclusion === 'failure');
          for (const job of failedJobs) {
            console.log(`  ❌ ${job.name}`);
          }
        }
      }

      // Check if this is a new run
      if (this.state.lastCheck && this.state.lastCheck.id !== latest.id) {
        console.log('\n🆕 New run detected!');
        console.log(`Previous run: #${this.state.lastCheck.run_number} (${this.state.lastCheck.conclusion || this.state.lastCheck.status})`);
        this.state.history.push(this.state.lastCheck);
        if (this.state.history.length > 10) {
          this.state.history.shift();
        }
      }

      this.state.lastCheck = { ...this.state.currentRun };
      this.saveState();

    } catch (e) {
      console.error('Error checking status:', e.message);
    }

    console.log('\n' + '-'.repeat(60));
  }

  async run() {
    console.log('SoftwareSawit Mission Runner');
    console.log('===========================');
    console.log(`Monitoring: ${REPO}`);
    console.log(`Check interval: ${CHECK_INTERVAL / 1000}s`);
    console.log('');

    // Initial check
    await this.checkAndReport();

    // Periodic checks
    setInterval(() => this.checkAndReport(), CHECK_INTERVAL);
  }
}

// CLI interface
const runner = new MissionRunner();

if (process.argv.includes('--once')) {
  runner.checkAndReport().then(() => process.exit(0));
} else if (process.argv.includes('--trigger')) {
  console.log('Triggering workflow...');
  runner.triggerWorkflow()
    .then(() => {
      console.log('Workflow triggered!');
      process.exit(0);
    })
    .catch(e => {
      console.error('Failed to trigger:', e.message);
      process.exit(1);
    });
} else {
  runner.run();
}

module.exports = MissionRunner;
