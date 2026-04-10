import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import * as XLSX from 'xlsx';
import { Server } from 'socket.io';
import { createServer } from 'http';
import * as userDb from './userDatabase';
import * as coaDb from './coaDatabase';
import * as blokDb from './blokDatabase';
import * as kasDb from './kasDatabase';
import * as bankDb from './bankDatabase';
import * as gudangDb from './gudangDatabase';
import * as syncDb from './syncDatabase';
import * as syncDetection from './syncDetection';
import * as localDbMgr from './localDatabaseManager';
import * as localFirstOps from './localFirstOperations';
import * as batchSync from './batchSyncService';
import * as autoSyncTimer from './autoSyncTimer';
import * as networkStatus from './networkStatus';
import * as dashboardApproval from './dashboardApproval';
import * as syncStatusTracking from './syncStatusTracking';
import * as syncHealthDashboard from './syncHealthDashboard';

// Configure logging
try {
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';  // Changed to debug for easier debugging
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
} catch (e) {
  // Prevent EPIPE crashes during logging setup
}

// Log application start
log.info('=== SoftwareSawit Application Starting ===');
log.info(`App version: ${app.getVersion()}`);
log.info(`Electron version: ${process.versions.electron}`);
log.info(`Node version: ${process.versions.node}`);
log.info(`Platform: ${process.platform}`);

// Global references
let mainWindow: BrowserWindow | null = null;
let socketServer: Server | null = null;
let socketServerPort = 9222;
let isAdminMode = false;

// Socket server for debugging
function startSocketServer(port: number = 9222): void {
  try {
    const httpServer = createServer();
    socketServer = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    socketServer.on('connection', (socket) => {
      log.info(`[Socket] Client connected: ${socket.id}`);

      // Send current logs to new client
      socket.emit('logs', log.transports.file.getFile().path);

      socket.on('disconnect', () => {
        log.info(`[Socket] Client disconnected: ${socket.id}`);
      });

      socket.on('get-logs', () => {
        // Client requested logs
        socket.emit('log-request', 'Logs requested');
      });
    });

    httpServer.listen(port, () => {
      socketServerPort = port;
      log.info(`[Socket] Debugging server started on port ${port}`);
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`[Socket] Port ${port} is in use, trying ${port + 1}`);
        startSocketServer(port + 1);
      } else {
        log.error(`[Socket] Server error: ${err.message}`);
      }
    });
  } catch (error) {
    log.error(`[Socket] Failed to start server: ${error}`);
  }
}

function stopSocketServer(): void {
  if (socketServer) {
    socketServer.close();
    socketServer = null;
    log.info('[Socket] Debugging server stopped');
  }
}

function createWindow(): void {
  log.info('[Window] Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    backgroundColor: '#f3f4f6',
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    log.info('[Window] Window ready to show');
    mainWindow?.show();
  });

  // Set main window reference for auto-sync timer
  autoSyncTimer.setMainWindow(mainWindow);
  
  // Initialize and set main window reference for network status
  networkStatus.initNetworkStatus(mainWindow);
  networkStatus.setMainWindow(mainWindow);

  // Set main window reference for sync status tracking
  syncStatusTracking.setMainWindow(mainWindow);

  // Handle window closed
  mainWindow.on('closed', () => {
    log.info('[Window] Main window closed');
    mainWindow = null;
  });

  // Create application menu
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SoftwareSawit',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About SoftwareSawit',
              message: 'SoftwareSawit v1.0.0',
              detail: 'Desktop application for managing plantation financial data.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Determine which app to load
  const isUserMgmt = process.argv.includes('--user-mgmt');
  const htmlFile = isUserMgmt ? 'user-mgmt.html' : 'index.html';
  const windowTitle = isUserMgmt ? 'SoftwareSawit - User Management' : 'SoftwareSawit';
  
  // Update window title
  mainWindow.setTitle(windowTitle);

  // Load the app
  if (process.argv.includes('--dev')) {
    log.info(`[Window] Loading development server... (${isUserMgmt ? 'User Management' : 'Main App'})`);
    // In dev mode, use query param since vite serves index.html as root
    const url = isUserMgmt 
      ? 'http://localhost:5173/?app=user-mgmt' 
      : 'http://localhost:5173/';
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools();
  } else {
    log.info(`[Window] Loading production build... (${isUserMgmt ? 'User Management' : 'Main App'})`);
    mainWindow.loadFile(path.join(__dirname, `../renderer/${htmlFile}`));
  }

  // Log web contents events
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('[Window] Content finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`[Window] Failed to load: ${errorCode} - ${errorDescription}`);
  });
}

