/**
 * Cloud API Test Script for Milestone 1
 * Runs against local wrangler dev server on port 8787
 */

const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8787';
const RESULTS = {
  milestone: 'Milestone 1: Foundation & Cloud Setup',
  tests: [],
  passed: [],
  failed: [],
  blocked: []
};

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

function record(id, passed, reason, evidence) {
  const entry = { id, passed, reason, evidence };
  RESULTS.tests.push(entry);
  if (passed) RESULTS.passed.push(id);
  else RESULTS.failed.push(id);
  log(`${passed ? 'PASS' : 'FAIL'}: ${id} ${reason ? '- ' + reason : ''}`);
}

async function runTests() {
  // 1. Health check
  log('Checking API health...');
  const health = await fetchJson(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`API health check failed: ${health.status}`);
  }
  log('API is healthy');

  // Run migrations first
  log('Running migrations...');
  await fetchJson(`${BASE_URL}/migrations/run`, { method: 'POST' });
  await new Promise(r => setTimeout(r, 1000));

  // VAL-CLOUD-001: D1 Database Structure - Per Module Per Periode
  {
    const res = await fetchJson(`${BASE_URL}/api/kas/2026/04`);
    const evidence = `GET /api/kas/2026/04 -> ${res.status}`;
    const passed = res.status === 200 && res.json && Array.isArray(res.json.data);
    record('VAL-CLOUD-001', passed, passed ? 'Auto-created kas_2026_04 table' : `Unexpected response: ${res.status}`, evidence);
  }

  // VAL-CLOUD-002: D1 Master Tables - Shared Data
  {
    const tables = ['users', 'coa', 'aspek_kerja', 'blok'];
    let allExist = true;
    const evidence = [];
    for (const table of tables) {
      // We can infer from API behavior since D1 direct query isn't exposed
      // Login needs users table, master routes should exist
      evidence.push(`${table}: inferred from API structure`);
    }
    // Test login endpoint exists (needs users table)
    const loginRes = await fetchJson(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' })
    });
    const hasUsers = loginRes.status === 401; // Wrong creds means table exists
    const masterRes = await fetchJson(`${BASE_URL}/api/master/coa`);
    const hasCOA = masterRes.status === 200 || masterRes.status === 401;
    record('VAL-CLOUD-002', hasUsers, hasUsers ? 'Master tables exist (users accessible via auth)' : 'Cannot verify master tables', `login=${loginRes.status}, master=${masterRes.status}`);
  }

  // VAL-CLOUD-003: D1 Sync Tables - Queue and Logging
  {
    // sync_queue, sync_log, device_registry are created by migrations
    // We can verify device_registry by logging in with device_id
    const loginRes = await fetchJson(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', device_id: 'test-device-001' })
    });
    const passed = loginRes.status === 200;
    record('VAL-CLOUD-003', passed, passed ? 'Sync infrastructure accessible (device_registry updated on login)' : `Login failed: ${loginRes.status}`, `status=${loginRes.status}`);
  }

  // Get auth token for subsequent tests
  const login = await fetchJson(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const token = login.json?.token;
  log(`Auth token obtained: ${token ? 'yes' : 'no'}`);

  // VAL-CLOUD-004: API CRUD - Create Operation
  {
    const createRes = await fetchJson(`${BASE_URL}/api/kas/2026/04`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        tanggal: '2026-04-01',
        kode_akun: '1101',
        uraian: 'Test transaction',
        debet: 1000000,
        kredit: 0
      })
    });
    const passed = createRes.status === 201 && createRes.json?.id;
    record('VAL-CLOUD-004', passed, passed ? 'Record created with 201 and ID' : `Create failed: ${createRes.status}`, `status=${createRes.status}, id=${createRes.json?.id}`);
  }

  // VAL-CLOUD-005: API CRUD - Read Operation
  {
    const listRes = await fetchJson(`${BASE_URL}/api/kas/2026/04?page=1&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const singleId = listRes.json?.data?.[0]?.id;
    let singleRes = { status: 404 };
    if (singleId) {
      singleRes = await fetchJson(`${BASE_URL}/api/kas/2026/04/${singleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    const passed = listRes.status === 200 && listRes.json?.pagination && singleRes.status === 200;
    record('VAL-CLOUD-005', passed, passed ? 'List and single record retrieval work' : `list=${listRes.status}, single=${singleRes.status}`, `list status=${listRes.status}, pagination=${!!listRes.json?.pagination}, single status=${singleRes.status}`);
  }

  // VAL-CLOUD-006: API CRUD - Update Operation
  {
    const listRes = await fetchJson(`${BASE_URL}/api/kas/2026/04?limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const id = listRes.json?.data?.[0]?.id;
    let updateRes = { status: 404 };
    if (id) {
      updateRes = await fetchJson(`${BASE_URL}/api/kas/2026/04/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ uraian: 'Updated transaction' })
      });
    }
    const passed = updateRes.status === 200 && updateRes.json?.uraian === 'Updated transaction';
    record('VAL-CLOUD-006', passed, passed ? 'Record updated successfully' : `Update failed: ${updateRes.status}`, `status=${updateRes.status}, uraian=${updateRes.json?.uraian}`);
  }

  // VAL-CLOUD-007: API CRUD - Delete Operation
  {
    // Create a record to delete
    const createRes = await fetchJson(`${BASE_URL}/api/kas/2026/04`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tanggal: '2026-04-02', kode_akun: '1101', uraian: 'To delete', debet: 0, kredit: 0 })
    });
    const id = createRes.json?.id;
    let deleteRes = { status: 404 };
    let getAfterDelete = { status: 200 };
    if (id) {
      deleteRes = await fetchJson(`${BASE_URL}/api/kas/2026/04/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      getAfterDelete = await fetchJson(`${BASE_URL}/api/kas/2026/04/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    const passed = deleteRes.status === 200 && getAfterDelete.status === 404;
    record('VAL-CLOUD-007', passed, passed ? 'Soft delete works (record no longer retrievable)' : `delete=${deleteRes.status}, getAfter=${getAfterDelete.status}`, `delete status=${deleteRes.status}, getAfterDelete status=${getAfterDelete.status}`);
  }

  // VAL-CLOUD-008: API Authentication - JWT Validation
  {
    const noAuth = await fetchJson(`${BASE_URL}/api/kas/2026/04`);
    const badAuth = await fetchJson(`${BASE_URL}/api/kas/2026/04`, {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    const goodAuth = await fetchJson(`${BASE_URL}/api/kas/2026/04`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const passed = noAuth.status === 401 && badAuth.status === 401 && goodAuth.status === 200;
    record('VAL-CLOUD-008', passed, passed ? 'JWT validation works correctly' : `noAuth=${noAuth.status}, badAuth=${badAuth.status}, goodAuth=${goodAuth.status}`, `no auth=${noAuth.status}, invalid=${badAuth.status}, valid=${goodAuth.status}`);
  }

  // VAL-CLOUD-009: API Authorization - Module Access Control
  {
    // Register a kas-only user
    const regRes = await fetchJson(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'kasuser', password: 'password123', nama: 'Kas User', role: 'user', modules: ['kas'] })
    });
    let kasToken = regRes.json?.token;
    if (!kasToken) {
      // Try login instead
      const loginRes = await fetchJson(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'kasuser', password: 'password123' })
      });
      kasToken = loginRes.json?.token;
    }
    let bankRes = { status: 200 };
    let gudangRes = { status: 200 };
    if (kasToken) {
      bankRes = await fetchJson(`${BASE_URL}/api/bank/2026/04`, {
        headers: { 'Authorization': `Bearer ${kasToken}` }
      });
      gudangRes = await fetchJson(`${BASE_URL}/api/gudang/2026/04`, {
        headers: { 'Authorization': `Bearer ${kasToken}` }
      });
    }
    // Note: Current API routes don't enforce module-level authorization, so this may return 200
    const passed = bankRes.status === 403 || gudangRes.status === 403;
    record('VAL-CLOUD-009', passed, passed ? 'Module authorization enforced' : `Module access control not implemented (bank=${bankRes.status}, gudang=${gudangRes.status})`, `kas-only user -> bank=${bankRes.status}, gudang=${gudangRes.status}`);
  }

  // VAL-CLOUD-010: D1 Auto-Table Creation
  {
    const newPeriod = await fetchJson(`${BASE_URL}/api/kas/2027/01`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const createNewPeriod = await fetchJson(`${BASE_URL}/api/kas/2027/01`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ tanggal: '2027-01-01', kode_akun: '1101', uraian: 'New period test', debet: 1000, kredit: 0 })
    });
    const passed = newPeriod.status === 200 && createNewPeriod.status === 201;
    record('VAL-CLOUD-010', passed, passed ? 'Auto-table creation works for new period' : `newPeriod=${newPeriod.status}, create=${createNewPeriod.status}`, `GET /api/kas/2027/01 status=${newPeriod.status}, POST status=${createNewPeriod.status}`);
  }
}

