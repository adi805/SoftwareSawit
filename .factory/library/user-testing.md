# User Testing Guide

## Validation Surface

### Electron Desktop App (Primary)

The main validation surface is the Electron desktop application. Testing is done via **agent-browser** with Chrome DevTools Protocol (CDP).

#### CDP Connection

Electron runs with `--remote-debugging-port=9223` flag. Connect agent-browser to:
- `http://localhost:9223/json/list` - List debuggable targets
- Use `webSocketDebuggerUrl` to attach

#### Entry Points

1. **Sync Settings Page**: `/#/sync-settings`
   - Queue statistics
   - Retry buttons
   - Progress indicator
   - Clear queue button
   - Conflict badge

2. **Module List Pages**: `/#/kas`, `/#/bank`, `/#/gudang`
   - Sync status badges
   - Transaction lists

#### Isolation Strategy

- Each test run uses fresh app state
- Database seeded with test data before tests
- Conflicts created programmatically for testing
- No shared state between parallel validators

## Required Testing Skills/Tools

- **agent-browser**: REQUIRED for all UI validation
  - Navigate pages
  - Click elements
  - Take screenshots
  - Access DOM
  - Verify styling

## Resource Cost Classification

### Per-Validator Resource Usage

| Surface | Memory | CPU | Notes |
|---------|--------|-----|-------|
| Electron App | ~400MB | Medium | Includes main + renderer processes |
| agent-browser | ~100MB | Low | Playwright session |
| Dev Server | ~200MB | Low | Vite dev server (shared) |

**Total per validator**: ~700MB

### Concurrency Limit

On a machine with 8GB RAM and 4 CPU cores:
- Usable headroom: ~5GB (70% of available)
- Max concurrent validators: **5**

With 5 validators:
- Total memory: ~3.5GB
- Headroom remaining: ~1.5GB

## Testing Procedures

### Pre-Test Setup

1. Start dev server: `npm run dev:renderer`
2. Start Electron: `npm run dev:main`
3. Wait for app to load
4. Seed test data if needed

### Assertion Testing

For each assertion:
1. Navigate to relevant page
2. Verify precondition state
3. Perform action
4. Verify expected outcome
5. Take screenshot as evidence

### Post-Test Cleanup

1. Stop Electron: taskkill electron.exe
2. Stop dev server: taskkill node.exe
3. Clear test data if needed

## Common Gotchas

1. **Timing**: Electron may take 5-10s to fully initialize
2. **Focus**: Window must be focused for some interactions
3. **State**: Sync state changes asynchronously - add waits
4. **Dialogs**: Confirmation dialogs block interaction - handle explicitly