// IPC Handlers
function setupIpcHandlers(): void {
  log.info('[IPC] Setting up IPC handlers...');

  // Get app info
  ipcMain.handle('app:getInfo', () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      socketPort: socketServerPort,
    };
  });

  // Get user data path
  ipcMain.handle('app:getDataPath', () => {
    return app.getPath('userData');
  });

  // ============ Local Database Manager IPC Handlers ============

  // Get database manager stats
  ipcMain.handle('db:getStats', () => {
    log.debug('[IPC] db:getStats');
    try {
      const stats = localDbMgr.localDatabaseManager.getStats();
      return { success: true, stats };
    } catch (error) {
      log.error('[IPC] db:getStats error:', error);
      return { success: false, message: 'Failed to get database stats' };
    }
  });

  // Initialize all local databases
  ipcMain.handle('db:initAll', async () => {
    log.debug('[IPC] db:initAll');
    try {
      await localDbMgr.localDatabaseManager.initAllDatabases();
      return { success: true, message: 'All databases initialized' };
    } catch (error) {
      log.error('[IPC] db:initAll error:', error);
      return { success: false, message: 'Failed to initialize databases' };
    }
  });

  // Get transaction database path
  ipcMain.handle('db:getTransactionPath', (_event, module: string, year: number, month: number) => {
    log.debug(`[IPC] db:getTransactionPath - ${module}/${year}/${month}`);
    try {
      const dbPath = localDbMgr.localDatabaseManager.getTransactionDatabasePath(
        module as 'kas' | 'bank' | 'gudang',
        year,
        month
      );
      return { success: true, path: dbPath };
    } catch (error) {
      log.error('[IPC] db:getTransactionPath error:', error);
      return { success: false, message: 'Failed to get transaction database path' };
    }
  });

  // Get existing periods for a module
  ipcMain.handle('db:getExistingPeriods', (_event, module: string) => {
    log.debug(`[IPC] db:getExistingPeriods - ${module}`);
    try {
      const periods = localDbMgr.localDatabaseManager.getExistingPeriods(
        module as 'kas' | 'bank' | 'gudang'
      );
      return { success: true, periods };
    } catch (error) {
      log.error('[IPC] db:getExistingPeriods error:', error);
      return { success: false, message: 'Failed to get existing periods' };
    }
  });

  log.info('[IPC] Database Manager IPC handlers ready');

  // DevTools toggle (admin only)
  ipcMain.handle('dev:toggleDevTools', () => {
    if (isAdminMode && mainWindow) {
      mainWindow.webContents.toggleDevTools();
      log.info('[DevTools] Toggled via IPC');
      return true;
    }
    log.warn('[DevTools] Toggle denied - not in admin mode');
    return false;
  });

  // Set admin mode
  ipcMain.handle('app:setAdminMode', (_event, enabled: boolean) => {
    isAdminMode = enabled;
    log.info(`[App] Admin mode: ${enabled}`);
    return true;
  });

  // Get admin mode status
  ipcMain.handle('app:getAdminMode', () => {
    return isAdminMode;
  });

  // Socket server control
  ipcMain.handle('socket:toggle', () => {
    if (socketServer) {
      stopSocketServer();
      return false;
    } else {
      startSocketServer(socketServerPort);
      return true;
    }
  });

  ipcMain.handle('socket:getStatus', () => {
    return {
      running: socketServer !== null,
      port: socketServerPort,
    };
  });

  // Logging
  ipcMain.handle('log:getEntries', () => {
    // Return recent log entries for display
    return [];
  });

  // ============ User Management IPC Handlers ============

  // Get all users
  ipcMain.handle('user:getAll', () => {
    log.debug('[IPC] user:getAll');
    return userDb.getAllUsers();
  });

  // Get user by ID
  ipcMain.handle('user:getById', (_event, userId: string) => {
    log.debug(`[IPC] user:getById - ${userId}`);
    return userDb.getUserById(userId);
  });

  // Get roles
  ipcMain.handle('user:getRoles', () => {
    log.debug('[IPC] user:getRoles');
    return userDb.getRoles();
  });

  // Create user
  ipcMain.handle('user:create', async (_event, username: string, password: string, fullName: string, role: string) => {
    log.debug(`[IPC] user:create - ${username}`);
    return await userDb.createUser(username, password, fullName, role);
  });

  // Update user
  ipcMain.handle('user:update', (_event, userId: string, fullName: string, role: string) => {
    log.debug(`[IPC] user:update - ${userId}`);
    return userDb.updateUser(userId, fullName, role);
  });

  // Delete user
  ipcMain.handle('user:delete', (_event, userId: string, requestingUserId: string) => {
    log.debug(`[IPC] user:delete - ${userId}`);
    return userDb.deleteUser(userId, requestingUserId);
  });

  // Clear all non-admin users (admin only)
  ipcMain.handle('user:clearAll', () => {
    log.debug('[IPC] user:clearAll');
    return userDb.clearAllUsers();
  });

  // Login
  ipcMain.handle('user:login', async (_event, username: string, password: string) => {
    log.info(`[IPC] user:login attempt for: ${username}`);
    try {
      const result = await userDb.login(username, password);
      log.info(`[IPC] user:login result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      log.error(`[IPC] user:login error: ${error}`);
      return { success: false, message: `Login error: ${error}` };
    }
  });

  // Logout
  ipcMain.handle('user:logout', (_event, token: string, userId: string) => {
    log.debug(`[IPC] user:logout`);
    return userDb.logout(token, userId);
  });

  // Validate session
  ipcMain.handle('user:validateSession', (_event, token: string) => {
    log.debug('[IPC] user:validateSession');
    return userDb.validateSession(token);
  });

  // Refresh session
  ipcMain.handle('user:refreshSession', (_event, token: string) => {
    log.debug('[IPC] user:refreshSession');
    return userDb.refreshSession(token);
  });

  // Get active sessions
  ipcMain.handle('user:getActiveSessions', () => {
    log.debug('[IPC] user:getActiveSessions');
    return userDb.getActiveSessions();
  });

  // Terminate session
  ipcMain.handle('user:terminateSession', (_event, sessionId: string) => {
    log.debug(`[IPC] user:terminateSession - ${sessionId}`);
    return userDb.terminateSession(sessionId);
  });

  // Get activity log
  ipcMain.handle('user:getActivityLog', (_event, userId?: string, limit?: number) => {
    log.debug('[IPC] user:getActivityLog');
    return userDb.getActivityLog(userId, limit);
  });

  // Change password
  ipcMain.handle('user:changePassword', async (_event, userId: string, oldPassword: string, newPassword: string) => {
    log.debug(`[IPC] user:changePassword - ${userId}`);
    return await userDb.changePassword(userId, oldPassword, newPassword);
  });

  // Admin reset password
  ipcMain.handle('user:adminResetPassword', async (_event, adminId: string, targetUserId: string, newPassword: string) => {
    log.debug(`[IPC] user:adminResetPassword - ${adminId} -> ${targetUserId}`);
    return await userDb.adminResetPassword(adminId, targetUserId, newPassword);
  });

  // Validate password strength
  ipcMain.handle('user:validatePassword', (_event, password: string) => {
    log.debug('[IPC] user:validatePassword');
    return userDb.validatePasswordStrength(password);
  });

  // Export users database
  ipcMain.handle('user:exportDatabase', async (_event, targetPath: string) => {
    log.debug(`[IPC] user:exportDatabase - ${targetPath}`);
    return userDb.exportUsersDatabase(targetPath);
  });

  // Import users database
  ipcMain.handle('user:importDatabase', async (_event, sourcePath: string, conflictResolution: 'skip' | 'overwrite' | 'merge') => {
    log.debug(`[IPC] user:importDatabase - ${sourcePath}, resolution: ${conflictResolution}`);
    return userDb.importUsersDatabase(sourcePath, conflictResolution);
  });

  // Get users database path
  ipcMain.handle('user:getUsersDbPath', () => {
    log.debug('[IPC] user:getUsersDbPath');
    return userDb.getUsersDbPath();
  });

  log.info('[IPC] User management IPC handlers ready');

  // ============ COA IPC Handlers ============

  // Get all COA
  ipcMain.handle('coa:getAll', () => {
    log.debug('[IPC] coa:getAll');
    return coaDb.getAllCOA();
  });

  // Get COA by ID
  ipcMain.handle('coa:getById', (_event, id: string) => {
    log.debug(`[IPC] coa:getById - ${id}`);
    return coaDb.getCOAById(id);
  });

  // Get COA by Kode
  ipcMain.handle('coa:getByKode', (_event, kode: string) => {
    log.debug(`[IPC] coa:getByKode - ${kode}`);
    return coaDb.getCOAByKode(kode);
  });

  // Create COA
  ipcMain.handle('coa:create', (_event, kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) => {
    log.debug(`[IPC] coa:create - ${kode}`);
    return coaDb.createCOA(kode, nama, tipe, parentId, statusAktif);
  });

  // Update COA
  ipcMain.handle('coa:update', (_event, id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) => {
    log.debug(`[IPC] coa:update - ${id}`);
    return coaDb.updateCOA(id, nama, tipe, parentId, statusAktif);
  });

  // Delete COA
  ipcMain.handle('coa:delete', (_event, id: string) => {
    log.debug(`[IPC] coa:delete - ${id}`);
    return coaDb.deleteCOA(id);
  });

  // Delete COA with cascade (including linked aspek kerja)
  ipcMain.handle('coa:deleteWithAspekKerja', (_event, id: string) => {
    log.debug(`[IPC] coa:deleteWithAspekKerja - ${id}`);
    return coaDb.deleteCOAWithAspekKerja(id);
  });

  // Clear all COA data (admin only)
  ipcMain.handle('coa:clearAll', () => {
    log.debug('[IPC] coa:clearAll');
    return coaDb.clearAllCOA();
  });

  // Clear all Aspek Kerja data (admin only)
  ipcMain.handle('aspekKerja:clearAll', () => {
    log.debug('[IPC] aspekKerja:clearAll');
    return coaDb.clearAllAspekKerja();
  });

  // Search COA
  ipcMain.handle('coa:search', (_event, searchTerm: string, tipe?: string, statusAktif?: number) => {
    log.debug(`[IPC] coa:search - ${searchTerm}`);
    return coaDb.searchCOA(searchTerm, tipe, statusAktif);
  });

  // Get COA by parent
  ipcMain.handle('coa:getByParent', (_event, parentId: string | null) => {
    log.debug(`[IPC] coa:getByParent - ${parentId}`);
    return coaDb.getCOAByParent(parentId);
  });

  // Get COA with pagination
  ipcMain.handle('coa:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, tipe?: string, statusAktif?: number) => {
    log.debug(`[IPC] coa:getWithPagination - page ${page}`);
    return coaDb.getCOAWithPagination(page, pageSize, searchTerm, tipe, statusAktif);
  });

  // Get tipe options
  ipcMain.handle('coa:getTipeOptions', () => {
    log.debug('[IPC] coa:getTipeOptions');
    return coaDb.getTipeOptions();
  });

  // Get aspek kerja count by COA
  ipcMain.handle('coa:getAspekKerjaCount', (_event, coaId: string) => {
    log.debug(`[IPC] coa:getAspekKerjaCount - ${coaId}`);
    return coaDb.getAspekKerjaCountByCOA(coaId);
  });

  // Check COA transaction references (Kas, Bank, Gudang)
  ipcMain.handle('coa:getTransactionRefs', (_event, id: string) => {
    log.debug(`[IPC] coa:getTransactionRefs - ${id}`);
    return coaDb.checkCOAInTransactions(id);
  });

  // Check Aspek Kerja transaction references (Kas, Bank, Gudang)
  ipcMain.handle('aspekKerja:getTransactionRefs', (_event, id: string) => {
    log.debug(`[IPC] aspekKerja:getTransactionRefs - ${id}`);
    return coaDb.checkAspekKerjaInTransactions(id);
  });

  log.info('[IPC] COA IPC handlers ready');

  // ============ Aspek Kerja IPC Handlers ============

  // Get all Aspek Kerja
  ipcMain.handle('aspekKerja:getAll', () => {
    log.debug('[IPC] aspekKerja:getAll');
    return coaDb.getAllAspekKerja();
  });

  // Get Aspek Kerja by ID
  ipcMain.handle('aspekKerja:getById', (_event, id: string) => {
    log.debug(`[IPC] aspekKerja:getById - ${id}`);
    return coaDb.getAspekKerjaById(id);
  });

  // Get Aspek Kerja by Kode
  ipcMain.handle('aspekKerja:getByKode', (_event, kode: string) => {
    log.debug(`[IPC] aspekKerja:getByKode - ${kode}`);
    return coaDb.getAspekKerjaByKode(kode);
  });

  // Create Aspek Kerja
  ipcMain.handle('aspekKerja:create', (_event, kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) => {
    log.debug(`[IPC] aspekKerja:create - ${kode}`);
    return coaDb.createAspekKerja(kode, nama, coaId, jenis, statusAktif);
  });

  // Update Aspek Kerja
  ipcMain.handle('aspekKerja:update', (_event, id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) => {
    log.debug(`[IPC] aspekKerja:update - ${id}`);
    return coaDb.updateAspekKerja(id, nama, coaId, jenis, statusAktif);
  });

  // Delete Aspek Kerja
  ipcMain.handle('aspekKerja:delete', (_event, id: string) => {
    log.debug(`[IPC] aspekKerja:delete - ${id}`);
    return coaDb.deleteAspekKerja(id);
  });

  // Search Aspek Kerja
  ipcMain.handle('aspekKerja:search', (_event, searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) => {
    log.debug(`[IPC] aspekKerja:search - ${searchTerm}`);
    return coaDb.searchAspekKerja(searchTerm, jenis, coaId, statusAktif);
  });

  // Get Aspek Kerja with pagination
  ipcMain.handle('aspekKerja:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) => {
    log.debug(`[IPC] aspekKerja:getWithPagination - page ${page}`);
    return coaDb.getAspekKerjaWithPagination(page, pageSize, searchTerm, jenis, coaId, statusAktif);
  });

  // Get active COA for dropdown
  ipcMain.handle('aspekKerja:getActiveCOA', () => {
    log.debug('[IPC] aspekKerja:getActiveCOA');
    return coaDb.getActiveCOA();
  });

  log.info('[IPC] Aspek Kerja IPC handlers ready');

  // ============ Blok IPC Handlers ============

  // Get all Blok
  ipcMain.handle('blok:getAll', () => {
    log.debug('[IPC] blok:getAll');
    return blokDb.getAllBlok();
  });

  // Get Blok by ID
  ipcMain.handle('blok:getById', (_event, id: string) => {
    log.debug(`[IPC] blok:getById - ${id}`);
    return blokDb.getBlokById(id);
  });

  // Get Blok by Kode
  ipcMain.handle('blok:getByKode', (_event, kodeBlok: string) => {
    log.debug(`[IPC] blok:getByKode - ${kodeBlok}`);
    return blokDb.getBlokByKode(kodeBlok);
  });

  // Create Blok
  ipcMain.handle('blok:create', (_event, kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) => {
    log.debug(`[IPC] blok:create - ${kodeBlok}`);
    return blokDb.createBlok(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
  });

  // Update Blok
  ipcMain.handle('blok:update', (_event, id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) => {
    log.debug(`[IPC] blok:update - ${id}`);
    return blokDb.updateBlok(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
  });

  // Delete Blok
  ipcMain.handle('blok:delete', (_event, id: string) => {
    log.debug(`[IPC] blok:delete - ${id}`);
    return blokDb.deleteBlok(id);
  });

  // Clear all Blok data (admin only)
  ipcMain.handle('blok:clearAll', () => {
    log.debug('[IPC] blok:clearAll');
    return blokDb.clearAllBlok();
  });

  // Check Blok transaction references (Kas, Bank, Gudang)
  ipcMain.handle('blok:getTransactionRefs', (_event, id: string) => {
    log.debug(`[IPC] blok:getTransactionRefs - ${id}`);
    return blokDb.checkBlokInTransactions(id);
  });

  // Search Blok
  ipcMain.handle('blok:search', (_event, searchTerm?: string, tahunTanam?: number, status?: string) => {
    log.debug(`[IPC] blok:search - ${searchTerm}`);
    return blokDb.searchBlok(searchTerm, tahunTanam, status);
  });

  // Get Blok with pagination
  ipcMain.handle('blok:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, tahunTanam?: number, status?: string) => {
    log.debug(`[IPC] blok:getWithPagination - page ${page}`);
    return blokDb.getBlokWithPagination(page, pageSize, searchTerm, tahunTanam, status);
  });

  // Get status options
  ipcMain.handle('blok:getStatusOptions', () => {
    log.debug('[IPC] blok:getStatusOptions');
    return blokDb.getStatusOptions();
  });

  // Get available years for filter
  ipcMain.handle('blok:getAvailableYears', () => {
    log.debug('[IPC] blok:getAvailableYears');
    return blokDb.getAvailableYears();
  });

  log.info('[IPC] Blok IPC handlers ready');

  // ============ Dialog IPC Handlers ============

  // Show save dialog
  ipcMain.handle('dialog:showSave', async (_event, defaultName: string) => {
    log.debug(`[IPC] dialog:showSave - ${defaultName}`);
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return {
      canceled: result.canceled,
      filePath: result.filePath,
    };
  });

  // Show open dialog
  ipcMain.handle('dialog:showOpen', async (_event, title: string) => {
    log.debug(`[IPC] dialog:showOpen - ${title}`);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: title,
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    };
  });

  log.info('[IPC] Dialog IPC handlers ready');

  // ============ Excel Read IPC Handler ============
  // Read Excel file via main process (more reliable than renderer)
  ipcMain.handle('excel:readFile', async (_event, filePath: string) => {
    log.debug(`[IPC] excel:readFile - ${filePath}`);
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found: ' + filePath);
      }
      const buffer = fs.readFileSync(filePath);
      const uint8Array = new Uint8Array(buffer);
      const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      log.info(`[IPC] excel:readFile - Success, ${jsonData.length} rows`);
      return { success: true, data: jsonData, sheetName };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`[IPC] excel:readFile - Error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  });

  // ============ Import IPC Handlers ============

  // Import COA batch
  ipcMain.handle('coa:importBatch', (_event, data: Array<{ kode: string; nama: string; tipe: string; parent_kode?: string; status_aktif?: number }>) => {
    log.debug(`[IPC] coa:importBatch - ${data.length} rows`);
    return coaDb.importCOABatch(data);
  });

  // Get existing COA codes for duplicate check
  ipcMain.handle('coa:getAllKodes', () => {
    log.debug('[IPC] coa:getAllKodes');
    return coaDb.getAllCOAKodes();
  });

  // Import Aspek Kerja batch
  ipcMain.handle('aspekKerja:importBatch', (_event, data: Array<{ kode: string; nama: string; coa_kode?: string; jenis?: string; status_aktif?: number }>) => {
    log.debug(`[IPC] aspekKerja:importBatch - ${data.length} rows`);
    return coaDb.importAspekKerjaBatch(data);
  });

  // Get existing Aspek Kerja codes for duplicate check
  ipcMain.handle('aspekKerja:getAllKodes', () => {
    log.debug('[IPC] aspekKerja:getAllKodes');
    return coaDb.getAllAspekKerjaKodes();
  });

  // Import Blok batch
  ipcMain.handle('blok:importBatch', (_event, data: Array<{ kode_blok: string; nama: string; tahun_tanam: string | number; luas: string | number; pokok?: number | null; sph?: number | null; bulan_tanam?: string | null; status_tanaman_2025?: string | null; status_tanaman_2026?: string | null; status_tanaman_2027?: string | null; keterangan?: string }>) => {
    log.debug(`[IPC] blok:importBatch - ${data.length} rows`);
    return blokDb.importBlokBatch(data);
  });

  // Get existing Blok codes for duplicate check
  ipcMain.handle('blok:getAllKodes', () => {
    log.debug('[IPC] blok:getAllKodes');
    return blokDb.getAllBlokKodes();
  });

  // Parse ORG-1 data from Excel (for Blok mapping verification)
  ipcMain.handle('blok:parseORG1', (_event, rawData: Array<Record<string, unknown>>) => {
    log.debug(`[IPC] blok:parseORG1 - ${rawData.length} rows`);
    return blokDb.parseORG1Data(rawData);
  });

  // Map ORG-1 data to Blok format
  ipcMain.handle('blok:mapORG1ToBlok', (_event, org1Data: blokDb.ORG1Row[]) => {
    log.debug(`[IPC] blok:mapORG1ToBlok - ${org1Data.length} rows`);
    return blokDb.mapORG1ToBlok(org1Data);
  });

  // Compare ORG-1 mapping with existing Blok records
  ipcMain.handle('blok:compareORG1WithBlok', (_event, org1Data: blokDb.ORG1Row[]) => {
    log.debug(`[IPC] blok:compareORG1WithBlok`);
    const allBlok = blokDb.getAllBlok();
    return blokDb.compareORG1WithBlok(org1Data, allBlok);
  });

  log.info('[IPC] Import IPC handlers ready');

  // ============ Kas Transaction IPC Handlers ============

  // Get all transactions
  ipcMain.handle('kas:getAll', () => {
    log.debug('[IPC] kas:getAll');
    return kasDb.getAllTransactions();
  });

  // Get transaction by ID
  ipcMain.handle('kas:getById', (_event, id: string) => {
    log.debug(`[IPC] kas:getById - ${id}`);
    return kasDb.getTransactionById(id);
  });

  // Create transaction
  ipcMain.handle('kas:create', (_event, input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    created_by: string;
  }) => {
    log.debug('[IPC] kas:create');
    return kasDb.createTransaction({
      ...input,
      transaction_type: input.transaction_type as kasDb.TransactionType,
    });
  });

  // Update transaction
  ipcMain.handle('kas:update', (_event, id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
  }, updatedBy: string) => {
    log.debug(`[IPC] kas:update - ${id}`);
    return kasDb.updateTransaction(id, input, updatedBy);
  });

  // Delete transaction
  ipcMain.handle('kas:delete', (_event, id: string) => {
    log.debug(`[IPC] kas:delete - ${id}`);
    return kasDb.deleteTransaction(id);
  });

  // Clear all Kas data (admin only)
  ipcMain.handle('kas:clearAll', () => {
    log.debug('[IPC] kas:clearAll');
    return kasDb.clearAllKas();
  });

  // Approve transaction
  ipcMain.handle('kas:approve', (_event, id: string, input: { approver_id: string; approver_name: string }) => {
    log.debug(`[IPC] kas:approve - ${id}`);
    return kasDb.approveTransaction(id, input);
  });

  // Reject transaction
  ipcMain.handle('kas:reject', (_event, id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) => {
    log.debug(`[IPC] kas:reject - ${id}`);
    return kasDb.rejectTransaction(id, input);
  });

  // Get approval history
  ipcMain.handle('kas:getApprovalHistory', (_event, transactionId: string) => {
    log.debug(`[IPC] kas:getApprovalHistory - ${transactionId}`);
    return kasDb.getApprovalHistory(transactionId);
  });

  // Get approvers
  ipcMain.handle('kas:getApprovers', () => {
    log.debug('[IPC] kas:getApprovers');
    return kasDb.getApprovers();
  });

  // Check approver setup
  ipcMain.handle('kas:checkApproverSetup', () => {
    log.debug('[IPC] kas:checkApproverSetup');
    return kasDb.checkApproverSetup();
  });

  // Get Kas balance
  ipcMain.handle('kas:getBalance', () => {
    log.debug('[IPC] kas:getBalance');
    return kasDb.getKasBalance();
  });

  // Search transactions
  ipcMain.handle('kas:search', (_event, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) => {
    log.debug('[IPC] kas:search');
    return kasDb.searchTransactions(searchTerm, transactionType as kasDb.TransactionType | '', status as kasDb.TransactionStatus | '', startDate, endDate);
  });

  // Get transactions with pagination
  ipcMain.handle('kas:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) => {
    log.debug(`[IPC] kas:getWithPagination - page ${page}`);
    return kasDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType as kasDb.TransactionType | '', status as kasDb.TransactionStatus | '', startDate, endDate, syncStatusFilter);
  });

  // Get status options
  ipcMain.handle('kas:getStatusOptions', () => {
    log.debug('[IPC] kas:getStatusOptions');
    return kasDb.getStatusOptions();
  });

  // Copy transaction
  ipcMain.handle('kas:copy', (_event, id: string, createdBy: string) => {
    log.debug(`[IPC] kas:copy - ${id}`);
    return kasDb.copyTransaction(id, createdBy);
  });

  // Validate COA
  ipcMain.handle('kas:validateCOA', (_event, coaId: string | null) => {
    log.debug('[IPC] kas:validateCOA');
    return kasDb.validateCOA(coaId);
  });

  // Get active COA
  ipcMain.handle('kas:getActiveCOA', () => {
    log.debug('[IPC] kas:getActiveCOA');
    return kasDb.getActiveCOA();
  });

  // Get active Aspek Kerja
  ipcMain.handle('kas:getActiveAspekKerja', () => {
    log.debug('[IPC] kas:getActiveAspekKerja');
    return kasDb.getActiveAspekKerja();
  });

  // Get active Blok
  ipcMain.handle('kas:getActiveBlok', () => {
    log.debug('[IPC] kas:getActiveBlok');
    return kasDb.getActiveBlok();
  });

  // Switch period
  ipcMain.handle('kas:switchPeriod', (_event, year: number, month: number) => {
    log.debug(`[IPC] kas:switchPeriod - ${year}/${month}`);
    return kasDb.switchPeriod(year, month);
  });

  // Get current period
  ipcMain.handle('kas:getCurrentPeriod', () => {
    log.debug('[IPC] kas:getCurrentPeriod');
    return kasDb.getCurrentPeriod();
  });

  // Import Kas batch
  ipcMain.handle('kas:importBatch', (_event, data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    created_by_name?: string;
  }>, createdBy: string) => {
    log.debug(`[IPC] kas:importBatch - ${data.length} rows`);
    return kasDb.importKasBatch(data, createdBy);
  });

  log.info('[IPC] Kas IPC handlers ready');

  // ============ Bank Transaction IPC Handlers ============

  // Get all transactions
  ipcMain.handle('bank:getAll', () => {
    log.debug('[IPC] bank:getAll');
    return bankDb.getAllTransactions();
  });

  // Get transaction by ID
  ipcMain.handle('bank:getById', (_event, id: string) => {
    log.debug(`[IPC] bank:getById - ${id}`);
    return bankDb.getTransactionById(id);
  });

  // Create transaction
  ipcMain.handle('bank:create', (_event, input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    bank_account: string | null;
    created_by: string;
  }) => {
    log.debug('[IPC] bank:create');
    return bankDb.createTransaction({
      ...input,
      transaction_type: input.transaction_type as bankDb.TransactionType,
    });
  });

  // Update transaction
  ipcMain.handle('bank:update', (_event, id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    bank_account?: string | null;
  }, updatedBy: string) => {
    log.debug(`[IPC] bank:update - ${id}`);
    return bankDb.updateTransaction(id, input, updatedBy);
  });

  // Delete transaction
  ipcMain.handle('bank:delete', (_event, id: string) => {
    log.debug(`[IPC] bank:delete - ${id}`);
    return bankDb.deleteTransaction(id);
  });

  // Clear all Bank data (admin only)
  ipcMain.handle('bank:clearAll', () => {
    log.debug('[IPC] bank:clearAll');
    return bankDb.clearAllBank();
  });

  // Approve transaction
  ipcMain.handle('bank:approve', (_event, id: string, input: { approver_id: string; approver_name: string }) => {
    log.debug(`[IPC] bank:approve - ${id}`);
    return bankDb.approveTransaction(id, input);
  });

  // Reject transaction
  ipcMain.handle('bank:reject', (_event, id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) => {
    log.debug(`[IPC] bank:reject - ${id}`);
    return bankDb.rejectTransaction(id, input);
  });

  // Get approval history
  ipcMain.handle('bank:getApprovalHistory', (_event, transactionId: string) => {
    log.debug(`[IPC] bank:getApprovalHistory - ${transactionId}`);
    return bankDb.getApprovalHistory(transactionId);
  });

  // Get approvers
  ipcMain.handle('bank:getApprovers', () => {
    log.debug('[IPC] bank:getApprovers');
    return bankDb.getApprovers();
  });

  // Check approver setup
  ipcMain.handle('bank:checkApproverSetup', () => {
    log.debug('[IPC] bank:checkApproverSetup');
    return bankDb.checkApproverSetup();
  });

  // Get Bank balance
  ipcMain.handle('bank:getBalance', () => {
    log.debug('[IPC] bank:getBalance');
    return bankDb.getBankBalance();
  });

  // Search transactions
  ipcMain.handle('bank:search', (_event, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) => {
    log.debug('[IPC] bank:search');
    return bankDb.searchTransactions(searchTerm, transactionType as bankDb.TransactionType | '', status as bankDb.TransactionStatus | '', startDate, endDate);
  });

  // Get transactions with pagination
  ipcMain.handle('bank:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) => {
    log.debug(`[IPC] bank:getWithPagination - page ${page}`);
    return bankDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType as bankDb.TransactionType | '', status as bankDb.TransactionStatus | '', startDate, endDate, syncStatusFilter);
  });

  // Get status options
  ipcMain.handle('bank:getStatusOptions', () => {
    log.debug('[IPC] bank:getStatusOptions');
    return bankDb.getStatusOptions();
  });

  // Copy transaction
  ipcMain.handle('bank:copy', (_event, id: string, createdBy: string) => {
    log.debug(`[IPC] bank:copy - ${id}`);
    return bankDb.copyTransaction(id, createdBy);
  });

  // Validate COA
  ipcMain.handle('bank:validateCOA', (_event, coaId: string | null) => {
    log.debug('[IPC] bank:validateCOA');
    return bankDb.validateCOA(coaId);
  });

  // Get active COA
  ipcMain.handle('bank:getActiveCOA', () => {
    log.debug('[IPC] bank:getActiveCOA');
    return bankDb.getActiveCOA();
  });

  // Get active Aspek Kerja
  ipcMain.handle('bank:getActiveAspekKerja', () => {
    log.debug('[IPC] bank:getActiveAspekKerja');
    return bankDb.getActiveAspekKerja();
  });

  // Get active Blok
  ipcMain.handle('bank:getActiveBlok', () => {
    log.debug('[IPC] bank:getActiveBlok');
    return bankDb.getActiveBlok();
  });

  // Switch period
  ipcMain.handle('bank:switchPeriod', (_event, year: number, month: number) => {
    log.debug(`[IPC] bank:switchPeriod - ${year}/${month}`);
    return bankDb.switchPeriod(year, month);
  });

  // Get current period
  ipcMain.handle('bank:getCurrentPeriod', () => {
    log.debug('[IPC] bank:getCurrentPeriod');
    return bankDb.getCurrentPeriod();
  });

  // Import Bank batch
  ipcMain.handle('bank:importBatch', (_event, data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    bank_account?: string;
    created_by_name?: string;
  }>, createdBy: string) => {
    log.debug(`[IPC] bank:importBatch - ${data.length} rows`);
    return bankDb.importBankBatch(data, createdBy);
  });

  log.info('[IPC] Bank IPC handlers ready');

  // ============ Gudang Transaction IPC Handlers ============

  // Get all transactions
  ipcMain.handle('gudang:getAll', () => {
    log.debug('[IPC] gudang:getAll');
    return gudangDb.getAllTransactions();
  });

  // Get transaction by ID
  ipcMain.handle('gudang:getById', (_event, id: string) => {
    log.debug(`[IPC] gudang:getById - ${id}`);
    return gudangDb.getTransactionById(id);
  });

  // Create transaction
  ipcMain.handle('gudang:create', (_event, input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    item_name: string | null;
    item_unit: string | null;
    created_by: string;
  }) => {
    log.debug('[IPC] gudang:create');
    return gudangDb.createTransaction({
      ...input,
      transaction_type: input.transaction_type as gudangDb.TransactionType,
    });
  });

  // Update transaction
  ipcMain.handle('gudang:update', (_event, id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    item_name?: string | null;
    item_unit?: string | null;
  }, updatedBy: string) => {
    log.debug(`[IPC] gudang:update - ${id}`);
    return gudangDb.updateTransaction(id, input, updatedBy);
  });

  // Delete transaction
  ipcMain.handle('gudang:delete', (_event, id: string) => {
    log.debug(`[IPC] gudang:delete - ${id}`);
    return gudangDb.deleteTransaction(id);
  });

  // Clear all Gudang data (admin only)
  ipcMain.handle('gudang:clearAll', () => {
    log.debug('[IPC] gudang:clearAll');
    return gudangDb.clearAllGudang();
  });

  // Approve transaction
  ipcMain.handle('gudang:approve', (_event, id: string, input: { approver_id: string; approver_name: string }) => {
    log.debug(`[IPC] gudang:approve - ${id}`);
    return gudangDb.approveTransaction(id, input);
  });

  // Reject transaction
  ipcMain.handle('gudang:reject', (_event, id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) => {
    log.debug(`[IPC] gudang:reject - ${id}`);
    return gudangDb.rejectTransaction(id, input);
  });

  // Get approval history
  ipcMain.handle('gudang:getApprovalHistory', (_event, transactionId: string) => {
    log.debug(`[IPC] gudang:getApprovalHistory - ${transactionId}`);
    return gudangDb.getApprovalHistory(transactionId);
  });

  // Get approvers
  ipcMain.handle('gudang:getApprovers', () => {
    log.debug('[IPC] gudang:getApprovers');
    return gudangDb.getApprovers();
  });

  // Check approver setup
  ipcMain.handle('gudang:checkApproverSetup', () => {
    log.debug('[IPC] gudang:checkApproverSetup');
    return gudangDb.checkApproverSetup();
  });

  // Get Gudang stock
  ipcMain.handle('gudang:getStock', () => {
    log.debug('[IPC] gudang:getStock');
    return gudangDb.getGudangStock();
  });

  // Search transactions
  ipcMain.handle('gudang:search', (_event, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) => {
    log.debug('[IPC] gudang:search');
    return gudangDb.searchTransactions(searchTerm, transactionType as gudangDb.TransactionType | '', status as gudangDb.TransactionStatus | '', startDate, endDate);
  });

  // Get transactions with pagination
  ipcMain.handle('gudang:getWithPagination', (_event, page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) => {
    log.debug(`[IPC] gudang:getWithPagination - page ${page}`);
    return gudangDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType as gudangDb.TransactionType | '', status as gudangDb.TransactionStatus | '', startDate, endDate, syncStatusFilter);
  });

  // Get status options
  ipcMain.handle('gudang:getStatusOptions', () => {
    log.debug('[IPC] gudang:getStatusOptions');
    return gudangDb.getStatusOptions();
  });

  // Copy transaction
  ipcMain.handle('gudang:copy', (_event, id: string, createdBy: string) => {
    log.debug(`[IPC] gudang:copy - ${id}`);
    return gudangDb.copyTransaction(id, createdBy);
  });

  // Validate COA
  ipcMain.handle('gudang:validateCOA', (_event, coaId: string | null) => {
    log.debug('[IPC] gudang:validateCOA');
    return gudangDb.validateCOA(coaId);
  });

  // Get active COA
  ipcMain.handle('gudang:getActiveCOA', () => {
    log.debug('[IPC] gudang:getActiveCOA');
    return gudangDb.getActiveCOA();
  });

  // Get active Aspek Kerja
  ipcMain.handle('gudang:getActiveAspekKerja', () => {
    log.debug('[IPC] gudang:getActiveAspekKerja');
    return gudangDb.getActiveAspekKerja();
  });

  // Get active Blok
  ipcMain.handle('gudang:getActiveBlok', () => {
    log.debug('[IPC] gudang:getActiveBlok');
    return gudangDb.getActiveBlok();
  });

  // Switch period
  ipcMain.handle('gudang:switchPeriod', (_event, year: number, month: number) => {
    log.debug(`[IPC] gudang:switchPeriod - ${year}/${month}`);
    return gudangDb.switchPeriod(year, month);
  });

  // Get current period
  ipcMain.handle('gudang:getCurrentPeriod', () => {
    log.debug('[IPC] gudang:getCurrentPeriod');
    return gudangDb.getCurrentPeriod();
  });

  // Import Gudang batch
  ipcMain.handle('gudang:importBatch', (_event, data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    item_name?: string;
    item_unit?: string;
    created_by_name?: string;
  }>, createdBy: string) => {
    log.debug(`[IPC] gudang:importBatch - ${data.length} rows`);
    return gudangDb.importGudangBatch(data, createdBy);
  });

  log.info('[IPC] Gudang IPC handlers ready');

  // ============ Revision Workflow IPC Handlers ============

  // Get pending revisions from all modules
  ipcMain.handle('revision:getPendingRevisions', (_event, filters?: {
    module?: 'kas' | 'bank' | 'gudang';
    transactionId?: string;
  }) => {
    log.debug('[IPC] revision:getPendingRevisions');
    try {
      const allRevisions: Array<{
        id: string;
        transaction_id: string;
        module: string;
        status: string;
        revision_reason: string;
        requested_by: string;
        requested_at: string;
        revision_approver_1_id: string | null;
        revision_approver_1_name: string | null;
        revision_approver_1_at: string | null;
        revision_approver_2_id: string | null;
        revision_approver_2_name: string | null;
        revision_approver_2_at: string | null;
        rejection_reason: string | null;
        applied_at: string | null;
        // Original values
        original_transaction_number: string;
        original_transaction_date: string;
        original_transaction_type: string;
        original_amount: number;
        original_description: string | null;
        original_coa_id: string | null;
        original_aspek_kerja_id: string | null;
        original_blok_id: string | null;
        original_bank_account?: string | null;
        original_item_name?: string | null;
        original_item_unit?: string | null;
        // Proposed values
        proposed_transaction_date: string | null;
        proposed_transaction_type: string | null;
        proposed_amount: number | null;
        proposed_description: string | null;
        proposed_coa_id: string | null;
        proposed_aspek_kerja_id: string | null;
        proposed_blok_id: string | null;
        proposed_bank_account?: string | null;
        proposed_item_name?: string | null;
        proposed_item_unit?: string | null;
      }> = [];

      const module = filters?.module;
      const transactionId = filters?.transactionId;

      // Fetch from each module
      if (!module || module === 'kas') {
        const kasRevisions = kasDb.getPendingRevisions('kas', transactionId);
        allRevisions.push(...kasRevisions.map(r => ({ ...r })));
      }
      if (!module || module === 'bank') {
        const bankRevisions = bankDb.getPendingRevisions('bank', transactionId);
        allRevisions.push(...bankRevisions.map(r => ({ ...r })));
      }
      if (!module || module === 'gudang') {
        const gudangRevisions = gudangDb.getPendingRevisions('gudang', transactionId);
        allRevisions.push(...gudangRevisions.map(r => ({ ...r })));
      }

      // Sort by requested_at descending (newest first)
      allRevisions.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

      return { success: true, revisions: allRevisions };
    } catch (error) {
      log.error('[IPC] revision:getPendingRevisions error:', error);
      return { success: false, message: 'Failed to get pending revisions', revisions: [] };
    }
  });

  // Get revision by ID
  ipcMain.handle('revision:getById', (_event, revisionId: string) => {
    log.debug(`[IPC] revision:getById - ${revisionId}`);
    try {
      // Try each module's getRevisionById
      let revision: kasDb.KasTransactionRevision | bankDb.BankTransactionRevision | gudangDb.GudangTransactionRevision | null = kasDb.getRevisionById(revisionId);
      if (!revision) revision = bankDb.getRevisionById(revisionId);
      if (!revision) revision = gudangDb.getRevisionById(revisionId);
      
      if (!revision) {
        return { success: false, message: 'Revisi tidak ditemukan' };
      }
      return { success: true, revision };
    } catch (error) {
      log.error('[IPC] revision:getById error:', error);
      return { success: false, message: 'Failed to get revision' };
    }
  });

  // Get all revisions for a transaction
  ipcMain.handle('revision:getForTransaction', (_event, module: 'kas' | 'bank' | 'gudang', transactionId: string) => {
    log.debug(`[IPC] revision:getForTransaction - ${module}/${transactionId}`);
    try {
      let revisions;
      switch (module) {
        case 'kas':
          revisions = kasDb.getRevisionsForTransaction(transactionId);
          break;
        case 'bank':
          revisions = bankDb.getRevisionsForTransaction(transactionId);
          break;
        case 'gudang':
          revisions = gudangDb.getRevisionsForTransaction(transactionId);
          break;
      }
      return { success: true, revisions: revisions || [] };
    } catch (error) {
      log.error('[IPC] revision:getForTransaction error:', error);
      return { success: false, message: 'Failed to get revisions for transaction', revisions: [] };
    }
  });

  // Approve revision
  ipcMain.handle('revision:approve', (_event, revisionId: string, input: { approver_id: string; approver_name: string }) => {
    log.debug(`[IPC] revision:approve - ${revisionId}`);
    try {
      // First get the revision to know which module
      let revision: kasDb.KasTransactionRevision | bankDb.BankTransactionRevision | gudangDb.GudangTransactionRevision | null = kasDb.getRevisionById(revisionId);
      if (!revision) revision = bankDb.getRevisionById(revisionId);
      if (!revision) revision = gudangDb.getRevisionById(revisionId);

      if (!revision) {
        return { success: false, message: 'Revisi tidak ditemukan' };
      }

      let result;
      switch (revision.module) {
        case 'kas':
          result = kasDb.approveRevision(revisionId, input);
          break;
        case 'bank':
          result = bankDb.approveRevision(revisionId, input);
          break;
        case 'gudang':
          result = gudangDb.approveRevision(revisionId, input);
          break;
        default:
          return { success: false, message: 'Module tidak valid' };
      }
      return result;
    } catch (error) {
      log.error('[IPC] revision:approve error:', error);
      return { success: false, message: 'Failed to approve revision' };
    }
  });

  // Reject revision
  ipcMain.handle('revision:reject', (_event, revisionId: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) => {
    log.debug(`[IPC] revision:reject - ${revisionId}`);
    try {
      // First get the revision to know which module
      let revision: kasDb.KasTransactionRevision | bankDb.BankTransactionRevision | gudangDb.GudangTransactionRevision | null = kasDb.getRevisionById(revisionId);
      if (!revision) revision = bankDb.getRevisionById(revisionId);
      if (!revision) revision = gudangDb.getRevisionById(revisionId);

      if (!revision) {
        return { success: false, message: 'Revisi tidak ditemukan' };
      }

      let result;
      switch (revision.module) {
        case 'kas':
          result = kasDb.rejectRevision(revisionId, input);
          break;
        case 'bank':
          result = bankDb.rejectRevision(revisionId, input);
          break;
        case 'gudang':
          result = gudangDb.rejectRevision(revisionId, input);
          break;
        default:
          return { success: false, message: 'Module tidak valid' };
      }
      return result;
    } catch (error) {
      log.error('[IPC] revision:reject error:', error);
      return { success: false, message: 'Failed to reject revision' };
    }
  });

  // Cancel revision (by requester)
  ipcMain.handle('revision:cancel', (_event, revisionId: string, cancelledBy: string) => {
    log.debug(`[IPC] revision:cancel - ${revisionId}`);
    try {
      // First get the revision to know which module
      let revision: kasDb.KasTransactionRevision | bankDb.BankTransactionRevision | gudangDb.GudangTransactionRevision | null = kasDb.getRevisionById(revisionId);
      if (!revision) revision = bankDb.getRevisionById(revisionId);
      if (!revision) revision = gudangDb.getRevisionById(revisionId);

      if (!revision) {
        return { success: false, message: 'Revisi tidak ditemukan' };
      }

      let result;
      switch (revision.module) {
        case 'kas':
          result = kasDb.cancelRevision(revisionId, cancelledBy);
          break;
        case 'bank':
          result = bankDb.cancelRevision(revisionId, cancelledBy);
          break;
        case 'gudang':
          result = gudangDb.cancelRevision(revisionId, cancelledBy);
          break;
        default:
          return { success: false, message: 'Module tidak valid' };
      }
      return result;
    } catch (error) {
      log.error('[IPC] revision:cancel error:', error);
      return { success: false, message: 'Failed to cancel revision' };
    }
  });

  // Get revision counts for summary
  ipcMain.handle('revision:getCounts', () => {
    log.debug('[IPC] revision:getCounts');
    try {
      const kasPA1 = kasDb.getPendingRevisions('kas').filter(r => r.status === 'Pending Revision Approval 1').length;
      const kasPA2 = kasDb.getPendingRevisions('kas').filter(r => r.status === 'Pending Revision Approval 2').length;
      const bankPA1 = bankDb.getPendingRevisions('bank').filter(r => r.status === 'Pending Revision Approval 1').length;
      const bankPA2 = bankDb.getPendingRevisions('bank').filter(r => r.status === 'Pending Revision Approval 2').length;
      const gudangPA1 = gudangDb.getPendingRevisions('gudang').filter(r => r.status === 'Pending Revision Approval 1').length;
      const gudangPA2 = gudangDb.getPendingRevisions('gudang').filter(r => r.status === 'Pending Revision Approval 2').length;

      return {
        success: true,
        counts: {
          pendingRevisionApproval1: kasPA1 + bankPA1 + gudangPA1,
          pendingRevisionApproval2: kasPA2 + bankPA2 + gudangPA2,
          totalPending: kasPA1 + bankPA1 + gudangPA1 + kasPA2 + bankPA2 + gudangPA2,
          byModule: {
            kas: kasPA1 + kasPA2,
            bank: bankPA1 + bankPA2,
            gudang: gudangPA1 + gudangPA2,
          },
        },
      };
    } catch (error) {
      log.error('[IPC] revision:getCounts error:', error);
      return { success: false, message: 'Failed to get revision counts' };
    }
  });

  log.info('[IPC] Revision workflow IPC handlers ready');

  // ============ Sync System IPC Handlers ============

  // Initialize sync database
  ipcMain.handle('sync:init', async () => {
    log.debug('[IPC] sync:init');
    try {
      await syncDb.initSyncDatabase();
      return { success: true, message: 'Sync database initialized' };
    } catch (error) {
      log.error('[IPC] sync:init failed:', error);
      return { success: false, message: 'Failed to initialize sync database' };
    }
  });

  // Get all sync configurations
  ipcMain.handle('sync:getAllConfigs', () => {
    log.debug('[IPC] sync:getAllConfigs');
    return syncDb.getAllSyncConfigs();
  });

  // Get sync config by module
  ipcMain.handle('sync:getConfig', (_event, module: string) => {
    log.debug(`[IPC] sync:getConfig - ${module}`);
    return syncDb.getSyncConfigByModule(module);
  });

  // Save sync config
  ipcMain.handle('sync:saveConfig', (_event, input: { module: string; remotePath: string; enabled: boolean }) => {
    log.debug(`[IPC] sync:saveConfig - ${input.module}`);
    return syncDb.saveSyncConfig(input);
  });

  // Delete sync config
  ipcMain.handle('sync:deleteConfig', (_event, module: string) => {
    log.debug(`[IPC] sync:deleteConfig - ${module}`);
    return syncDb.deleteSyncConfig(module);
  });

  // Check connection status for a module
  ipcMain.handle('sync:checkConnection', (_event, module: string) => {
    log.debug(`[IPC] sync:checkConnection - ${module}`);
    return syncDb.checkPathConnection(module);
  });

  // Check all connections
  ipcMain.handle('sync:checkAllConnections', () => {
    log.debug('[IPC] sync:checkAllConnections');
    return syncDb.checkAllConnections();
  });

  // Get sync queue count
  ipcMain.handle('sync:getQueueCount', () => {
    log.debug('[IPC] sync:getQueueCount');
    return syncDb.getSyncQueueCount();
  });

  // Get per-module sync status summary (for VAL-UI-008)
  ipcMain.handle('sync:getModuleSyncStatus', () => {
    log.debug('[IPC] sync:getModuleSyncStatus');
    try {
      const stats = syncDb.getSyncQueueStats();
      const configs = syncDb.getAllSyncConfigs();
      
      // Build per-module status for all modules (kas, bank, gudang, coa, aspek_kerja, blok)
      const modules = ['kas', 'bank', 'gudang', 'coa', 'aspek_kerja', 'blok'];
      const moduleSyncStatus: Record<string, {
        module: string;
        pendingCount: number;
        failedCount: number;
        lastSyncAt: string | null;
        syncState: 'synced' | 'pending' | 'error' | 'not_configured';
      }> = {};

      for (const mod of modules) {
        const config = configs.find(c => c.module === mod);
        const pendingCount = stats.byModule[mod] || 0;
        
        // Determine sync state
        let syncState: 'synced' | 'pending' | 'error' | 'not_configured';
        if (!config || !config.enabled) {
          syncState = 'not_configured';
        } else if (pendingCount > 0) {
          syncState = 'pending';
        } else {
          syncState = 'synced';
        }

        moduleSyncStatus[mod] = {
          module: mod,
          pendingCount,
          failedCount: 0, // Could be tracked separately if needed
          lastSyncAt: config?.lastSyncAt || null,
          syncState,
        };
      }

      return { success: true, modules: moduleSyncStatus };
    } catch (error) {
      log.error('[IPC] sync:getModuleSyncStatus error:', error);
      return { success: false, message: 'Failed to get module sync status' };
    }
  });

  // Get pending sync items
  ipcMain.handle('sync:getPendingItems', () => {
    log.debug('[IPC] sync:getPendingItems');
    return syncDb.getPendingSyncItems();
  });

  // Add to sync queue
  ipcMain.handle('sync:addToQueue', (_event, module: string, operation: 'create' | 'update' | 'delete', recordId: string, data: Record<string, unknown>) => {
    log.debug(`[IPC] sync:addToQueue - ${module}/${operation}/${recordId}`);
    return syncDb.addToSyncQueue(module, operation, recordId, data);
  });

  // Trigger manual sync
  ipcMain.handle('sync:performSync', async (_event, module: string) => {
    log.debug(`[IPC] sync:performSync - ${module}`);
    return await syncDb.performSync(module);
  });

  // Trigger auto-sync (with delay)
  ipcMain.handle('sync:triggerAutoSync', (_event, module: string) => {
    log.debug(`[IPC] sync:triggerAutoSync - ${module}`);
    syncDb.triggerAutoSync(module);
    return { success: true, message: 'Auto-sync scheduled' };
  });

  // Clear sync queue
  ipcMain.handle('sync:clearQueue', () => {
    log.debug('[IPC] sync:clearQueue');
    return syncDb.clearSyncQueue();
  });

  // Get recent conflicts
  ipcMain.handle('sync:getConflicts', (_event, limit?: number) => {
    log.debug('[IPC] sync:getConflicts');
    return syncDb.getRecentConflicts(limit);
  });

  // Detect conflict
  ipcMain.handle('sync:detectConflict', (_event, module: string, recordId: string, localTimestamp: string, remoteTimestamp: string) => {
    log.debug(`[IPC] sync:detectConflict - ${module}/${recordId}`);
    return syncDb.detectConflict(module, recordId, localTimestamp, remoteTimestamp);
  });

  // ============ Conflict Resolution IPC Handlers ============

  // Get pending conflicts that need manual resolution
  ipcMain.handle('sync:getPendingConflicts', (_event, module?: string) => {
    log.debug(`[IPC] sync:getPendingConflicts - module: ${module || 'all'}`);
    return syncDb.getPendingConflicts(module);
  });

  // Get a specific conflict by ID
  ipcMain.handle('sync:getConflictById', (_event, id: string) => {
    log.debug(`[IPC] sync:getConflictById - ${id}`);
    return syncDb.getConflictById(id);
  });

  // Resolve a conflict manually
  ipcMain.handle('sync:resolveConflict', (_event, conflictId: string, resolution: 'local' | 'remote' | 'merged', resolvedData?: Record<string, unknown>) => {
    log.debug(`[IPC] sync:resolveConflict - ${conflictId} -> ${resolution}`);
    return syncDb.resolveConflict(conflictId, resolution, resolvedData);
  });

  // Discard a conflict
  ipcMain.handle('sync:discardConflict', (_event, conflictId: string) => {
    log.debug(`[IPC] sync:discardConflict - ${conflictId}`);
    return syncDb.discardConflict(conflictId);
  });

  // Get conflict statistics
  ipcMain.handle('sync:getConflictStats', () => {
    log.debug('[IPC] sync:getConflictStats');
    return syncDb.getConflictStats();
  });

  // Get sync history (VAL-UI-009)
  ipcMain.handle('sync:getSyncHistory', (_event, page?: number, pageSize?: number, filter?: {
    startDate?: string;
    endDate?: string;
    module?: string;
    direction?: 'up' | 'down';
    status?: 'success' | 'partial' | 'failed';
  }) => {
    log.debug('[IPC] sync:getSyncHistory');
    return syncDb.getSyncHistory(page, pageSize, filter);
  });

  // ============ Transaction Sync Status IPC Handlers (F012-BE) ============

  // Get sync status for a transaction
  ipcMain.handle('sync:getTransactionSyncStatus', (_event, module: 'kas' | 'bank' | 'gudang', recordId: string) => {
    log.debug(`[IPC] sync:getTransactionSyncStatus - ${module}/${recordId}`);
    try {
      const status = syncStatusTracking.getTransactionSyncStatus(module, recordId);
      if (status) {
        return { success: true, status };
      }
      return { success: false, message: 'Transaction sync status not found' };
    } catch (error) {
      log.error('[IPC] sync:getTransactionSyncStatus error:', error);
      return { success: false, message: 'Failed to get transaction sync status' };
    }
  });

  // Get all transactions with sync status for a module
  ipcMain.handle('sync:getTransactionsWithSyncStatus', (_event, module: 'kas' | 'bank' | 'gudang') => {
    log.debug(`[IPC] sync:getTransactionsWithSyncStatus - ${module}`);
    try {
      const statuses = syncStatusTracking.getTransactionsWithSyncStatus(module);
      return { success: true, statuses };
    } catch (error) {
      log.error('[IPC] sync:getTransactionsWithSyncStatus error:', error);
      return { success: false, message: 'Failed to get transactions with sync status' };
    }
  });

  // Update transaction sync status (internal use)
  ipcMain.handle('sync:updateTransactionSyncStatus', (_event, module: 'kas' | 'bank' | 'gudang', recordId: string, status: 'synced' | 'pending' | 'failed' | 'conflict', errorMessage?: string) => {
    log.debug(`[IPC] sync:updateTransactionSyncStatus - ${module}/${recordId}: ${status}`);
    try {
      let result;
      switch (status) {
        case 'synced':
          result = syncStatusTracking.onTransactionSynced(module, recordId);
          break;
        case 'pending':
          result = syncStatusTracking.onTransactionQueued(module, recordId);
          break;
        case 'failed':
          result = syncStatusTracking.onTransactionSyncFailed(module, recordId, errorMessage || 'Sync failed');
          break;
        case 'conflict':
          result = syncStatusTracking.onTransactionConflict(module, recordId);
          break;
        default:
          return { success: false, message: 'Invalid sync status' };
      }
      return result;
    } catch (error) {
      log.error('[IPC] sync:updateTransactionSyncStatus error:', error);
      return { success: false, message: 'Failed to update transaction sync status' };
    }
  });

  // Reset sync status for retry
  ipcMain.handle('sync:resetTransactionSyncStatus', (_event, module: 'kas' | 'bank' | 'gudang', recordId: string) => {
    log.debug(`[IPC] sync:resetTransactionSyncStatus - ${module}/${recordId}`);
    try {
      return syncStatusTracking.resetSyncStatusForRetry(module, recordId);
    } catch (error) {
      log.error('[IPC] sync:resetTransactionSyncStatus error:', error);
      return { success: false, message: 'Failed to reset transaction sync status' };
    }
  });

  log.info('[IPC] Sync system IPC handlers ready');

  // ============ Sync Health Dashboard IPC Handlers (F014-BE) ============

  // Get sync statistics - accurate counts (pending, failed, total)
  ipcMain.handle('syncHealth:getStats', () => {
    log.debug('[IPC] syncHealth:getStats');
    return syncHealthDashboard.getSyncStats();
  });

  // Get per-module sync status breakdown
  ipcMain.handle('syncHealth:getModuleSyncStatus', () => {
    log.debug('[IPC] syncHealth:getModuleSyncStatus');
    return syncHealthDashboard.getModuleSyncStatus();
  });

  // Get list of failed items with retry information
  ipcMain.handle('syncHealth:getFailedItems', (_event, options?: {
    module?: string;
    limit?: number;
    offset?: number;
  }) => {
    log.debug('[IPC] syncHealth:getFailedItems');
    return syncHealthDashboard.getFailedItems(options);
  });

  // Retry a single failed item
  ipcMain.handle('syncHealth:retryFailedItem', (_event, itemId: string) => {
    log.debug(`[IPC] syncHealth:retryFailedItem - ${itemId}`);
    return syncHealthDashboard.retryFailedItem(itemId);
  });

  // Retry all failed items
  ipcMain.handle('syncHealth:retryAllFailed', () => {
    log.debug('[IPC] syncHealth:retryAllFailed');
    return syncHealthDashboard.retryAllFailed();
  });

  // Get retry configuration info
  ipcMain.handle('syncHealth:getRetryConfig', () => {
    log.debug('[IPC] syncHealth:getRetryConfig');
    return syncHealthDashboard.getRetryConfig();
  });

  // Get queue health status
  ipcMain.handle('syncHealth:getQueueHealth', () => {
    log.debug('[IPC] syncHealth:getQueueHealth');
    return syncHealthDashboard.getQueueHealth();
  });

  // Get comprehensive health dashboard data
  ipcMain.handle('syncHealth:getHealthDashboardData', () => {
    log.debug('[IPC] syncHealth:getHealthDashboardData');
    return syncHealthDashboard.getHealthDashboardData();
  });

  log.info('[IPC] Sync Health Dashboard IPC handlers ready');

  // Process batch sync with configurable options
  ipcMain.handle('batchSync:process', async (_event, baseUrl: string, authToken: string, config?: Partial<batchSync.BatchSyncConfig>) => {
    log.debug('[IPC] batchSync:process');
    try {
      const apiClient = batchSync.createApiClient(baseUrl, authToken);
      const result = await batchSync.processBatchSync(apiClient, config);
      return { success: true, result };
    } catch (error) {
      log.error('[IPC] batchSync:process failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Set batch sync progress callback
  ipcMain.handle('batchSync:setProgressCallback', (_event, callbackId: string) => {
    log.debug(`[IPC] batchSync:setProgressCallback - ${callbackId}`);
    // The actual callback is set via the process call; this just registers intent
    return { success: true, message: 'Progress callback registered' };
  });

  // Cancel ongoing batch sync
  ipcMain.handle('batchSync:cancel', () => {
    log.debug('[IPC] batchSync:cancel');
    batchSync.cancelBatchSync();
    return { success: true, message: 'Batch sync cancellation requested' };
  });

  // Get batch sync configuration
  ipcMain.handle('batchSync:getConfig', () => {
    log.debug('[IPC] batchSync:getConfig');
    return batchSync.getConfig();
  });

  // Set batch sync configuration
  ipcMain.handle('batchSync:setConfig', (_event, config: Partial<batchSync.BatchSyncConfig>) => {
    log.debug('[IPC] batchSync:setConfig');
    const validation = batchSync.validateConfig(config);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    batchSync.setConfig(config);
    return { success: true, config: batchSync.getConfig() };
  });

  // Get batch sync statistics
  ipcMain.handle('batchSync:getStats', () => {
    log.debug('[IPC] batchSync:getStats');
    return batchSync.getBatchSyncStats();
  });

  // Retry failed items from a previous batch sync
  ipcMain.handle('batchSync:retryFailed', async (_event, baseUrl: string, authToken: string, itemIds: string[], config?: Partial<batchSync.BatchSyncConfig>) => {
    log.debug(`[IPC] batchSync:retryFailed - ${itemIds.length} items`);
    try {
      const apiClient = batchSync.createApiClient(baseUrl, authToken);
      const result = await batchSync.retryFailedItems(apiClient, itemIds, config);
      return { success: true, result };
    } catch (error) {
      log.error('[IPC] batchSync:retryFailed failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  log.info('[IPC] Batch sync IPC handlers ready');

  // ============ Local-First Operations IPC Handlers ============

  // Get sync queue status (pending operations count)
  ipcMain.handle('localFirst:getSyncQueueStatus', () => {
    log.debug('[IPC] localFirst:getSyncQueueStatus');
    return localFirstOps.getSyncQueueStatus();
  });

  // Check if module has pending sync operations
  ipcMain.handle('localFirst:hasPendingSyncForModule', (_event, module: string) => {
    log.debug(`[IPC] localFirst:hasPendingSyncForModule - ${module}`);
    return localFirstOps.hasPendingSyncForModule(module as 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok');
  });

  // Get pending sync count for module
  ipcMain.handle('localFirst:getPendingSyncCountForModule', (_event, module: string) => {
    log.debug(`[IPC] localFirst:getPendingSyncCountForModule - ${module}`);
    return localFirstOps.getPendingSyncCountForModule(module as 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok');
  });

  // Create Kas transaction (local-first)
  ipcMain.handle('localFirst:kas:create', (_event, input: localFirstOps.CreateKasTransactionInput) => {
    log.debug('[IPC] localFirst:kas:create');
    return localFirstOps.createKasTransactionLocalFirst(input);
  });

  // Update Kas transaction (local-first)
  ipcMain.handle('localFirst:kas:update', (_event, id: string, input: localFirstOps.UpdateKasTransactionInput, updatedBy: string) => {
    log.debug(`[IPC] localFirst:kas:update - ${id}`);
    return localFirstOps.updateKasTransactionLocalFirst(id, input, updatedBy);
  });

  // Delete Kas transaction (local-first, soft delete)
  ipcMain.handle('localFirst:kas:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:kas:delete - ${id}`);
    return localFirstOps.deleteKasTransactionLocalFirst(id);
  });

  // Create Bank transaction (local-first)
  ipcMain.handle('localFirst:bank:create', (_event, input: localFirstOps.CreateBankTransactionInput) => {
    log.debug('[IPC] localFirst:bank:create');
    return localFirstOps.createBankTransactionLocalFirst(input);
  });

  // Update Bank transaction (local-first)
  ipcMain.handle('localFirst:bank:update', (_event, id: string, input: localFirstOps.UpdateBankTransactionInput, updatedBy: string) => {
    log.debug(`[IPC] localFirst:bank:update - ${id}`);
    return localFirstOps.updateBankTransactionLocalFirst(id, input, updatedBy);
  });

  // Delete Bank transaction (local-first, soft delete)
  ipcMain.handle('localFirst:bank:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:bank:delete - ${id}`);
    return localFirstOps.deleteBankTransactionLocalFirst(id);
  });

  // Create Gudang transaction (local-first)
  ipcMain.handle('localFirst:gudang:create', (_event, input: localFirstOps.CreateGudangTransactionInput) => {
    log.debug('[IPC] localFirst:gudang:create');
    return localFirstOps.createGudangTransactionLocalFirst(input);
  });

  // Update Gudang transaction (local-first)
  ipcMain.handle('localFirst:gudang:update', (_event, id: string, input: localFirstOps.UpdateGudangTransactionInput, updatedBy: string) => {
    log.debug(`[IPC] localFirst:gudang:update - ${id}`);
    return localFirstOps.updateGudangTransactionLocalFirst(id, input, updatedBy);
  });

  // Delete Gudang transaction (local-first, soft delete)
  ipcMain.handle('localFirst:gudang:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:gudang:delete - ${id}`);
    return localFirstOps.deleteGudangTransactionLocalFirst(id);
  });

  // Create COA (local-first)
  ipcMain.handle('localFirst:coa:create', (_event, kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) => {
    log.debug(`[IPC] localFirst:coa:create - ${kode}`);
    return localFirstOps.createCOALocalFirst(kode, nama, tipe, parentId, statusAktif);
  });

  // Update COA (local-first)
  ipcMain.handle('localFirst:coa:update', (_event, id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) => {
    log.debug(`[IPC] localFirst:coa:update - ${id}`);
    return localFirstOps.updateCOALocalFirst(id, nama, tipe, parentId, statusAktif);
  });

  // Delete COA (local-first, soft delete)
  ipcMain.handle('localFirst:coa:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:coa:delete - ${id}`);
    return localFirstOps.deleteCOALocalFirst(id);
  });

  // Create Blok (local-first)
  ipcMain.handle('localFirst:blok:create', (_event, kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) => {
    log.debug(`[IPC] localFirst:blok:create - ${kodeBlok}`);
    return localFirstOps.createBlokLocalFirst(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
  });

  // Update Blok (local-first)
  ipcMain.handle('localFirst:blok:update', (_event, id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) => {
    log.debug(`[IPC] localFirst:blok:update - ${id}`);
    return localFirstOps.updateBlokLocalFirst(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
  });

  // Delete Blok (local-first, soft delete)
  ipcMain.handle('localFirst:blok:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:blok:delete - ${id}`);
    return localFirstOps.deleteBlokLocalFirst(id);
  });

  // ============ Aspek Kerja Local-First IPC Handlers ============

  // Create Aspek Kerja (local-first)
  ipcMain.handle('localFirst:aspekKerja:create', (_event, kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) => {
    log.debug(`[IPC] localFirst:aspekKerja:create - ${kode}`);
    return localFirstOps.createAspekKerjaLocalFirst(kode, nama, coaId, jenis, statusAktif);
  });

  // Update Aspek Kerja (local-first)
  ipcMain.handle('localFirst:aspekKerja:update', (_event, id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) => {
    log.debug(`[IPC] localFirst:aspekKerja:update - ${id}`);
    return localFirstOps.updateAspekKerjaLocalFirst(id, nama, coaId, jenis, statusAktif);
  });

  // Delete Aspek Kerja (local-first, soft delete)
  ipcMain.handle('localFirst:aspekKerja:delete', (_event, id: string) => {
    log.debug(`[IPC] localFirst:aspekKerja:delete - ${id}`);
    return localFirstOps.deleteAspekKerjaLocalFirst(id);
  });

  // ============ Sync Detection IPC Handlers ============
  
  // Detect local changes (push direction)
  ipcMain.handle('syncDetection:detectLocalChanges', () => {
    log.debug('[IPC] syncDetection:detectLocalChanges');
    return syncDetection.detectLocalChanges();
  });

  // Detect local changes for specific module
  ipcMain.handle('syncDetection:detectLocalChangesForModule', (_event, module: string) => {
    log.debug(`[IPC] syncDetection:detectLocalChangesForModule - ${module}`);
    return syncDetection.detectLocalChangesForModule(module as 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok');
  });

  // Detect remote changes (pull direction) - requires config
  ipcMain.handle('syncDetection:detectRemoteChanges', async (_event, module: string, lastSyncTimestamp: string | null, config: syncDetection.RemoteDetectionConfig) => {
    log.debug(`[IPC] syncDetection:detectRemoteChanges - ${module}`);
    return await syncDetection.detectRemoteChanges(module as 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok', lastSyncTimestamp, config);
  });

  // Get comprehensive sync status
  ipcMain.handle('syncDetection:getStatus', () => {
    log.debug('[IPC] syncDetection:getStatus');
    return syncDetection.getSyncDetectionStatus();
  });

  // Quick check for pending local changes
  ipcMain.handle('syncDetection:hasPendingChanges', () => {
    log.debug('[IPC] syncDetection:hasPendingChanges');
    return syncDetection.hasPendingLocalChanges();
  });

  // Quick check for specific module
  ipcMain.handle('syncDetection:hasPendingChangesForModule', (_event, module: string) => {
    log.debug(`[IPC] syncDetection:hasPendingChangesForModule - ${module}`);
    return syncDetection.hasPendingLocalChangesForModule(module as 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok');
  });

  // Get total pending count
  ipcMain.handle('syncDetection:getTotalPendingCount', () => {
    log.debug('[IPC] syncDetection:getTotalPendingCount');
    return syncDetection.getTotalPendingChangesCount();
  });

  // Estimate sync time
  ipcMain.handle('syncDetection:estimateSyncTime', () => {
    log.debug('[IPC] syncDetection:estimateSyncTime');
    return syncDetection.estimateSyncTime();
  });

  // Record sync result
  ipcMain.handle('syncDetection:recordSyncResult', (_event, result: syncDetection.SyncResult) => {
    log.debug(`[IPC] syncDetection:recordSyncResult - ${result.direction} for ${result.module}`);
    return syncDetection.recordSyncResult(result);
  });

  // ============ Auto-Sync Timer IPC Handlers ============

  // Get auto-sync timer status
  ipcMain.handle('autoSyncTimer:getStatus', () => {
    log.debug('[IPC] autoSyncTimer:getStatus');
    return autoSyncTimer.getStatus();
  });

  // Get auto-sync timer configuration
  ipcMain.handle('autoSyncTimer:getConfig', () => {
    log.debug('[IPC] autoSyncTimer:getConfig');
    return autoSyncTimer.getConfig();
  });

  // Set auto-sync timer configuration
  ipcMain.handle('autoSyncTimer:setConfig', (_event, config: Partial<autoSyncTimer.AutoSyncTimerConfig>) => {
    log.debug('[IPC] autoSyncTimer:setConfig');
    autoSyncTimer.setConfig(config);
    return { success: true, config: autoSyncTimer.getConfig() };
  });

  // Start auto-sync timer
  ipcMain.handle('autoSyncTimer:start', () => {
    log.debug('[IPC] autoSyncTimer:start');
    autoSyncTimer.startTimer();
    return { success: true, status: autoSyncTimer.getStatus() };
  });

  // Stop auto-sync timer
  ipcMain.handle('autoSyncTimer:stop', () => {
    log.debug('[IPC] autoSyncTimer:stop');
    autoSyncTimer.stopTimer();
    return { success: true, status: autoSyncTimer.getStatus() };
  });

  // Pause auto-sync timer
  ipcMain.handle('autoSyncTimer:pause', () => {
    log.debug('[IPC] autoSyncTimer:pause');
    autoSyncTimer.pauseTimer();
    return { success: true, status: autoSyncTimer.getStatus() };
  });

  // Resume auto-sync timer
  ipcMain.handle('autoSyncTimer:resume', () => {
    log.debug('[IPC] autoSyncTimer:resume');
    autoSyncTimer.resumeTimer();
    return { success: true, status: autoSyncTimer.getStatus() };
  });

  // Reset auto-sync timer
  ipcMain.handle('autoSyncTimer:reset', () => {
    log.debug('[IPC] autoSyncTimer:reset');
    autoSyncTimer.resetTimer();
    return { success: true, status: autoSyncTimer.getStatus() };
  });

  // Trigger manual sync
  ipcMain.handle('autoSyncTimer:manualSync', async () => {
    log.debug('[IPC] autoSyncTimer:manualSync');
    return await autoSyncTimer.triggerManualSync();
  });

  log.info('[IPC] Auto-sync timer IPC handlers ready');

  // ============ Network Status IPC Handlers ============

  // Get current network status
  ipcMain.handle('networkStatus:getStatus', () => {
    log.debug('[IPC] networkStatus:getStatus');
    return networkStatus.getStatus();
  });

  // Check network connectivity now
  ipcMain.handle('networkStatus:checkNow', async () => {
    log.debug('[IPC] networkStatus:checkNow');
    return await networkStatus.checkNow();
  });

  // Get connection quality
  ipcMain.handle('networkStatus:getConnectionQuality', () => {
    log.debug('[IPC] networkStatus:getConnectionQuality');
    return {
      quality: networkStatus.getConnectionQuality(),
      stability: networkStatus.getConnectionStability(),
      history: networkStatus.getConnectionHistory(),
    };
  });

  // Check for captive portal
  ipcMain.handle('networkStatus:checkCaptivePortal', async () => {
    log.debug('[IPC] networkStatus:checkCaptivePortal');
    const isCaptive = await networkStatus.checkForCaptivePortal();
    return { isCaptivePortal: isCaptive };
  });

  // Check if online
  ipcMain.handle('networkStatus:isOnline', () => {
    log.debug('[IPC] networkStatus:isOnline');
    return { isOnline: networkStatus.isOnline() };
  });

  // Set network status configuration
  ipcMain.handle('networkStatus:setConfig', (_event, config: Partial<networkStatus.NetworkStatusConfig>) => {
    log.debug('[IPC] networkStatus:setConfig');
    networkStatus.setConfig(config);
    return { success: true, config: networkStatus.getStatus() };
  });

  log.info('[IPC] Network status IPC handlers ready');

  log.info('[IPC] Local-first operations IPC handlers ready');

  // ============ Dashboard Approval IPC Handlers ============

  // Get all pending approvals from all modules
  ipcMain.handle('dashboard:getPendingApprovals', async (_event, filters?: {
    module?: 'kas' | 'bank' | 'gudang';
    status?: string;
    searchTerm?: string;
  }) => {
    log.debug('[IPC] dashboard:getPendingApprovals');
    try {
      const approvals = await dashboardApproval.getPendingApprovals(filters);
      return { success: true, approvals };
    } catch (error) {
      log.error('[IPC] dashboard:getPendingApprovals error:', error);
      return { success: false, message: 'Failed to get pending approvals' };
    }
  });

  // Get approval counts for summary cards
  ipcMain.handle('dashboard:getApprovalCounts', async () => {
    log.debug('[IPC] dashboard:getApprovalCounts');
    try {
      const counts = await dashboardApproval.getApprovalCounts();
      return { success: true, counts };
    } catch (error) {
      log.error('[IPC] dashboard:getApprovalCounts error:', error);
      return { success: false, message: 'Failed to get approval counts' };
    }
  });

  // Approve transaction from dashboard
  ipcMain.handle('dashboard:approve', async (_event, module: 'kas' | 'bank' | 'gudang', transactionId: string, input: { approver_id: string; approver_name: string }) => {
    log.debug(`[IPC] dashboard:approve - ${module}/${transactionId}`);
    try {
      const result = await dashboardApproval.approveFromDashboard(module, transactionId, input);
      return result;
    } catch (error) {
      log.error('[IPC] dashboard:approve error:', error);
      return { success: false, message: 'Failed to approve transaction' };
    }
  });

  // Reject transaction from dashboard
  ipcMain.handle('dashboard:reject', async (_event, module: 'kas' | 'bank' | 'gudang', transactionId: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) => {
    log.debug(`[IPC] dashboard:reject - ${module}/${transactionId}`);
    try {
      const result = await dashboardApproval.rejectFromDashboard(module, transactionId, input);
      return result;
    } catch (error) {
      log.error('[IPC] dashboard:reject error:', error);
      return { success: false, message: 'Failed to reject transaction' };
    }
  });

  // Get transaction details from dashboard
  ipcMain.handle('dashboard:getTransaction', async (_event, module: 'kas' | 'bank' | 'gudang', transactionId: string) => {
    log.debug(`[IPC] dashboard:getTransaction - ${module}/${transactionId}`);
    try {
      const transaction = await dashboardApproval.getTransactionFromDashboard(module, transactionId);
      return { success: true, transaction };
    } catch (error) {
      log.error('[IPC] dashboard:getTransaction error:', error);
      return { success: false, message: 'Failed to get transaction' };
    }
  });

  // Get approval history for a transaction
  ipcMain.handle('dashboard:getApprovalHistory', async (_event, module: 'kas' | 'bank' | 'gudang', transactionId: string) => {
    log.debug(`[IPC] dashboard:getApprovalHistory - ${module}/${transactionId}`);
    try {
      const history = await dashboardApproval.getApprovalHistoryFromDashboard(module, transactionId);
      return { success: true, history };
    } catch (error) {
      log.error('[IPC] dashboard:getApprovalHistory error:', error);
      return { success: false, message: 'Failed to get approval history' };
    }
  });

  log.info('[IPC] Dashboard approval IPC handlers ready');
}

// Enable remote debugging for agent-browser
app.commandLine.appendSwitch('remote-debugging-port', '9222');

// App lifecycle
app.whenReady().then(async () => {
  log.info('[App] App is ready');

  // Initialize Local Database Manager first (connection pooling, schema mirroring)
  try {
    await localDbMgr.localDatabaseManager.initialize();
    log.info('[App] Local Database Manager initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Local Database Manager:', error);
  }

  // Initialize all local databases (master + sync + current period transactions)
  try {
    await localDbMgr.localDatabaseManager.initAllDatabases();
    log.info('[App] All local databases initialized');
  } catch (error) {
    log.error('[App] Failed to initialize all local databases:', error);
  }

  // Initialize user database
  try {
    await userDb.initUserDatabase();
    log.info('[App] User database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize user database:', error);
  }

  // Initialize COA database
  try {
    await coaDb.initCOADatabase();
    log.info('[App] COA database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize COA database:', error);
  }

  // Initialize Blok database
  try {
    await blokDb.initBlokDatabase();
    log.info('[App] Blok database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Blok database:', error);
  }

  // Initialize Kas database
  try {
    await kasDb.initKasDatabase();
    log.info('[App] Kas database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Kas database:', error);
  }

  // Initialize Bank database
  try {
    await bankDb.initBankDatabase();
    log.info('[App] Bank database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Bank database:', error);
  }

  // Initialize Gudang database
  try {
    await gudangDb.initGudangDatabase();
    log.info('[App] Gudang database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Gudang database:', error);
  }

  // Initialize Sync database
  try {
    await syncDb.initSyncDatabase();
    log.info('[App] Sync database initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Sync database:', error);
  }

  // Initialize Auto-Sync Timer
  try {
    autoSyncTimer.initAutoSyncTimer();
    log.info('[App] Auto-sync timer initialized');
  } catch (error) {
    log.error('[App] Failed to initialize Auto-sync timer:', error);
  }

  setupIpcHandlers();
  createWindow();
  startSocketServer(socketServerPort);

  // Cleanup expired sessions periodically (every 5 minutes)
  setInterval(() => {
    userDb.cleanupExpiredSessions();
  }, 5 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log.info('[App] All windows closed');
  stopSocketServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('[App] Application quitting...');
  stopSocketServer();
  // Destroy auto-sync timer
  autoSyncTimer.destroy();
  // Close all database connections
  localDbMgr.localDatabaseManager.closeAll();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error(`[Error] Uncaught exception: ${error.message}`);
  log.error(error.stack || 'No stack trace');
});

process.on('unhandledRejection', (reason) => {
  log.error(`[Error] Unhandled rejection: ${reason}`);
});

log.info('[Main] Main process initialization complete');