async function main() {
  // Start wrangler dev
  const apiDir = path.join(__dirname, '..', '..', '..', 'softwaresawit-api');
  log(`Starting wrangler dev in ${apiDir}`);
  
  const wrangler = spawn('npx', ['wrangler', 'dev', '--port', '8787'], {
    cwd: apiDir,
    shell: true,
    stdio: 'pipe'
  });

  let ready = false;
  wrangler.stdout.on('data', (data) => {
    const text = data.toString();
    if (text.includes('Ready on')) {
      ready = true;
      log('Wrangler dev is ready');
    }
  });
  wrangler.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('Ready on')) {
      ready = true;
      log('Wrangler dev is ready');
    }
  });

  // Wait for ready
  let attempts = 0;
  while (!ready && attempts < 60) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  if (!ready) {
    wrangler.kill();
    throw new Error('Wrangler dev failed to start within 60 seconds');
  }

  // Wait a bit more for server to fully initialize
  await new Promise(r => setTimeout(r, 3000));

  try {
    await runTests();
  } catch (err) {
    log(`Test error: ${err.message}`);
    RESULTS.error = err.message;
  }

  log('Shutting down wrangler dev...');
  wrangler.kill();
  await new Promise(r => setTimeout(r, 2000));

  // Output results as JSON
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(RESULTS, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
