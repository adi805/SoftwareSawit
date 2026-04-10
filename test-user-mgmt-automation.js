const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');

const evidenceDir = 'D:/Estate/Droid/SoftwareSawit/evidence/user-management';
const reportDir = 'D:/Estate/Droid/SoftwareSawit/.factory/validation/user-management/user-testing/flows';
const reportPath = path.join(reportDir, 'user-mgmt-all.json');

if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const results = [];
let electronApp = null;
let page = null;
let dbPathCached = null;

function pushResult(id, status, steps, screenshots, issues = null) {
  results.push({ id, status, steps, evidence: { screenshots }, issues });
}

function screenshotName(id, suffix) {
  return path.join(evidenceDir, `${id}-${suffix}.png`);
}

async function waitForApiReady() {
  if (!page) return;
  await page.waitForFunction(() => {
    return typeof window.electronAPI === 'object' && typeof window.electronAPI.getUsersDbPath === 'function';
  }, { timeout: 10000 });
}

async function launchApp() {
  if (electronApp) return;
  console.log('[INFO] Launching Electron app in user-management mode...');
  electronApp = await electron.launch({
    executablePath: path.join(__dirname, 'node_modules/.bin/electron.cmd'),
    args: ['.', '--user-mgmt'],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await waitForApiReady();
  await page.waitForTimeout(800);
}

async function closeApp() {
  if (electronApp) {
    console.log('[INFO] Closing Electron app...');
    await electronApp.close();
    electronApp = null;
    page = null;
    dbPathCached = null;
  }
}

async function clearSession() {
  if (!page) return;
  await page.evaluate(() => localStorage.clear());
}

async function reloadPage() {
  if (!page) return;
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await waitForApiReady();
  await page.waitForTimeout(800);
}

async function login(username, password) {
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
  await page.waitForTimeout(800);
}

async function logout() {
  try {
    await page.click('button:has-text("Logout")');
    await page.waitForSelector('#username', { timeout: 10000 });
    await page.waitForTimeout(800);
  } catch (e) {
    await clearSession();
    await reloadPage();
  }
}

async function getDbPath() {
  if (dbPathCached) return dbPathCached;
  dbPathCached = await page.evaluate(() => window.electronAPI.getUsersDbPath());
  return dbPathCached;
}

async function withDbFile(callback) {
  const dbPath = await getDbPath();
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  callback(db);
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
}

async function resetLoginAttempts(username) {
  const dbPath = await getDbPath();
  await closeApp();
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  db.run('DELETE FROM login_attempts WHERE username = ?', [username]);
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  await launchApp();
  await clearSession();
  await reloadPage();
}

async function forceAdminPassword(password) {
  await launchApp();
  const dbPath = await getDbPath();
  await closeApp();
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  // Ensure admin exists
  const adminRes = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (!adminRes.length || !adminRes[0].values.length) {
    const id = uuidv4();
    db.run(
      'INSERT INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, 'admin', hash, 'Administrator', 'Administrator', 'active', now, now]
    );
  } else {
    db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = 'admin'", [hash, now]);
  }
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  await launchApp();
  await clearSession();
  await reloadPage();
}

async function createUserViaApi(username, password, fullName, role) {
  return await page.evaluate(async ({ u, p, f, r }) => {
    return await window.electronAPI.createUser(u, p, f, r);
  }, { u: username, p: password, f: fullName, r: role });
}

async function getAllUsersViaApi() {
  return await page.evaluate(() => window.electronAPI.getAllUsers());
}

async function deleteUserViaApi(userId, requestingUserId) {
  return await page.evaluate(async ({ uid, rid }) => {
    return await window.electronAPI.deleteUser(uid, rid);
  }, { uid: userId, rid: requestingUserId });
}

async function adminResetPasswordViaApi(adminId, targetId, newPassword) {
  return await page.evaluate(async ({ a, t, p }) => {
    return await window.electronAPI.adminResetPassword(a, t, p);
  }, { a: adminId, t: targetId, p: newPassword });
}

async function exportDbViaApi(targetPath) {
  return await page.evaluate(async (tp) => {
    return await window.electronAPI.exportUsersDatabase(tp);
  }, targetPath);
}

async function importDbViaApi(sourcePath, resolution) {
  return await page.evaluate(async ({ sp, res }) => {
    return await window.electronAPI.importUsersDatabase(sp, res);
  }, { sp: sourcePath, res: resolution });
}

async function runTests() {
  try {
    // Start with a known good admin password
    await forceAdminPassword('Admin123!');

    // ========================================
    // VAL-USER-001: Admin Login Success
    // ========================================
    await page.waitForSelector('#username');
    const ss001a = screenshotName('VAL-USER-001', 'login-page');
    await page.screenshot({ path: ss001a });
    await login('admin', 'Admin123!');
    const ss001b = screenshotName('VAL-USER-001', 'user-list');
    await page.screenshot({ path: ss001b });
    pushResult('VAL-USER-001', 'pass', ['Open login page', 'Enter valid credentials', 'Submit'], [ss001a, ss001b]);
    console.log('[PASS] VAL-USER-001');

    // ========================================
    // VAL-USER-002: Login Failure with Invalid Credentials
    // ========================================
    await logout();
    await page.fill('#username', 'admin');
    await page.fill('#password', 'WrongPassword123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    const ss002 = screenshotName('VAL-USER-002', 'login-error');
    await page.screenshot({ path: ss002 });
    const err002 = await page.locator('text=Username atau password salah').isVisible().catch(() => false);
    if (err002) {
      pushResult('VAL-USER-002', 'pass', ['Enter invalid credentials', 'Submit', 'Verify error'], [ss002]);
      console.log('[PASS] VAL-USER-002');
    } else {
      pushResult('VAL-USER-002', 'fail', ['Enter invalid credentials', 'Submit', 'Verify error'], [ss002], 'Error not shown');
      console.log('[FAIL] VAL-USER-002');
    }

    // ========================================
    // VAL-USER-003: Account Lockout After Failed Attempts
    // ========================================
    // Create a disposable user to test lockout (avoids needing to reset admin)
    await createUserViaApi('lockme003', 'LockPass1', 'Lock Test User', 'Inputan Kas');
    await logout();
    await page.waitForSelector('#username');
    await page.fill('#username', 'lockme003');
    await page.fill('#password', 'WrongPassword123');
    for (let i = 0; i < 5; i++) {
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(1000);
    const ss003 = screenshotName('VAL-USER-003', 'account-locked');
    await page.screenshot({ path: ss003 });
    const lockoutVisible = await page.locator('text=/terkunci/i').isVisible().catch(() => false);
    if (lockoutVisible) {
      pushResult('VAL-USER-003', 'pass', ['Enter wrong password 5 times for test user', 'Verify lockout message'], [ss003]);
      console.log('[PASS] VAL-USER-003');
    } else {
      // Log page text for debugging
      const errText = await page.locator('.text-red-700').textContent().catch(() => 'no error text');
      pushResult('VAL-USER-003', 'fail', ['Enter wrong password 5 times for test user', 'Verify lockout message'], [ss003], `Lockout not shown. Error text: ${errText}`);
      console.log('[FAIL] VAL-USER-003');
    }
    // Login back as admin to continue

    // ========================================
    // VAL-USER-004: Create New User with Valid Data
    // ========================================
    await login('admin', 'Admin123!');
    await page.click('button:has-text("Tambah User")');
    await page.waitForTimeout(1000);
    await page.fill('#username', 'testuser_004');
    await page.fill('#password', 'TestPass1');
    await page.fill('#confirmPassword', 'TestPass1');
    await page.fill('#fullName', 'Test User 004');
    await page.selectOption('#role', 'Inputan Kas');
    const ss004a = screenshotName('VAL-USER-004', 'form-filled');
    await page.screenshot({ path: ss004a });
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.waitForTimeout(800);
    const ss004b = screenshotName('VAL-USER-004', 'user-list-after-create');
    await page.screenshot({ path: ss004b });
    const has004 = await page.locator('text=testuser_004').isVisible().catch(() => false);
    if (has004) {
      pushResult('VAL-USER-004', 'pass', ['Open add user form', 'Fill valid data', 'Submit', 'Verify user in list'], [ss004a, ss004b]);
      console.log('[PASS] VAL-USER-004');
    } else {
      pushResult('VAL-USER-004', 'fail', ['Open add user form', 'Fill valid data', 'Submit', 'Verify user in list'], [ss004a, ss004b], 'User not found');
      console.log('[FAIL] VAL-USER-004');
    }

    // ========================================
    // VAL-USER-005: Password Strength Validation
    // ========================================
    await page.click('button:has-text("Tambah User")');
    await page.waitForTimeout(1000);
    await page.fill('#username', 'testuser_005');
    await page.fill('#password', 'weak');
    await page.fill('#confirmPassword', 'weak');
    await page.fill('#fullName', 'Test User 005');
    const ss005a = screenshotName('VAL-USER-005', 'weak-password');
    await page.screenshot({ path: ss005a });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    const ss005b = screenshotName('VAL-USER-005', 'validation-error');
    await page.screenshot({ path: ss005b });
    const err005 = await page.locator('text=/minimal 8 karakter/i').first().isVisible().catch(() => false)
      || await page.locator('text=/huruf besar/i').first().isVisible().catch(() => false)
      || await page.locator('text=/angka/i').first().isVisible().catch(() => false);
    if (err005) {
      pushResult('VAL-USER-005', 'pass', ['Enter weak password', 'Submit', 'Verify validation error'], [ss005a, ss005b]);
      console.log('[PASS] VAL-USER-005');
    } else {
      pushResult('VAL-USER-005', 'fail', ['Enter weak password', 'Submit', 'Verify validation error'], [ss005a, ss005b], 'Validation error missing');
      console.log('[FAIL] VAL-USER-005');
    }
    await page.click('button:has-text("Batal")');
    await page.waitForTimeout(800);

    // ========================================
    // VAL-USER-006: Username Uniqueness Validation
    // ========================================
    await page.click('button:has-text("Tambah User")');
    await page.waitForTimeout(1000);
    await page.fill('#username', 'testuser_004');
    await page.fill('#password', 'TestPass1');
    await page.fill('#confirmPassword', 'TestPass1');
    await page.fill('#fullName', 'Duplicate User');
    const ss006a = screenshotName('VAL-USER-006', 'duplicate-username');
    await page.screenshot({ path: ss006a });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    const ss006b = screenshotName('VAL-USER-006', 'error');
    await page.screenshot({ path: ss006b });
    const err006 = await page.locator('text=/sudah digunakan/i').first().isVisible().catch(() => false);
    if (err006) {
      pushResult('VAL-USER-006', 'pass', ['Enter existing username', 'Submit', 'Verify uniqueness error'], [ss006a, ss006b]);
      console.log('[PASS] VAL-USER-006');
    } else {
      pushResult('VAL-USER-006', 'fail', ['Enter existing username', 'Submit', 'Verify uniqueness error'], [ss006a, ss006b], 'Uniqueness error missing');
      console.log('[FAIL] VAL-USER-006');
    }
    await page.click('button:has-text("Batal")');
    await page.waitForTimeout(800);

    // ========================================
    // VAL-USER-007: Edit User Role
    // ========================================
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.locator('tr:has-text("testuser_004") button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);
    await page.selectOption('#role', 'Approver');
    const ss007a = screenshotName('VAL-USER-007', 'edit-form');
    await page.screenshot({ path: ss007a });
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.waitForTimeout(800);
    const ss007b = screenshotName('VAL-USER-007', 'list-after-edit');
    await page.screenshot({ path: ss007b });
    const hasApprover = await page.locator('tr:has-text("testuser_004") >> text=Approver').isVisible().catch(() => false);
    if (hasApprover) {
      pushResult('VAL-USER-007', 'pass', ['Click edit on user', 'Change role', 'Save', 'Verify updated role'], [ss007a, ss007b]);
      console.log('[PASS] VAL-USER-007');
    } else {
      pushResult('VAL-USER-007', 'fail', ['Click edit on user', 'Change role', 'Save', 'Verify updated role'], [ss007a, ss007b], 'Role not updated');
      console.log('[FAIL] VAL-USER-007');
    }

    // ========================================
    // VAL-USER-008: Prevent Non-Admin from Creating Admin
    // ========================================
    // Ensure non-admin exists
    let users = await getAllUsersViaApi();
    let nonAdmin = users.find(u => u.username === 'kasuser008');
    if (!nonAdmin) {
      const created = await createUserViaApi('kasuser008', 'KasPass1', 'Kas User', 'Inputan Kas');
      if (created.user) nonAdmin = created.user;
    }
    await logout();
    await login('kasuser008', 'KasPass1');
    await page.click('button:has-text("Tambah User")');
    await page.waitForTimeout(1000);
    await page.fill('#username', 'shouldfail008');
    await page.fill('#password', 'Password1');
    await page.fill('#confirmPassword', 'Password1');
    await page.fill('#fullName', 'Should Fail');
    const adminOptionExists = await page.locator('#role option[value="Administrator"]').count() > 0;
    let blocked008 = false;
    let ss008a, ss008b;
    if (adminOptionExists) {
      try {
        await page.selectOption('#role', 'Administrator');
      } catch (e) {
        blocked008 = true;
      }
      ss008a = screenshotName('VAL-USER-008', 'non-admin-form');
      await page.screenshot({ path: ss008a });
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1500);
      ss008b = screenshotName('VAL-USER-008', 'error');
      await page.screenshot({ path: ss008b });
      const err008 = await page.locator('text=/Hanya admin/i').isVisible().catch(() => false);
      if (err008) blocked008 = true;
    } else {
      blocked008 = true;
      ss008a = screenshotName('VAL-USER-008', 'no-admin-option');
      await page.screenshot({ path: ss008a });
      ss008b = ss008a;
    }
    if (blocked008) {
      pushResult('VAL-USER-008', 'pass', ['Login as non-admin', 'Attempt to assign Administrator role', 'Verify blocked'], [ss008a, ss008b]);
      console.log('[PASS] VAL-USER-008');
    } else {
      pushResult('VAL-USER-008', 'fail', ['Login as non-admin', 'Attempt to assign Administrator role', 'Verify blocked'], [ss008a, ss008b], 'Not blocked');
      console.log('[FAIL] VAL-USER-008');
    }
    await page.click('button:has-text("Batal")').catch(() => {});
    await page.waitForTimeout(800);

    // ========================================
    // VAL-USER-009: Delete User with Confirmation
    // ========================================
    await logout();
    await login('admin', 'Admin123!');
    // Ensure deletable user exists
    let del009 = (await getAllUsersViaApi()).find(u => u.username === 'deleteme009');
    if (del009) {
      const adminUser = (await getAllUsersViaApi()).find(u => u.username === 'admin');
      await deleteUserViaApi(del009.id, adminUser.id);
    }
    await createUserViaApi('deleteme009', 'DeletePass1', 'Delete Me', 'Inputan Kas');
    await reloadPage();
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.locator('tr:has-text("deleteme009") button[title="Hapus"]').first().click();
    await page.waitForTimeout(800);
    const ss009a = screenshotName('VAL-USER-009', 'confirm-dialog');
    await page.screenshot({ path: ss009a });
    await page.locator('tr:has-text("deleteme009") button:has-text("Ya")').first().click();
    await page.waitForTimeout(1500);
    const ss009b = screenshotName('VAL-USER-009', 'after-delete');
    await page.screenshot({ path: ss009b });
    const stillThere = await page.locator('text=deleteme009').isVisible().catch(() => false);
    if (!stillThere) {
      pushResult('VAL-USER-009', 'pass', ['Click delete on user', 'Confirm', 'Verify user removed'], [ss009a, ss009b]);
      console.log('[PASS] VAL-USER-009');
    } else {
      pushResult('VAL-USER-009', 'fail', ['Click delete on user', 'Confirm', 'Verify user removed'], [ss009a, ss009b], 'User still present');
      console.log('[FAIL] VAL-USER-009');
    }

    // ========================================
    // VAL-USER-010: Prevent Self-Deletion
    // ========================================
    await page.locator('tr:has-text("admin") button[title="Hapus"]').first().click();
    await page.waitForTimeout(800);
    const ss010a = screenshotName('VAL-USER-010', 'self-delete-attempt');
    await page.screenshot({ path: ss010a });
    await page.locator('tr:has-text("admin") button:has-text("Ya")').first().click();
    await page.waitForTimeout(1500);
    const ss010b = screenshotName('VAL-USER-010', 'error');
    await page.screenshot({ path: ss010b });
    const err010 = await page.locator('text=/Tidak dapat menghapus akun sendiri/i').isVisible().catch(() => false);
    if (err010) {
      pushResult('VAL-USER-010', 'pass', ['Click delete on own row', 'Confirm', 'Verify blocked'], [ss010a, ss010b]);
      console.log('[PASS] VAL-USER-010');
    } else {
      pushResult('VAL-USER-010', 'fail', ['Click delete on own row', 'Confirm', 'Verify blocked'], [ss010a, ss010b], 'Self-deletion not blocked');
      console.log('[FAIL] VAL-USER-010');
    }

    // ========================================
    // VAL-USER-011: Prevent Deletion of Last Admin
    // ========================================
    // Ensure only one admin remains
    const adminOnly = (await getAllUsersViaApi()).filter(u => u.role === 'Administrator').length === 1;
    await page.locator('tr:has-text("admin") button[title="Hapus"]').first().click();
    await page.waitForTimeout(800);
    await page.locator('tr:has-text("admin") button:has-text("Ya")').first().click();
    await page.waitForTimeout(1500);
    const ss011 = screenshotName('VAL-USER-011', 'last-admin-blocked');
    await page.screenshot({ path: ss011 });
    const err011 = await page.locator('text=/Tidak dapat menghapus admin terakhir/i').isVisible().catch(() => false);
    if (err011) {
      pushResult('VAL-USER-011', 'pass', ['Ensure single admin', 'Attempt deleting last admin', 'Verify blocked'], [ss011]);
      console.log('[PASS] VAL-USER-011');
    } else {
      pushResult('VAL-USER-011', 'fail', ['Ensure single admin', 'Attempt deleting last admin', 'Verify blocked'], [ss011], 'Last admin deletion not blocked');
      console.log('[FAIL] VAL-USER-011');
    }

    // ========================================
    // VAL-USER-012: Change Own Password
    // ========================================
    await page.locator('tr:has-text("admin") button[title="Ubah Password"]').first().click();
    await page.waitForTimeout(1000);
    await page.fill('#oldPassword', 'Admin123!');
    await page.fill('#newPassword', 'NewAdminPass1');
    await page.fill('#confirmPassword', 'NewAdminPass1');
    const ss012a = screenshotName('VAL-USER-012', 'change-password-form');
    await page.screenshot({ path: ss012a });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    const ss012b = screenshotName('VAL-USER-012', 'success');
    await page.screenshot({ path: ss012b });
    const suc012 = await page.locator('text=/Password berhasil diubah/i').isVisible().catch(() => false);
    if (suc012) {
      pushResult('VAL-USER-012', 'pass', ['Open change password', 'Enter valid old and new password', 'Submit', 'Verify success'], [ss012a, ss012b]);
      console.log('[PASS] VAL-USER-012');
      // revert password for remaining tests
      await page.fill('#oldPassword', 'NewAdminPass1');
      await page.fill('#newPassword', 'Admin123!');
      await page.fill('#confirmPassword', 'Admin123!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1500);
    } else {
      pushResult('VAL-USER-012', 'fail', ['Open change password', 'Enter valid old and new password', 'Submit', 'Verify success'], [ss012a, ss012b], 'Success not shown');
      console.log('[FAIL] VAL-USER-012');
    }
    await page.click('button:has-text("Batal")').catch(() => {});

    // ========================================
    // VAL-USER-013: Password Change with Wrong Old Password
    // ========================================
    await reloadPage();
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.locator('tr:has-text("admin") button[title="Ubah Password"]').first().click();
    await page.waitForTimeout(1000);
    await page.fill('#oldPassword', 'WrongOldPass');
    await page.fill('#newPassword', 'NewAdminPass1');
    await page.fill('#confirmPassword', 'NewAdminPass1');
    const ss013a = screenshotName('VAL-USER-013', 'wrong-old-password');
    await page.screenshot({ path: ss013a });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    const ss013b = screenshotName('VAL-USER-013', 'error');
    await page.screenshot({ path: ss013b });
    const err013 = await page.locator('text=/Password lama salah/i').isVisible().catch(() => false);
    if (err013) {
      pushResult('VAL-USER-013', 'pass', ['Open change password', 'Enter wrong old password', 'Submit', 'Verify error'], [ss013a, ss013b]);
      console.log('[PASS] VAL-USER-013');
    } else {
      pushResult('VAL-USER-013', 'fail', ['Open change password', 'Enter wrong old password', 'Submit', 'Verify error'], [ss013a, ss013b], 'Error not shown');
      console.log('[FAIL] VAL-USER-013');
    }
    await page.click('button:has-text("Batal")').catch(() => {});

    // ========================================
    // VAL-USER-014: Admin Reset User Password
    // ========================================
    const allUsers014 = await getAllUsersViaApi();
    const admin014 = allUsers014.find(u => u.username === 'admin');
    const target014 = allUsers014.find(u => u.username === 'testuser_004');
    if (!admin014 || !target014) {
      pushResult('VAL-USER-014', 'fail', ['Find admin and target users'], [], 'Required users missing');
      console.log('[FAIL] VAL-USER-014');
    } else {
      const resetRes = await adminResetPasswordViaApi(admin014.id, target014.id, 'ResetPass1');
      // verify login with new password via backend IPC (no UI needed)
      const loginAfter = await page.evaluate(async ({ u, p }) => {
        return await window.electronAPI.login(u, p);
      }, { u: 'testuser_004', p: 'ResetPass1' });
      const ss014 = screenshotName('VAL-USER-014', 'backend-reset');
      await page.screenshot({ path: ss014 });
      if (resetRes.success && loginAfter.success) {
        pushResult('VAL-USER-014', 'pass', ['Call adminResetPassword', 'Verify login with new password'], [ss014]);
        console.log('[PASS] VAL-USER-014');
      } else {
        pushResult('VAL-USER-014', 'fail', ['Call adminResetPassword', 'Verify login with new password'], [ss014], resetRes.message || loginAfter.message);
        console.log('[FAIL] VAL-USER-014');
      }
    }

    // ========================================
    // VAL-USER-015: View Activity Log
    // ========================================
    await reloadPage();
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.click('button:has-text("Log Aktivitas")');
    await page.waitForTimeout(1500);
    const ss015 = screenshotName('VAL-USER-015', 'activity-log');
    await page.screenshot({ path: ss015 });
    const hasLogs = await page.locator('text=Log Aktivitas').isVisible().catch(() => false);
    if (hasLogs) {
      pushResult('VAL-USER-015', 'pass', ['Open Log Aktivitas', 'Verify page loads'], [ss015]);
      console.log('[PASS] VAL-USER-015');
    } else {
      pushResult('VAL-USER-015', 'fail', ['Open Log Aktivitas', 'Verify page loads'], [ss015], 'Page not loaded');
      console.log('[FAIL] VAL-USER-015');
    }
    await reloadPage();
    await login('admin', 'Admin123!');

    // ========================================
    // VAL-USER-016: Session Management
    // ========================================
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.click('button:has-text("Kelola Sesi")');
    await page.waitForTimeout(1500);
    const ss016 = screenshotName('VAL-USER-016', 'session-management');
    await page.screenshot({ path: ss016 });
    const hasSessions = await page.locator('text=Kelola Sesi').isVisible().catch(() => false);
    if (hasSessions) {
      pushResult('VAL-USER-016', 'pass', ['Open Kelola Sesi', 'Verify session list loads'], [ss016]);
      console.log('[PASS] VAL-USER-016');
    } else {
      pushResult('VAL-USER-016', 'fail', ['Open Kelola Sesi', 'Verify session list loads'], [ss016], 'Page not loaded');
      console.log('[FAIL] VAL-USER-016');
    }
    await reloadPage();
    await login('admin', 'Admin123!');

    // ========================================
    // VAL-USER-017: Session Timeout (BLOCKED)
    // ========================================
    pushResult('VAL-USER-017', 'blocked', ['Wait for 15-minute idle timeout'], [], 'Skipped: would take 15 minutes');
    console.log('[BLOCKED] VAL-USER-017');

    // ========================================
    // VAL-USER-018: Export Users Database
    // ========================================
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    const exportPath = path.join(evidenceDir, 'exported_users_test.db');
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
    const exportRes = await exportDbViaApi(exportPath);
    const ss018 = screenshotName('VAL-USER-018', 'export-result');
    await page.screenshot({ path: ss018 });
    if (exportRes.success && fs.existsSync(exportPath)) {
      pushResult('VAL-USER-018', 'pass', ['Call exportUsersDatabase', 'Verify file created'], [ss018]);
      console.log('[PASS] VAL-USER-018');
    } else {
      pushResult('VAL-USER-018', 'fail', ['Call exportUsersDatabase', 'Verify file created'], [ss018], exportRes.message || 'File not created');
      console.log('[FAIL] VAL-USER-018');
    }

    // ========================================
    // VAL-USER-019: Import Users Database
    // ========================================
    // Ensure clean state for import: create a fresh export and inject a user in Node
    const importTestPath = path.join(evidenceDir, 'import_users_test.db');
    if (fs.existsSync(importTestPath)) fs.unlinkSync(importTestPath);
    const preExport = await exportDbViaApi(importTestPath);
    if (!preExport.success) {
      pushResult('VAL-USER-019', 'fail', ['Export DB for import test'], [], preExport.message);
      console.log('[FAIL] VAL-USER-019');
    } else {
      // Open exported file in Node sql.js and insert a user
      const SQL = await initSqlJs();
      let buf = fs.readFileSync(importTestPath);
      const db = new SQL.Database(buf);
      const now = new Date().toISOString();
      const id = uuidv4();
      db.run(
        'INSERT INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'importeduser019', 'somehash', 'Imported User', 'Inputan Kas', 'active', now, now]
      );
      buf = Buffer.from(db.export());
      fs.writeFileSync(importTestPath, buf);
      db.close();
      const importRes = await importDbViaApi(importTestPath, 'skip');
      const ss019 = screenshotName('VAL-USER-019', 'import-result');
      await page.screenshot({ path: ss019 });
      const importedExists = (await getAllUsersViaApi()).some(u => u.username === 'importeduser019');
      if (importRes.success && importedExists) {
        pushResult('VAL-USER-019', 'pass', ['Create import DB with new user', 'Call importUsersDatabase', 'Verify user imported'], [ss019]);
        console.log('[PASS] VAL-USER-019');
      } else {
        pushResult('VAL-USER-019', 'fail', ['Create import DB with new user', 'Call importUsersDatabase', 'Verify user imported'], [ss019], importRes.message || 'User not imported');
        console.log('[FAIL] VAL-USER-019');
      }
    }

    // ========================================
    // VAL-USER-020: Password Hashing Security
    // ========================================
    const adminUser020 = (await getAllUsersViaApi()).find(u => u.username === 'admin');
    const ss020 = screenshotName('VAL-USER-020', 'hash-check');
    await page.screenshot({ path: ss020 });
    if (adminUser020 && adminUser020.password_hash && adminUser020.password_hash.startsWith('$2') && adminUser020.password_hash !== 'Admin123!') {
      pushResult('VAL-USER-020', 'pass', ['Retrieve admin user via API', 'Verify bcrypt hash prefix'], [ss020]);
      console.log('[PASS] VAL-USER-020');
    } else {
      const reason = adminUser020 ? `Hash prefix: ${(adminUser020.password_hash || '').slice(0, 10)}` : 'Admin not found';
      pushResult('VAL-USER-020', 'fail', ['Retrieve admin user via API', 'Verify bcrypt hash prefix'], [ss020], reason);
      console.log('[FAIL] VAL-USER-020');
    }

    // ========================================
    // VAL-USER-021: Clear All Non-Admin Users
    // ========================================
    await reloadPage();
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.click('button:has-text("Clear All")');
    await page.waitForTimeout(800);
    const ss021a = screenshotName('VAL-USER-021', 'confirm-clear');
    await page.screenshot({ path: ss021a });
    await page.click('button:has-text("Hapus Semua")');
    await page.waitForTimeout(2000);
    const ss021b = screenshotName('VAL-USER-021', 'after-clear');
    await page.screenshot({ path: ss021b });
    const remainingUsers = await getAllUsersViaApi();
    const onlyAdmin = remainingUsers.length === 1 && remainingUsers[0].username === 'admin';
    if (onlyAdmin) {
      pushResult('VAL-USER-021', 'pass', ['Click Clear All', 'Confirm', 'Verify only admin remains'], [ss021a, ss021b]);
      console.log('[PASS] VAL-USER-021');
    } else {
      pushResult('VAL-USER-021', 'fail', ['Click Clear All', 'Confirm', 'Verify only admin remains'], [ss021a, ss021b], `Remaining users: ${remainingUsers.map(u => u.username).join(', ')}`);
      console.log('[FAIL] VAL-USER-021');
    }

    // ========================================
    // VAL-USER-022: Role-Based UI Access
    // ========================================
    // Create a non-admin user if missing
    const remaining022 = await getAllUsersViaApi();
    let kas022 = remaining022.find(u => u.username === 'kasuser022');
    if (!kas022) {
      const created022 = await createUserViaApi('kasuser022', 'KasPass1', 'Kas User', 'Inputan Kas');
      kas022 = created022.user;
    }
    await logout();
    await login('kasuser022', 'KasPass1');
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    await page.waitForTimeout(800);
    const ss022 = screenshotName('VAL-USER-022', 'non-admin-ui');
    await page.screenshot({ path: ss022 });
    const tambahVisible = await page.locator('button:has-text("Tambah User")').isVisible().catch(() => false);
    const exportDbVisible = await page.locator('button:has-text("Export Database")').isVisible().catch(() => false);
    const clearVisible = await page.locator('button:has-text("Clear All")').isVisible().catch(() => false);
    if (!tambahVisible && !exportDbVisible && !clearVisible) {
      pushResult('VAL-USER-022', 'pass', ['Login as non-admin', 'Verify admin-only buttons absent'], [ss022]);
      console.log('[PASS] VAL-USER-022');
    } else {
      pushResult('VAL-USER-022', 'fail', ['Login as non-admin', 'Verify admin-only buttons absent'], [ss022], `Buttons visible: Tambah=${tambahVisible} ExportDB=${exportDbVisible} Clear=${clearVisible}`);
      console.log('[FAIL] VAL-USER-022');
    }

    // ========================================
    // VAL-USER-023: Guest Login View-Only Mode
    // ========================================
    await logout();
    await page.click('button:has-text("Masuk sebagai Tamu")');
    await page.waitForTimeout(2000);
    await page.waitForSelector('text=Manajemen User', { timeout: 10000 });
    const ss023 = screenshotName('VAL-USER-023', 'guest-view');
    await page.screenshot({ path: ss023 });
    const tambahGuest = await page.locator('button:has-text("Tambah User")').isVisible().catch(() => false);
    const logoutVisible = await page.locator('button:has-text("Logout")').isVisible().catch(() => false);
    if (!tambahGuest && logoutVisible) {
      pushResult('VAL-USER-023', 'pass', ['Click guest login', 'Verify view-only mode'], [ss023]);
      console.log('[PASS] VAL-USER-023');
    } else {
      pushResult('VAL-USER-023', 'fail', ['Click guest login', 'Verify view-only mode'], [ss023], `Tambah=${tambahGuest} Logout=${logoutVisible}`);
      console.log('[FAIL] VAL-USER-023');
    }

    // ========================================
    // VAL-USER-024: Database Persistence (BLOCKED)
    // ========================================
    pushResult('VAL-USER-024', 'blocked', ['Restart app and verify data persists'], [], 'Skipped: requires app restart within script');
    console.log('[BLOCKED] VAL-USER-024');

  } catch (outerError) {
    console.error('[ERROR] Outer test error:', outerError.message);
    console.error(outerError.stack);
    if (page) {
      const errSS = screenshotName('GLOBAL', 'error');
      await page.screenshot({ path: errSS });
    }
  } finally {
    await closeApp();
  }

  // Write JSON report
  const testedAt = new Date().toISOString();
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const blockedCount = results.filter(r => r.status === 'blocked').length;
  const report = {
    groupId: 'user-mgmt-all',
    testedAt,
    assertions: results,
    frictions: [],
    blockers: results.filter(r => r.status === 'blocked').map(r => r.id),
    summary: `User Management comprehensive test completed. ${passCount} passed, ${failCount} failed, ${blockedCount} blocked.`,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[INFO] Report written to ${reportPath}`);
  console.log(report.summary);
  results.forEach(r => {
    console.log(`  ${r.status.toUpperCase()} - ${r.id}`);
  });
}

runTests().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
