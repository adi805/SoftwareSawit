# Test Automation Command

## Running Tests

### Prerequisites
Start Electron with remote debugging enabled:
```bash
cd D:\Estate\Droid\SoftwareSawit
npx electron . --remote-debugging-port=9222
```

### Test Scripts

| File | Purpose |
|------|---------|
| `full-test.js` | Complete test suite for all modules |
| `cdp-test.js` | Individual feature testing |
| `debug-buttons.js` | Debug button states |
| `test-batal.js` | Debug Batal button click |

### Running Test Scripts
```bash
# Wait for app to be ready
sleep 8

# Run full test suite
node full-test.js

# Run specific test
node cdp-test.js
```

### CDP Connection
- Debugging URL: http://127.0.0.1:9222
- Get page ID: `curl http://127.0.0.1:9222/json`

### Troubleshooting

**CDP Connection Refused:**
```bash
netstat -an | findstr 9222
```

**Page ID Changed:**
Page ID changes on every restart. Get new ID:
```bash
curl http://127.0.0.1:9222/json
```

**Click Events Not Working:**
CDP `element.click()` doesn't trigger React synthetic events. Use:
1. Reload method - reload page to reset state
2. Mouse dispatch - MouseEvent with coordinates
3. Test API - expose test hooks in app
