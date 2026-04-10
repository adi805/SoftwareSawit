# SoftwareSawit Test Suite

This directory contains the automated test suite for SoftwareSawit, an Electron-based desktop application for managing plantation financial data.

## Overview

The test suite implements **146 behavioral assertions** from the validation contract, organized into 7 test modules:

| Test File | Assertions | Description |
|-----------|------------|-------------|
| `auth.test.js` | VAL-USER-* | Authentication, user management, sessions, activity logs |
| `master.test.js` | VAL-MASTER-* | COA, Aspek Kerja, Blok master data management |
| `kas.test.js` | VAL-KAS-* | Kas module transactions and approval workflows |
| `bank.test.js` | VAL-BANK-* | Bank module transactions and approval workflows |
| `gudang.test.js` | VAL-GUDANG-* | Gudang (inventory) module transactions |
| `sync.test.js` | VAL-SYNC-*, VAL-ADMIN-* | Sync system and admin configuration features |
| `cross.test.js` | VAL-CROSS-* | Cross-area flows and integration tests |

## Prerequisites

- Node.js 18+ installed
- Playwright installed (`npm install`)
- Application built (`npm run build`)

## Running Tests

### Run All Tests
```bash
node .github/scripts/run-user-tests.js
```

### Run Specific Test Areas
```bash
# Run only authentication tests
set TEST_AREAS=auth && node .github/scripts/run-user-tests.js

# Run multiple areas
set TEST_AREAS=auth,kas,bank && node .github/scripts/run-user-tests.js
```

### Run with Different Screenshot Modes
```bash
# Capture all screenshots (default)
set SCREENSHOT_MODE=all && node .github/scripts/run-user-tests.js

# Capture only failure screenshots
set SCREENSHOT_MODE=failures && node .github/scripts/run-user-tests.js

# No screenshots
set SCREENSHOT_MODE=none && node .github/scripts/run-user-tests.js
```

### Run in Headless Mode
```bash
set HEADLESS=true && node .github/scripts/run-user-tests.js
```

## Test Results

After running tests, results are saved to:

- **JSON Report**: `test-results/reports/test-report.json`
- **HTML Report**: `test-results/reports/test-report.html`
- **Screenshots**: `test-results/screenshots/`
- **Logs**: `test-results/logs/test-run.log`

Open `test-results/reports/test-report.html` in a browser to view the interactive test report.

## Adding New Tests

### 1. Create a Test Method

Add a new test method to the appropriate test class:

```javascript
// In kas.test.js
async testNewFeature() {
  await this.runAssertion('VAL-KAS-NEW: New feature works', async () => {
    // Navigate to feature
    await this.navigateToKas();
    
    // Interact with feature
    const button = await this.window.locator('button:has-text("New Feature")').first();
    await button.click();
    
    // Verify result
    const result = await this.window.locator('.result').first();
    if (await result.count() === 0) {
      throw new Error('Result not found');
    }
    
    // Take screenshot
    await this.captureScreenshot('new_feature_result');
  }, { area: this.area });
}
```

### 2. Call the Test Method

Add the call to your test method in the `runAll()` function:

```javascript
async runAll() {
  console.log('=== Running Kas Module Tests ===');
  
  await this.testTransactionList();
  await this.testCreateTransactions();
  await this.testNewFeature(); // Add here
}
```

### 3. Test Method Guidelines

- **Use descriptive names**: Include the assertion ID and description
- **Take screenshots**: Use `await this.captureScreenshot('descriptive_name')` at key steps
- **Handle optional features**: Mark tests as `{ optional: true }` for features that may not exist
- **Clean up**: Close modals and return to a known state after each test

## Interpreting Results

### Status Codes

| Status | Icon | Meaning |
|--------|------|---------|
| Passed | ✅ | Assertion passed successfully |
| Failed | ❌ | Assertion failed - check error message |
| Skipped | ⏭️ | Optional test that couldn't run (feature not found) |

### Common Issues

**"Main script not found"**
- Run `npm run build` before testing

**"Element not found"**
- Check if the UI selector matches your application
- Add `{ optional: true }` if the feature may not exist

**"Timeout waiting for element"**
- Increase timeout in the test or configuration
- Check if the application is responding

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_AREAS` | `all` | Comma-separated list of areas to test |
| `SCREENSHOT_MODE` | `all` | `all`, `failures`, or `none` |
| `TEST_GROUP` | `all` | Test group identifier for reporting |
| `TEST_PATTERN` | `` | Pattern to filter specific tests |
| `HEADLESS` | `false` | Run in headless mode |
| `TEST_TIMEOUT` | `30000` | Test timeout in milliseconds |

## CI/CD Integration (GitHub Actions)

The tests are designed to run on GitHub Actions Windows runners:

```yaml
- name: Run Tests
  run: node .github/scripts/run-user-tests.js
  env:
    TEST_AREAS: all
    SCREENSHOT_MODE: failures
    HEADLESS: true

- name: Upload Test Results
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: test-results/
```

## Test Architecture

```
run-user-tests.js (Test Runner)
    │
    ├── auth.test.js ────────> Authentication & User Management
    ├── master.test.js ──────> Master Data (COA, Aspek Kerja, Blok)
    ├── kas.test.js ─────────> Kas Transactions
    ├── bank.test.js ────────> Bank Transactions
    ├── gudang.test.js ──────> Gudang Transactions
    ├── sync.test.js ────────> Sync System & Admin
    └── cross.test.js ───────> Cross-Area Flows
```

Each test module:
1. Receives shared dependencies (window, captureScreenshot, runAssertion)
2. Implements tests as methods
3. Calls `runAssertion()` for each assertion
4. Takes screenshots at key verification points

## Assertion Coverage

### Authentication (VAL-USER-*)
- Login page rendering
- Valid/invalid credentials
- User management (create, edit, delete)
- Password management
- Session handling
- Activity logging

### Master Data (VAL-MASTER-*)
- COA table display and pagination
- Add/edit/delete COA
- Aspek Kerja management
- Blok management
- Import/Export functionality
- Copy functionality

### Kas/Bank/Gudang (VAL-KAS-*, VAL-BANK-*, VAL-GUDANG-*)
- Transaction list display
- Create transactions (Masuk/Keluar)
- Edit pending transactions
- Approval workflows (PA1, PA2, Fully Approved)
- Import/Export
- Copy transactions

### Sync System (VAL-SYNC-*, VAL-ADMIN-*)
- Path configuration
- Connection status
- Sync queue management
- Conflict detection
- Admin settings

### Cross-Area (VAL-CROSS-*)
- Module independence
- Master data references
- Reporting
- Permission-based access

## Support

For issues or questions about the test suite:
1. Check the test logs in `test-results/logs/`
2. Review screenshots in `test-results/screenshots/`
3. Examine the HTML report for detailed failure information
