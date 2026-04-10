# GitHub Actions Auto-Monitor

A background monitoring system that polls GitHub Actions workflow status every 5 minutes and sends notifications on important events.

## Features

- **Continuous Monitoring**: Polls GitHub Actions API every 5 minutes
- **Smart Notifications**: Alerts on:
  - New workflow runs started
  - Workflow completion (success/failure)
  - Individual job failures
- **State Persistence**: Remembers seen runs across restarts
- **Graceful Shutdown**: Handles Ctrl+C properly
- **Windows Notifications**: Native toast notifications
- **Comprehensive Logging**: All activities logged to file

## Files

```
.factory/monitor/
├── auto-monitor.js      # Main daemon script
├── start-monitor.bat    # Start the monitor
├── stop-monitor.bat     # Stop the monitor
├── status.bat           # Check monitor status
├── logs/                # Log files
│   └── auto-monitor.log
└── state/               # State files
    ├── monitor.pid
    └── monitor-state.json
```

## Usage

### Start the Monitor

```batch
.factory\monitor\start-monitor.bat
```

This will:
- Start the monitor in the background
- Show the process PID
- Begin polling GitHub Actions immediately

### Check Status

```batch
.factory\monitor\status.bat
```

Shows:
- Current monitor status (running/stopped)
- Process information
- Last check time
- Recent log entries

### Stop the Monitor

```batch
.factory\monitor\stop-monitor.bat
```

Gracefully stops the monitor and cleans up PID files.

### View Logs

```batch
type .factory\monitor\logs\auto-monitor.log
```

Or for live viewing:
```batch
tail -f .factory\monitor\logs\auto-monitor.log
```

## Configuration

Edit `auto-monitor.js` to change settings:

```javascript
const CONFIG = {
  owner: 'adi805',
  repo: 'SoftwareSawit',
  workflowName: 'User Testing - Electron GUI Tests',
  pollInterval: 5 * 60 * 1000,  // 5 minutes
  pat: process.env.GITHUB_PAT || 'your-pat-here'
};
```

### Environment Variables

- `GITHUB_PAT`: GitHub Personal Access Token (overrides hardcoded value)

## Rate Limiting

The monitor uses authenticated API requests with a limit of 5,000 requests/hour.
With default settings (polling every 5 minutes), it uses ~12 requests/hour.

## Notifications

The monitor sends Windows toast notifications for:
- 🚀 New workflow runs
- ✅ Successful completions
- ❌ Failed workflows

## Troubleshooting

### Monitor won't start
- Check if Node.js is installed: `node --version`
- Check if already running: `status.bat`
- Check logs: `logs/auto-monitor.log`

### Authentication errors
- Verify the PAT is valid and not expired
- Ensure the PAT has `repo` scope for private repositories
- Check rate limit: view logs for 403 errors

### Notifications not showing
- Windows Focus Assist may block notifications
- Check Windows notification settings
- PowerShell execution policy may block notifications

## API Reference

The monitor uses these GitHub API endpoints:
- `GET /repos/{owner}/{repo}/actions/runs` - List workflow runs
- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` - Get job details

## License

Part of SoftwareSawit project.
