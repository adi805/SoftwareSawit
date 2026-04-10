"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_log_1 = __importDefault(require("electron-log"));
const XLSX = __importStar(require("xlsx"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const userDb = __importStar(require("./userDatabase"));
const coaDb = __importStar(require("./coaDatabase"));
const blokDb = __importStar(require("./blokDatabase"));
const kasDb = __importStar(require("./kasDatabase"));
const bankDb = __importStar(require("./bankDatabase"));
const gudangDb = __importStar(require("./gudangDatabase"));
const syncDb = __importStar(require("./syncDatabase"));
const syncDetection = __importStar(require("./syncDetection"));
const localDbMgr = __importStar(require("./localDatabaseManager"));
const localFirstOps = __importStar(require("./localFirstOperations"));
const batchSync = __importStar(require("./batchSyncService"));
const autoSyncTimer = __importStar(require("./autoSyncTimer"));
// Configure logging
try {
    electron_log_1.default.transports.file.level = 'debug';
    electron_log_1.default.transports.console.level = 'debug'; // Changed to debug for easier debugging
    electron_log_1.default.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
    electron_log_1.default.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    electron_log_1.default.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
}
catch (e) {
    // Prevent EPIPE crashes during logging setup
}
// Log application start
electron_log_1.default.info('=== SoftwareSawit Application Starting ===');
electron_log_1.default.info(`App version: ${electron_1.app.getVersion()}`);
electron_log_1.default.info(`Electron version: ${process.versions.electron}`);
electron_log_1.default.info(`Node version: ${process.versions.node}`);
electron_log_1.default.info(`Platform: ${process.platform}`);
// Global references
let mainWindow = null;
let socketServer = null;
let socketServerPort = 9222;
let isAdminMode = false;
// Socket server for debugging
function startSocketServer(port = 9222) {
    try {
        const httpServer = (0, http_1.createServer)();
        socketServer = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });
        socketServer.on('connection', (socket) => {
            electron_log_1.default.info(`[Socket] Client connected: ${socket.id}`);
            // Send current logs to new client
            socket.emit('logs', electron_log_1.default.transports.file.getFile().path);
            socket.on('disconnect', () => {
                electron_log_1.default.info(`[Socket] Client disconnected: ${socket.id}`);
            });
            socket.on('get-logs', () => {
                // Client requested logs
                socket.emit('log-request', 'Logs requested');
            });
        });
        httpServer.listen(port, () => {
            socketServerPort = port;
            electron_log_1.default.info(`[Socket] Debugging server started on port ${port}`);
        });
        httpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                electron_log_1.default.warn(`[Socket] Port ${port} is in use, trying ${port + 1}`);
                startSocketServer(port + 1);
            }
            else {
                electron_log_1.default.error(`[Socket] Server error: ${err.message}`);
            }
        });
    }
    catch (error) {
        electron_log_1.default.error(`[Socket] Failed to start server: ${error}`);
    }
}
function stopSocketServer() {
    if (socketServer) {
        socketServer.close();
        socketServer = null;
        electron_log_1.default.info('[Socket] Debugging server stopped');
    }
}
function createWindow() {
    electron_log_1.default.info('[Window] Creating main window...');
    mainWindow = new electron_1.BrowserWindow({
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
        electron_log_1.default.info('[Window] Window ready to show');
        mainWindow?.show();
    });
    // Set main window reference for auto-sync timer
    autoSyncTimer.setMainWindow(mainWindow);
    // Handle window closed
    mainWindow.on('closed', () => {
        electron_log_1.default.info('[Window] Main window closed');
        mainWindow = null;
    });
    // Create application menu
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Exit',
                    accelerator: 'Alt+F4',
                    click: () => electron_1.app.quit(),
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
                        electron_1.dialog.showMessageBox({
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
    const menu = electron_1.Menu.buildFromTemplate(menuTemplate);
    electron_1.Menu.setApplicationMenu(menu);
    // Determine which app to load
    const isUserMgmt = process.argv.includes('--user-mgmt');
    const htmlFile = isUserMgmt ? 'user-mgmt.html' : 'index.html';
    const windowTitle = isUserMgmt ? 'SoftwareSawit - User Management' : 'SoftwareSawit';
    // Update window title
    mainWindow.setTitle(windowTitle);
    // Load the app
    if (process.argv.includes('--dev')) {
        electron_log_1.default.info(`[Window] Loading development server... (${isUserMgmt ? 'User Management' : 'Main App'})`);
        // In dev mode, use query param since vite serves index.html as root
        const url = isUserMgmt
            ? 'http://localhost:5173/?app=user-mgmt'
            : 'http://localhost:5173/';
        mainWindow.loadURL(url);
        mainWindow.webContents.openDevTools();
    }
    else {
        electron_log_1.default.info(`[Window] Loading production build... (${isUserMgmt ? 'User Management' : 'Main App'})`);
        mainWindow.loadFile(path.join(__dirname, `../renderer/${htmlFile}`));
    }
    // Log web contents events
    mainWindow.webContents.on('did-finish-load', () => {
        electron_log_1.default.info('[Window] Content finished loading');
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        electron_log_1.default.error(`[Window] Failed to load: ${errorCode} - ${errorDescription}`);
    });
}
// IPC Handlers
function setupIpcHandlers() {
    electron_log_1.default.info('[IPC] Setting up IPC handlers...');
    // Get app info
    electron_1.ipcMain.handle('app:getInfo', () => {
        return {
            version: electron_1.app.getVersion(),
            electron: process.versions.electron,
            node: process.versions.node,
            platform: process.platform,
            socketPort: socketServerPort,
        };
    });
    // Get user data path
    electron_1.ipcMain.handle('app:getDataPath', () => {
        return electron_1.app.getPath('userData');
    });
    // ============ Local Database Manager IPC Handlers ============
    // Get database manager stats
    electron_1.ipcMain.handle('db:getStats', () => {
        electron_log_1.default.debug('[IPC] db:getStats');
        try {
            const stats = localDbMgr.localDatabaseManager.getStats();
            return { success: true, stats };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] db:getStats error:', error);
            return { success: false, message: 'Failed to get database stats' };
        }
    });
    // Initialize all local databases
    electron_1.ipcMain.handle('db:initAll', async () => {
        electron_log_1.default.debug('[IPC] db:initAll');
        try {
            await localDbMgr.localDatabaseManager.initAllDatabases();
            return { success: true, message: 'All databases initialized' };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] db:initAll error:', error);
            return { success: false, message: 'Failed to initialize databases' };
        }
    });
    // Get transaction database path
    electron_1.ipcMain.handle('db:getTransactionPath', (_event, module, year, month) => {
        electron_log_1.default.debug(`[IPC] db:getTransactionPath - ${module}/${year}/${month}`);
        try {
            const dbPath = localDbMgr.localDatabaseManager.getTransactionDatabasePath(module, year, month);
            return { success: true, path: dbPath };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] db:getTransactionPath error:', error);
            return { success: false, message: 'Failed to get transaction database path' };
        }
    });
    // Get existing periods for a module
    electron_1.ipcMain.handle('db:getExistingPeriods', (_event, module) => {
        electron_log_1.default.debug(`[IPC] db:getExistingPeriods - ${module}`);
        try {
            const periods = localDbMgr.localDatabaseManager.getExistingPeriods(module);
            return { success: true, periods };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] db:getExistingPeriods error:', error);
            return { success: false, message: 'Failed to get existing periods' };
        }
    });
    electron_log_1.default.info('[IPC] Database Manager IPC handlers ready');
    // DevTools toggle (admin only)
    electron_1.ipcMain.handle('dev:toggleDevTools', () => {
        if (isAdminMode && mainWindow) {
            mainWindow.webContents.toggleDevTools();
            electron_log_1.default.info('[DevTools] Toggled via IPC');
            return true;
        }
        electron_log_1.default.warn('[DevTools] Toggle denied - not in admin mode');
        return false;
    });
    // Set admin mode
    electron_1.ipcMain.handle('app:setAdminMode', (_event, enabled) => {
        isAdminMode = enabled;
        electron_log_1.default.info(`[App] Admin mode: ${enabled}`);
        return true;
    });
    // Get admin mode status
    electron_1.ipcMain.handle('app:getAdminMode', () => {
        return isAdminMode;
    });
    // Socket server control
    electron_1.ipcMain.handle('socket:toggle', () => {
        if (socketServer) {
            stopSocketServer();
            return false;
        }
        else {
            startSocketServer(socketServerPort);
            return true;
        }
    });
    electron_1.ipcMain.handle('socket:getStatus', () => {
        return {
            running: socketServer !== null,
            port: socketServerPort,
        };
    });
    // Logging
    electron_1.ipcMain.handle('log:getEntries', () => {
        // Return recent log entries for display
        return [];
    });
    // ============ User Management IPC Handlers ============
    // Get all users
    electron_1.ipcMain.handle('user:getAll', () => {
        electron_log_1.default.debug('[IPC] user:getAll');
        return userDb.getAllUsers();
    });
    // Get user by ID
    electron_1.ipcMain.handle('user:getById', (_event, userId) => {
        electron_log_1.default.debug(`[IPC] user:getById - ${userId}`);
        return userDb.getUserById(userId);
    });
    // Get roles
    electron_1.ipcMain.handle('user:getRoles', () => {
        electron_log_1.default.debug('[IPC] user:getRoles');
        return userDb.getRoles();
    });
    // Create user
    electron_1.ipcMain.handle('user:create', async (_event, username, password, fullName, role) => {
        electron_log_1.default.debug(`[IPC] user:create - ${username}`);
        return await userDb.createUser(username, password, fullName, role);
    });
    // Update user
    electron_1.ipcMain.handle('user:update', (_event, userId, fullName, role) => {
        electron_log_1.default.debug(`[IPC] user:update - ${userId}`);
        return userDb.updateUser(userId, fullName, role);
    });
    // Delete user
    electron_1.ipcMain.handle('user:delete', (_event, userId, requestingUserId) => {
        electron_log_1.default.debug(`[IPC] user:delete - ${userId}`);
        return userDb.deleteUser(userId, requestingUserId);
    });
    // Clear all non-admin users (admin only)
    electron_1.ipcMain.handle('user:clearAll', () => {
        electron_log_1.default.debug('[IPC] user:clearAll');
        return userDb.clearAllUsers();
    });
    // Login
    electron_1.ipcMain.handle('user:login', async (_event, username, password) => {
        electron_log_1.default.info(`[IPC] user:login attempt for: ${username}`);
        try {
            const result = await userDb.login(username, password);
            electron_log_1.default.info(`[IPC] user:login result: ${JSON.stringify(result)}`);
            return result;
        }
        catch (error) {
            electron_log_1.default.error(`[IPC] user:login error: ${error}`);
            return { success: false, message: `Login error: ${error}` };
        }
    });
    // Logout
    electron_1.ipcMain.handle('user:logout', (_event, token, userId) => {
        electron_log_1.default.debug(`[IPC] user:logout`);
        return userDb.logout(token, userId);
    });
    // Validate session
    electron_1.ipcMain.handle('user:validateSession', (_event, token) => {
        electron_log_1.default.debug('[IPC] user:validateSession');
        return userDb.validateSession(token);
    });
    // Refresh session
    electron_1.ipcMain.handle('user:refreshSession', (_event, token) => {
        electron_log_1.default.debug('[IPC] user:refreshSession');
        return userDb.refreshSession(token);
    });
    // Get active sessions
    electron_1.ipcMain.handle('user:getActiveSessions', () => {
        electron_log_1.default.debug('[IPC] user:getActiveSessions');
        return userDb.getActiveSessions();
    });
    // Terminate session
    electron_1.ipcMain.handle('user:terminateSession', (_event, sessionId) => {
        electron_log_1.default.debug(`[IPC] user:terminateSession - ${sessionId}`);
        return userDb.terminateSession(sessionId);
    });
    // Get activity log
    electron_1.ipcMain.handle('user:getActivityLog', (_event, userId, limit) => {
        electron_log_1.default.debug('[IPC] user:getActivityLog');
        return userDb.getActivityLog(userId, limit);
    });
    // Change password
    electron_1.ipcMain.handle('user:changePassword', async (_event, userId, oldPassword, newPassword) => {
        electron_log_1.default.debug(`[IPC] user:changePassword - ${userId}`);
        return await userDb.changePassword(userId, oldPassword, newPassword);
    });
    // Admin reset password
    electron_1.ipcMain.handle('user:adminResetPassword', async (_event, adminId, targetUserId, newPassword) => {
        electron_log_1.default.debug(`[IPC] user:adminResetPassword - ${adminId} -> ${targetUserId}`);
        return await userDb.adminResetPassword(adminId, targetUserId, newPassword);
    });
    // Validate password strength
    electron_1.ipcMain.handle('user:validatePassword', (_event, password) => {
        electron_log_1.default.debug('[IPC] user:validatePassword');
        return userDb.validatePasswordStrength(password);
    });
    electron_log_1.default.info('[IPC] User management IPC handlers ready');
    // ============ COA IPC Handlers ============
    // Get all COA
    electron_1.ipcMain.handle('coa:getAll', () => {
        electron_log_1.default.debug('[IPC] coa:getAll');
        return coaDb.getAllCOA();
    });
    // Get COA by ID
    electron_1.ipcMain.handle('coa:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] coa:getById - ${id}`);
        return coaDb.getCOAById(id);
    });
    // Get COA by Kode
    electron_1.ipcMain.handle('coa:getByKode', (_event, kode) => {
        electron_log_1.default.debug(`[IPC] coa:getByKode - ${kode}`);
        return coaDb.getCOAByKode(kode);
    });
    // Create COA
    electron_1.ipcMain.handle('coa:create', (_event, kode, nama, tipe, parentId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] coa:create - ${kode}`);
        return coaDb.createCOA(kode, nama, tipe, parentId, statusAktif);
    });
    // Update COA
    electron_1.ipcMain.handle('coa:update', (_event, id, nama, tipe, parentId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] coa:update - ${id}`);
        return coaDb.updateCOA(id, nama, tipe, parentId, statusAktif);
    });
    // Delete COA
    electron_1.ipcMain.handle('coa:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] coa:delete - ${id}`);
        return coaDb.deleteCOA(id);
    });
    // Delete COA with cascade (including linked aspek kerja)
    electron_1.ipcMain.handle('coa:deleteWithAspekKerja', (_event, id) => {
        electron_log_1.default.debug(`[IPC] coa:deleteWithAspekKerja - ${id}`);
        return coaDb.deleteCOAWithAspekKerja(id);
    });
    // Clear all COA data (admin only)
    electron_1.ipcMain.handle('coa:clearAll', () => {
        electron_log_1.default.debug('[IPC] coa:clearAll');
        return coaDb.clearAllCOA();
    });
    // Clear all Aspek Kerja data (admin only)
    electron_1.ipcMain.handle('aspekKerja:clearAll', () => {
        electron_log_1.default.debug('[IPC] aspekKerja:clearAll');
        return coaDb.clearAllAspekKerja();
    });
    // Search COA
    electron_1.ipcMain.handle('coa:search', (_event, searchTerm, tipe, statusAktif) => {
        electron_log_1.default.debug(`[IPC] coa:search - ${searchTerm}`);
        return coaDb.searchCOA(searchTerm, tipe, statusAktif);
    });
    // Get COA by parent
    electron_1.ipcMain.handle('coa:getByParent', (_event, parentId) => {
        electron_log_1.default.debug(`[IPC] coa:getByParent - ${parentId}`);
        return coaDb.getCOAByParent(parentId);
    });
    // Get COA with pagination
    electron_1.ipcMain.handle('coa:getWithPagination', (_event, page, pageSize, searchTerm, tipe, statusAktif) => {
        electron_log_1.default.debug(`[IPC] coa:getWithPagination - page ${page}`);
        return coaDb.getCOAWithPagination(page, pageSize, searchTerm, tipe, statusAktif);
    });
    // Get tipe options
    electron_1.ipcMain.handle('coa:getTipeOptions', () => {
        electron_log_1.default.debug('[IPC] coa:getTipeOptions');
        return coaDb.getTipeOptions();
    });
    // Get aspek kerja count by COA
    electron_1.ipcMain.handle('coa:getAspekKerjaCount', (_event, coaId) => {
        electron_log_1.default.debug(`[IPC] coa:getAspekKerjaCount - ${coaId}`);
        return coaDb.getAspekKerjaCountByCOA(coaId);
    });
    // Check COA transaction references (Kas, Bank, Gudang)
    electron_1.ipcMain.handle('coa:getTransactionRefs', (_event, id) => {
        electron_log_1.default.debug(`[IPC] coa:getTransactionRefs - ${id}`);
        return coaDb.checkCOAInTransactions(id);
    });
    // Check Aspek Kerja transaction references (Kas, Bank, Gudang)
    electron_1.ipcMain.handle('aspekKerja:getTransactionRefs', (_event, id) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:getTransactionRefs - ${id}`);
        return coaDb.checkAspekKerjaInTransactions(id);
    });
    electron_log_1.default.info('[IPC] COA IPC handlers ready');
    // ============ Aspek Kerja IPC Handlers ============
    // Get all Aspek Kerja
    electron_1.ipcMain.handle('aspekKerja:getAll', () => {
        electron_log_1.default.debug('[IPC] aspekKerja:getAll');
        return coaDb.getAllAspekKerja();
    });
    // Get Aspek Kerja by ID
    electron_1.ipcMain.handle('aspekKerja:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:getById - ${id}`);
        return coaDb.getAspekKerjaById(id);
    });
    // Get Aspek Kerja by Kode
    electron_1.ipcMain.handle('aspekKerja:getByKode', (_event, kode) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:getByKode - ${kode}`);
        return coaDb.getAspekKerjaByKode(kode);
    });
    // Create Aspek Kerja
    electron_1.ipcMain.handle('aspekKerja:create', (_event, kode, nama, coaId, jenis, statusAktif) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:create - ${kode}`);
        return coaDb.createAspekKerja(kode, nama, coaId, jenis, statusAktif);
    });
    // Update Aspek Kerja
    electron_1.ipcMain.handle('aspekKerja:update', (_event, id, nama, coaId, jenis, statusAktif) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:update - ${id}`);
        return coaDb.updateAspekKerja(id, nama, coaId, jenis, statusAktif);
    });
    // Delete Aspek Kerja
    electron_1.ipcMain.handle('aspekKerja:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:delete - ${id}`);
        return coaDb.deleteAspekKerja(id);
    });
    // Search Aspek Kerja
    electron_1.ipcMain.handle('aspekKerja:search', (_event, searchTerm, jenis, coaId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:search - ${searchTerm}`);
        return coaDb.searchAspekKerja(searchTerm, jenis, coaId, statusAktif);
    });
    // Get Aspek Kerja with pagination
    electron_1.ipcMain.handle('aspekKerja:getWithPagination', (_event, page, pageSize, searchTerm, jenis, coaId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:getWithPagination - page ${page}`);
        return coaDb.getAspekKerjaWithPagination(page, pageSize, searchTerm, jenis, coaId, statusAktif);
    });
    // Get active COA for dropdown
    electron_1.ipcMain.handle('aspekKerja:getActiveCOA', () => {
        electron_log_1.default.debug('[IPC] aspekKerja:getActiveCOA');
        return coaDb.getActiveCOA();
    });
    electron_log_1.default.info('[IPC] Aspek Kerja IPC handlers ready');
    // ============ Blok IPC Handlers ============
    // Get all Blok
    electron_1.ipcMain.handle('blok:getAll', () => {
        electron_log_1.default.debug('[IPC] blok:getAll');
        return blokDb.getAllBlok();
    });
    // Get Blok by ID
    electron_1.ipcMain.handle('blok:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] blok:getById - ${id}`);
        return blokDb.getBlokById(id);
    });
    // Get Blok by Kode
    electron_1.ipcMain.handle('blok:getByKode', (_event, kodeBlok) => {
        electron_log_1.default.debug(`[IPC] blok:getByKode - ${kodeBlok}`);
        return blokDb.getBlokByKode(kodeBlok);
    });
    // Create Blok
    electron_1.ipcMain.handle('blok:create', (_event, kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => {
        electron_log_1.default.debug(`[IPC] blok:create - ${kodeBlok}`);
        return blokDb.createBlok(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
    });
    // Update Blok
    electron_1.ipcMain.handle('blok:update', (_event, id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => {
        electron_log_1.default.debug(`[IPC] blok:update - ${id}`);
        return blokDb.updateBlok(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
    });
    // Delete Blok
    electron_1.ipcMain.handle('blok:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] blok:delete - ${id}`);
        return blokDb.deleteBlok(id);
    });
    // Clear all Blok data (admin only)
    electron_1.ipcMain.handle('blok:clearAll', () => {
        electron_log_1.default.debug('[IPC] blok:clearAll');
        return blokDb.clearAllBlok();
    });
    // Check Blok transaction references (Kas, Bank, Gudang)
    electron_1.ipcMain.handle('blok:getTransactionRefs', (_event, id) => {
        electron_log_1.default.debug(`[IPC] blok:getTransactionRefs - ${id}`);
        return blokDb.checkBlokInTransactions(id);
    });
    // Search Blok
    electron_1.ipcMain.handle('blok:search', (_event, searchTerm, tahunTanam, status) => {
        electron_log_1.default.debug(`[IPC] blok:search - ${searchTerm}`);
        return blokDb.searchBlok(searchTerm, tahunTanam, status);
    });
    // Get Blok with pagination
    electron_1.ipcMain.handle('blok:getWithPagination', (_event, page, pageSize, searchTerm, tahunTanam, status) => {
        electron_log_1.default.debug(`[IPC] blok:getWithPagination - page ${page}`);
        return blokDb.getBlokWithPagination(page, pageSize, searchTerm, tahunTanam, status);
    });
    // Get status options
    electron_1.ipcMain.handle('blok:getStatusOptions', () => {
        electron_log_1.default.debug('[IPC] blok:getStatusOptions');
        return blokDb.getStatusOptions();
    });
    // Get available years for filter
    electron_1.ipcMain.handle('blok:getAvailableYears', () => {
        electron_log_1.default.debug('[IPC] blok:getAvailableYears');
        return blokDb.getAvailableYears();
    });
    electron_log_1.default.info('[IPC] Blok IPC handlers ready');
    // ============ Dialog IPC Handlers ============
    // Show save dialog
    electron_1.ipcMain.handle('dialog:showSave', async (_event, defaultName) => {
        electron_log_1.default.debug(`[IPC] dialog:showSave - ${defaultName}`);
        const result = await electron_1.dialog.showSaveDialog(mainWindow, {
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
    electron_1.ipcMain.handle('dialog:showOpen', async (_event, title) => {
        electron_log_1.default.debug(`[IPC] dialog:showOpen - ${title}`);
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
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
    electron_log_1.default.info('[IPC] Dialog IPC handlers ready');
    // ============ Excel Read IPC Handler ============
    // Read Excel file via main process (more reliable than renderer)
    electron_1.ipcMain.handle('excel:readFile', async (_event, filePath) => {
        electron_log_1.default.debug(`[IPC] excel:readFile - ${filePath}`);
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
            electron_log_1.default.info(`[IPC] excel:readFile - Success, ${jsonData.length} rows`);
            return { success: true, data: jsonData, sheetName };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            electron_log_1.default.error(`[IPC] excel:readFile - Error: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    });
    // ============ Import IPC Handlers ============
    // Import COA batch
    electron_1.ipcMain.handle('coa:importBatch', (_event, data) => {
        electron_log_1.default.debug(`[IPC] coa:importBatch - ${data.length} rows`);
        return coaDb.importCOABatch(data);
    });
    // Get existing COA codes for duplicate check
    electron_1.ipcMain.handle('coa:getAllKodes', () => {
        electron_log_1.default.debug('[IPC] coa:getAllKodes');
        return coaDb.getAllCOAKodes();
    });
    // Import Aspek Kerja batch
    electron_1.ipcMain.handle('aspekKerja:importBatch', (_event, data) => {
        electron_log_1.default.debug(`[IPC] aspekKerja:importBatch - ${data.length} rows`);
        return coaDb.importAspekKerjaBatch(data);
    });
    // Get existing Aspek Kerja codes for duplicate check
    electron_1.ipcMain.handle('aspekKerja:getAllKodes', () => {
        electron_log_1.default.debug('[IPC] aspekKerja:getAllKodes');
        return coaDb.getAllAspekKerjaKodes();
    });
    // Import Blok batch
    electron_1.ipcMain.handle('blok:importBatch', (_event, data) => {
        electron_log_1.default.debug(`[IPC] blok:importBatch - ${data.length} rows`);
        return blokDb.importBlokBatch(data);
    });
    // Get existing Blok codes for duplicate check
    electron_1.ipcMain.handle('blok:getAllKodes', () => {
        electron_log_1.default.debug('[IPC] blok:getAllKodes');
        return blokDb.getAllBlokKodes();
    });
    // Parse ORG-1 data from Excel (for Blok mapping verification)
    electron_1.ipcMain.handle('blok:parseORG1', (_event, rawData) => {
        electron_log_1.default.debug(`[IPC] blok:parseORG1 - ${rawData.length} rows`);
        return blokDb.parseORG1Data(rawData);
    });
    // Map ORG-1 data to Blok format
    electron_1.ipcMain.handle('blok:mapORG1ToBlok', (_event, org1Data) => {
        electron_log_1.default.debug(`[IPC] blok:mapORG1ToBlok - ${org1Data.length} rows`);
        return blokDb.mapORG1ToBlok(org1Data);
    });
    // Compare ORG-1 mapping with existing Blok records
    electron_1.ipcMain.handle('blok:compareORG1WithBlok', (_event, org1Data) => {
        electron_log_1.default.debug(`[IPC] blok:compareORG1WithBlok`);
        const allBlok = blokDb.getAllBlok();
        return blokDb.compareORG1WithBlok(org1Data, allBlok);
    });
    electron_log_1.default.info('[IPC] Import IPC handlers ready');
    // ============ Kas Transaction IPC Handlers ============
    // Get all transactions
    electron_1.ipcMain.handle('kas:getAll', () => {
        electron_log_1.default.debug('[IPC] kas:getAll');
        return kasDb.getAllTransactions();
    });
    // Get transaction by ID
    electron_1.ipcMain.handle('kas:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] kas:getById - ${id}`);
        return kasDb.getTransactionById(id);
    });
    // Create transaction
    electron_1.ipcMain.handle('kas:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] kas:create');
        return kasDb.createTransaction({
            ...input,
            transaction_type: input.transaction_type,
        });
    });
    // Update transaction
    electron_1.ipcMain.handle('kas:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] kas:update - ${id}`);
        return kasDb.updateTransaction(id, input, updatedBy);
    });
    // Delete transaction
    electron_1.ipcMain.handle('kas:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] kas:delete - ${id}`);
        return kasDb.deleteTransaction(id);
    });
    // Clear all Kas data (admin only)
    electron_1.ipcMain.handle('kas:clearAll', () => {
        electron_log_1.default.debug('[IPC] kas:clearAll');
        return kasDb.clearAllKas();
    });
    // Approve transaction
    electron_1.ipcMain.handle('kas:approve', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] kas:approve - ${id}`);
        return kasDb.approveTransaction(id, input);
    });
    // Reject transaction
    electron_1.ipcMain.handle('kas:reject', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] kas:reject - ${id}`);
        return kasDb.rejectTransaction(id, input);
    });
    // Get approval history
    electron_1.ipcMain.handle('kas:getApprovalHistory', (_event, transactionId) => {
        electron_log_1.default.debug(`[IPC] kas:getApprovalHistory - ${transactionId}`);
        return kasDb.getApprovalHistory(transactionId);
    });
    // Get approvers
    electron_1.ipcMain.handle('kas:getApprovers', () => {
        electron_log_1.default.debug('[IPC] kas:getApprovers');
        return kasDb.getApprovers();
    });
    // Check approver setup
    electron_1.ipcMain.handle('kas:checkApproverSetup', () => {
        electron_log_1.default.debug('[IPC] kas:checkApproverSetup');
        return kasDb.checkApproverSetup();
    });
    // Get Kas balance
    electron_1.ipcMain.handle('kas:getBalance', () => {
        electron_log_1.default.debug('[IPC] kas:getBalance');
        return kasDb.getKasBalance();
    });
    // Search transactions
    electron_1.ipcMain.handle('kas:search', (_event, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug('[IPC] kas:search');
        return kasDb.searchTransactions(searchTerm, transactionType, status, startDate, endDate);
    });
    // Get transactions with pagination
    electron_1.ipcMain.handle('kas:getWithPagination', (_event, page, pageSize, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug(`[IPC] kas:getWithPagination - page ${page}`);
        return kasDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType, status, startDate, endDate);
    });
    // Get status options
    electron_1.ipcMain.handle('kas:getStatusOptions', () => {
        electron_log_1.default.debug('[IPC] kas:getStatusOptions');
        return kasDb.getStatusOptions();
    });
    // Copy transaction
    electron_1.ipcMain.handle('kas:copy', (_event, id, createdBy) => {
        electron_log_1.default.debug(`[IPC] kas:copy - ${id}`);
        return kasDb.copyTransaction(id, createdBy);
    });
    // Validate COA
    electron_1.ipcMain.handle('kas:validateCOA', (_event, coaId) => {
        electron_log_1.default.debug('[IPC] kas:validateCOA');
        return kasDb.validateCOA(coaId);
    });
    // Get active COA
    electron_1.ipcMain.handle('kas:getActiveCOA', () => {
        electron_log_1.default.debug('[IPC] kas:getActiveCOA');
        return kasDb.getActiveCOA();
    });
    // Get active Aspek Kerja
    electron_1.ipcMain.handle('kas:getActiveAspekKerja', () => {
        electron_log_1.default.debug('[IPC] kas:getActiveAspekKerja');
        return kasDb.getActiveAspekKerja();
    });
    // Get active Blok
    electron_1.ipcMain.handle('kas:getActiveBlok', () => {
        electron_log_1.default.debug('[IPC] kas:getActiveBlok');
        return kasDb.getActiveBlok();
    });
    // Switch period
    electron_1.ipcMain.handle('kas:switchPeriod', (_event, year, month) => {
        electron_log_1.default.debug(`[IPC] kas:switchPeriod - ${year}/${month}`);
        return kasDb.switchPeriod(year, month);
    });
    // Get current period
    electron_1.ipcMain.handle('kas:getCurrentPeriod', () => {
        electron_log_1.default.debug('[IPC] kas:getCurrentPeriod');
        return kasDb.getCurrentPeriod();
    });
    // Import Kas batch
    electron_1.ipcMain.handle('kas:importBatch', (_event, data, createdBy) => {
        electron_log_1.default.debug(`[IPC] kas:importBatch - ${data.length} rows`);
        return kasDb.importKasBatch(data, createdBy);
    });
    electron_log_1.default.info('[IPC] Kas IPC handlers ready');
    // ============ Bank Transaction IPC Handlers ============
    // Get all transactions
    electron_1.ipcMain.handle('bank:getAll', () => {
        electron_log_1.default.debug('[IPC] bank:getAll');
        return bankDb.getAllTransactions();
    });
    // Get transaction by ID
    electron_1.ipcMain.handle('bank:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] bank:getById - ${id}`);
        return bankDb.getTransactionById(id);
    });
    // Create transaction
    electron_1.ipcMain.handle('bank:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] bank:create');
        return bankDb.createTransaction({
            ...input,
            transaction_type: input.transaction_type,
        });
    });
    // Update transaction
    electron_1.ipcMain.handle('bank:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] bank:update - ${id}`);
        return bankDb.updateTransaction(id, input, updatedBy);
    });
    // Delete transaction
    electron_1.ipcMain.handle('bank:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] bank:delete - ${id}`);
        return bankDb.deleteTransaction(id);
    });
    // Clear all Bank data (admin only)
    electron_1.ipcMain.handle('bank:clearAll', () => {
        electron_log_1.default.debug('[IPC] bank:clearAll');
        return bankDb.clearAllBank();
    });
    // Approve transaction
    electron_1.ipcMain.handle('bank:approve', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] bank:approve - ${id}`);
        return bankDb.approveTransaction(id, input);
    });
    // Reject transaction
    electron_1.ipcMain.handle('bank:reject', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] bank:reject - ${id}`);
        return bankDb.rejectTransaction(id, input);
    });
    // Get approval history
    electron_1.ipcMain.handle('bank:getApprovalHistory', (_event, transactionId) => {
        electron_log_1.default.debug(`[IPC] bank:getApprovalHistory - ${transactionId}`);
        return bankDb.getApprovalHistory(transactionId);
    });
    // Get approvers
    electron_1.ipcMain.handle('bank:getApprovers', () => {
        electron_log_1.default.debug('[IPC] bank:getApprovers');
        return bankDb.getApprovers();
    });
    // Check approver setup
    electron_1.ipcMain.handle('bank:checkApproverSetup', () => {
        electron_log_1.default.debug('[IPC] bank:checkApproverSetup');
        return bankDb.checkApproverSetup();
    });
    // Get Bank balance
    electron_1.ipcMain.handle('bank:getBalance', () => {
        electron_log_1.default.debug('[IPC] bank:getBalance');
        return bankDb.getBankBalance();
    });
    // Search transactions
    electron_1.ipcMain.handle('bank:search', (_event, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug('[IPC] bank:search');
        return bankDb.searchTransactions(searchTerm, transactionType, status, startDate, endDate);
    });
    // Get transactions with pagination
    electron_1.ipcMain.handle('bank:getWithPagination', (_event, page, pageSize, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug(`[IPC] bank:getWithPagination - page ${page}`);
        return bankDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType, status, startDate, endDate);
    });
    // Get status options
    electron_1.ipcMain.handle('bank:getStatusOptions', () => {
        electron_log_1.default.debug('[IPC] bank:getStatusOptions');
        return bankDb.getStatusOptions();
    });
    // Copy transaction
    electron_1.ipcMain.handle('bank:copy', (_event, id, createdBy) => {
        electron_log_1.default.debug(`[IPC] bank:copy - ${id}`);
        return bankDb.copyTransaction(id, createdBy);
    });
    // Validate COA
    electron_1.ipcMain.handle('bank:validateCOA', (_event, coaId) => {
        electron_log_1.default.debug('[IPC] bank:validateCOA');
        return bankDb.validateCOA(coaId);
    });
    // Get active COA
    electron_1.ipcMain.handle('bank:getActiveCOA', () => {
        electron_log_1.default.debug('[IPC] bank:getActiveCOA');
        return bankDb.getActiveCOA();
    });
    // Get active Aspek Kerja
    electron_1.ipcMain.handle('bank:getActiveAspekKerja', () => {
        electron_log_1.default.debug('[IPC] bank:getActiveAspekKerja');
        return bankDb.getActiveAspekKerja();
    });
    // Get active Blok
    electron_1.ipcMain.handle('bank:getActiveBlok', () => {
        electron_log_1.default.debug('[IPC] bank:getActiveBlok');
        return bankDb.getActiveBlok();
    });
    // Switch period
    electron_1.ipcMain.handle('bank:switchPeriod', (_event, year, month) => {
        electron_log_1.default.debug(`[IPC] bank:switchPeriod - ${year}/${month}`);
        return bankDb.switchPeriod(year, month);
    });
    // Get current period
    electron_1.ipcMain.handle('bank:getCurrentPeriod', () => {
        electron_log_1.default.debug('[IPC] bank:getCurrentPeriod');
        return bankDb.getCurrentPeriod();
    });
    // Import Bank batch
    electron_1.ipcMain.handle('bank:importBatch', (_event, data, createdBy) => {
        electron_log_1.default.debug(`[IPC] bank:importBatch - ${data.length} rows`);
        return bankDb.importBankBatch(data, createdBy);
    });
    electron_log_1.default.info('[IPC] Bank IPC handlers ready');
    // ============ Gudang Transaction IPC Handlers ============
    // Get all transactions
    electron_1.ipcMain.handle('gudang:getAll', () => {
        electron_log_1.default.debug('[IPC] gudang:getAll');
        return gudangDb.getAllTransactions();
    });
    // Get transaction by ID
    electron_1.ipcMain.handle('gudang:getById', (_event, id) => {
        electron_log_1.default.debug(`[IPC] gudang:getById - ${id}`);
        return gudangDb.getTransactionById(id);
    });
    // Create transaction
    electron_1.ipcMain.handle('gudang:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] gudang:create');
        return gudangDb.createTransaction({
            ...input,
            transaction_type: input.transaction_type,
        });
    });
    // Update transaction
    electron_1.ipcMain.handle('gudang:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] gudang:update - ${id}`);
        return gudangDb.updateTransaction(id, input, updatedBy);
    });
    // Delete transaction
    electron_1.ipcMain.handle('gudang:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] gudang:delete - ${id}`);
        return gudangDb.deleteTransaction(id);
    });
    // Clear all Gudang data (admin only)
    electron_1.ipcMain.handle('gudang:clearAll', () => {
        electron_log_1.default.debug('[IPC] gudang:clearAll');
        return gudangDb.clearAllGudang();
    });
    // Approve transaction
    electron_1.ipcMain.handle('gudang:approve', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] gudang:approve - ${id}`);
        return gudangDb.approveTransaction(id, input);
    });
    // Reject transaction
    electron_1.ipcMain.handle('gudang:reject', (_event, id, input) => {
        electron_log_1.default.debug(`[IPC] gudang:reject - ${id}`);
        return gudangDb.rejectTransaction(id, input);
    });
    // Get approval history
    electron_1.ipcMain.handle('gudang:getApprovalHistory', (_event, transactionId) => {
        electron_log_1.default.debug(`[IPC] gudang:getApprovalHistory - ${transactionId}`);
        return gudangDb.getApprovalHistory(transactionId);
    });
    // Get approvers
    electron_1.ipcMain.handle('gudang:getApprovers', () => {
        electron_log_1.default.debug('[IPC] gudang:getApprovers');
        return gudangDb.getApprovers();
    });
    // Check approver setup
    electron_1.ipcMain.handle('gudang:checkApproverSetup', () => {
        electron_log_1.default.debug('[IPC] gudang:checkApproverSetup');
        return gudangDb.checkApproverSetup();
    });
    // Get Gudang stock
    electron_1.ipcMain.handle('gudang:getStock', () => {
        electron_log_1.default.debug('[IPC] gudang:getStock');
        return gudangDb.getGudangStock();
    });
    // Search transactions
    electron_1.ipcMain.handle('gudang:search', (_event, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug('[IPC] gudang:search');
        return gudangDb.searchTransactions(searchTerm, transactionType, status, startDate, endDate);
    });
    // Get transactions with pagination
    electron_1.ipcMain.handle('gudang:getWithPagination', (_event, page, pageSize, searchTerm, transactionType, status, startDate, endDate) => {
        electron_log_1.default.debug(`[IPC] gudang:getWithPagination - page ${page}`);
        return gudangDb.getTransactionsWithPagination(page, pageSize, searchTerm, transactionType, status, startDate, endDate);
    });
    // Get status options
    electron_1.ipcMain.handle('gudang:getStatusOptions', () => {
        electron_log_1.default.debug('[IPC] gudang:getStatusOptions');
        return gudangDb.getStatusOptions();
    });
    // Copy transaction
    electron_1.ipcMain.handle('gudang:copy', (_event, id, createdBy) => {
        electron_log_1.default.debug(`[IPC] gudang:copy - ${id}`);
        return gudangDb.copyTransaction(id, createdBy);
    });
    // Validate COA
    electron_1.ipcMain.handle('gudang:validateCOA', (_event, coaId) => {
        electron_log_1.default.debug('[IPC] gudang:validateCOA');
        return gudangDb.validateCOA(coaId);
    });
    // Get active COA
    electron_1.ipcMain.handle('gudang:getActiveCOA', () => {
        electron_log_1.default.debug('[IPC] gudang:getActiveCOA');
        return gudangDb.getActiveCOA();
    });
    // Get active Aspek Kerja
    electron_1.ipcMain.handle('gudang:getActiveAspekKerja', () => {
        electron_log_1.default.debug('[IPC] gudang:getActiveAspekKerja');
        return gudangDb.getActiveAspekKerja();
    });
    // Get active Blok
    electron_1.ipcMain.handle('gudang:getActiveBlok', () => {
        electron_log_1.default.debug('[IPC] gudang:getActiveBlok');
        return gudangDb.getActiveBlok();
    });
    // Switch period
    electron_1.ipcMain.handle('gudang:switchPeriod', (_event, year, month) => {
        electron_log_1.default.debug(`[IPC] gudang:switchPeriod - ${year}/${month}`);
        return gudangDb.switchPeriod(year, month);
    });
    // Get current period
    electron_1.ipcMain.handle('gudang:getCurrentPeriod', () => {
        electron_log_1.default.debug('[IPC] gudang:getCurrentPeriod');
        return gudangDb.getCurrentPeriod();
    });
    // Import Gudang batch
    electron_1.ipcMain.handle('gudang:importBatch', (_event, data, createdBy) => {
        electron_log_1.default.debug(`[IPC] gudang:importBatch - ${data.length} rows`);
        return gudangDb.importGudangBatch(data, createdBy);
    });
    electron_log_1.default.info('[IPC] Gudang IPC handlers ready');
    // ============ Sync System IPC Handlers ============
    // Initialize sync database
    electron_1.ipcMain.handle('sync:init', async () => {
        electron_log_1.default.debug('[IPC] sync:init');
        try {
            await syncDb.initSyncDatabase();
            return { success: true, message: 'Sync database initialized' };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] sync:init failed:', error);
            return { success: false, message: 'Failed to initialize sync database' };
        }
    });
    // Get all sync configurations
    electron_1.ipcMain.handle('sync:getAllConfigs', () => {
        electron_log_1.default.debug('[IPC] sync:getAllConfigs');
        return syncDb.getAllSyncConfigs();
    });
    // Get sync config by module
    electron_1.ipcMain.handle('sync:getConfig', (_event, module) => {
        electron_log_1.default.debug(`[IPC] sync:getConfig - ${module}`);
        return syncDb.getSyncConfigByModule(module);
    });
    // Save sync config
    electron_1.ipcMain.handle('sync:saveConfig', (_event, input) => {
        electron_log_1.default.debug(`[IPC] sync:saveConfig - ${input.module}`);
        return syncDb.saveSyncConfig(input);
    });
    // Delete sync config
    electron_1.ipcMain.handle('sync:deleteConfig', (_event, module) => {
        electron_log_1.default.debug(`[IPC] sync:deleteConfig - ${module}`);
        return syncDb.deleteSyncConfig(module);
    });
    // Check connection status for a module
    electron_1.ipcMain.handle('sync:checkConnection', (_event, module) => {
        electron_log_1.default.debug(`[IPC] sync:checkConnection - ${module}`);
        return syncDb.checkPathConnection(module);
    });
    // Check all connections
    electron_1.ipcMain.handle('sync:checkAllConnections', () => {
        electron_log_1.default.debug('[IPC] sync:checkAllConnections');
        return syncDb.checkAllConnections();
    });
    // Get sync queue count
    electron_1.ipcMain.handle('sync:getQueueCount', () => {
        electron_log_1.default.debug('[IPC] sync:getQueueCount');
        return syncDb.getSyncQueueCount();
    });
    // Get pending sync items
    electron_1.ipcMain.handle('sync:getPendingItems', () => {
        electron_log_1.default.debug('[IPC] sync:getPendingItems');
        return syncDb.getPendingSyncItems();
    });
    // Add to sync queue
    electron_1.ipcMain.handle('sync:addToQueue', (_event, module, operation, recordId, data) => {
        electron_log_1.default.debug(`[IPC] sync:addToQueue - ${module}/${operation}/${recordId}`);
        return syncDb.addToSyncQueue(module, operation, recordId, data);
    });
    // Trigger manual sync
    electron_1.ipcMain.handle('sync:performSync', async (_event, module) => {
        electron_log_1.default.debug(`[IPC] sync:performSync - ${module}`);
        return await syncDb.performSync(module);
    });
    // Trigger auto-sync (with delay)
    electron_1.ipcMain.handle('sync:triggerAutoSync', (_event, module) => {
        electron_log_1.default.debug(`[IPC] sync:triggerAutoSync - ${module}`);
        syncDb.triggerAutoSync(module);
        return { success: true, message: 'Auto-sync scheduled' };
    });
    // Clear sync queue
    electron_1.ipcMain.handle('sync:clearQueue', () => {
        electron_log_1.default.debug('[IPC] sync:clearQueue');
        return syncDb.clearSyncQueue();
    });
    // Get recent conflicts
    electron_1.ipcMain.handle('sync:getConflicts', (_event, limit) => {
        electron_log_1.default.debug('[IPC] sync:getConflicts');
        return syncDb.getRecentConflicts(limit);
    });
    // Detect conflict
    electron_1.ipcMain.handle('sync:detectConflict', (_event, module, recordId, localTimestamp, remoteTimestamp) => {
        electron_log_1.default.debug(`[IPC] sync:detectConflict - ${module}/${recordId}`);
        return syncDb.detectConflict(module, recordId, localTimestamp, remoteTimestamp);
    });
    electron_log_1.default.info('[IPC] Sync system IPC handlers ready');
    // ============ Batch Sync IPC Handlers ============
    // Process batch sync with configurable options
    electron_1.ipcMain.handle('batchSync:process', async (_event, baseUrl, authToken, config) => {
        electron_log_1.default.debug('[IPC] batchSync:process');
        try {
            const apiClient = batchSync.createApiClient(baseUrl, authToken);
            const result = await batchSync.processBatchSync(apiClient, config);
            return { success: true, result };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] batchSync:process failed:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    // Set batch sync progress callback
    electron_1.ipcMain.handle('batchSync:setProgressCallback', (_event, callbackId) => {
        electron_log_1.default.debug(`[IPC] batchSync:setProgressCallback - ${callbackId}`);
        // The actual callback is set via the process call; this just registers intent
        return { success: true, message: 'Progress callback registered' };
    });
    // Cancel ongoing batch sync
    electron_1.ipcMain.handle('batchSync:cancel', () => {
        electron_log_1.default.debug('[IPC] batchSync:cancel');
        batchSync.cancelBatchSync();
        return { success: true, message: 'Batch sync cancellation requested' };
    });
    // Get batch sync configuration
    electron_1.ipcMain.handle('batchSync:getConfig', () => {
        electron_log_1.default.debug('[IPC] batchSync:getConfig');
        return batchSync.getConfig();
    });
    // Set batch sync configuration
    electron_1.ipcMain.handle('batchSync:setConfig', (_event, config) => {
        electron_log_1.default.debug('[IPC] batchSync:setConfig');
        const validation = batchSync.validateConfig(config);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }
        batchSync.setConfig(config);
        return { success: true, config: batchSync.getConfig() };
    });
    // Get batch sync statistics
    electron_1.ipcMain.handle('batchSync:getStats', () => {
        electron_log_1.default.debug('[IPC] batchSync:getStats');
        return batchSync.getBatchSyncStats();
    });
    // Retry failed items from a previous batch sync
    electron_1.ipcMain.handle('batchSync:retryFailed', async (_event, baseUrl, authToken, itemIds, config) => {
        electron_log_1.default.debug(`[IPC] batchSync:retryFailed - ${itemIds.length} items`);
        try {
            const apiClient = batchSync.createApiClient(baseUrl, authToken);
            const result = await batchSync.retryFailedItems(apiClient, itemIds, config);
            return { success: true, result };
        }
        catch (error) {
            electron_log_1.default.error('[IPC] batchSync:retryFailed failed:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    electron_log_1.default.info('[IPC] Batch sync IPC handlers ready');
    // ============ Local-First Operations IPC Handlers ============
    // Get sync queue status (pending operations count)
    electron_1.ipcMain.handle('localFirst:getSyncQueueStatus', () => {
        electron_log_1.default.debug('[IPC] localFirst:getSyncQueueStatus');
        return localFirstOps.getSyncQueueStatus();
    });
    // Check if module has pending sync operations
    electron_1.ipcMain.handle('localFirst:hasPendingSyncForModule', (_event, module) => {
        electron_log_1.default.debug(`[IPC] localFirst:hasPendingSyncForModule - ${module}`);
        return localFirstOps.hasPendingSyncForModule(module);
    });
    // Get pending sync count for module
    electron_1.ipcMain.handle('localFirst:getPendingSyncCountForModule', (_event, module) => {
        electron_log_1.default.debug(`[IPC] localFirst:getPendingSyncCountForModule - ${module}`);
        return localFirstOps.getPendingSyncCountForModule(module);
    });
    // Create Kas transaction (local-first)
    electron_1.ipcMain.handle('localFirst:kas:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] localFirst:kas:create');
        return localFirstOps.createKasTransactionLocalFirst(input);
    });
    // Update Kas transaction (local-first)
    electron_1.ipcMain.handle('localFirst:kas:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] localFirst:kas:update - ${id}`);
        return localFirstOps.updateKasTransactionLocalFirst(id, input, updatedBy);
    });
    // Delete Kas transaction (local-first, soft delete)
    electron_1.ipcMain.handle('localFirst:kas:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] localFirst:kas:delete - ${id}`);
        return localFirstOps.deleteKasTransactionLocalFirst(id);
    });
    // Create Bank transaction (local-first)
    electron_1.ipcMain.handle('localFirst:bank:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] localFirst:bank:create');
        return localFirstOps.createBankTransactionLocalFirst(input);
    });
    // Update Bank transaction (local-first)
    electron_1.ipcMain.handle('localFirst:bank:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] localFirst:bank:update - ${id}`);
        return localFirstOps.updateBankTransactionLocalFirst(id, input, updatedBy);
    });
    // Delete Bank transaction (local-first, soft delete)
    electron_1.ipcMain.handle('localFirst:bank:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] localFirst:bank:delete - ${id}`);
        return localFirstOps.deleteBankTransactionLocalFirst(id);
    });
    // Create Gudang transaction (local-first)
    electron_1.ipcMain.handle('localFirst:gudang:create', (_event, input) => {
        electron_log_1.default.debug('[IPC] localFirst:gudang:create');
        return localFirstOps.createGudangTransactionLocalFirst(input);
    });
    // Update Gudang transaction (local-first)
    electron_1.ipcMain.handle('localFirst:gudang:update', (_event, id, input, updatedBy) => {
        electron_log_1.default.debug(`[IPC] localFirst:gudang:update - ${id}`);
        return localFirstOps.updateGudangTransactionLocalFirst(id, input, updatedBy);
    });
    // Delete Gudang transaction (local-first, soft delete)
    electron_1.ipcMain.handle('localFirst:gudang:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] localFirst:gudang:delete - ${id}`);
        return localFirstOps.deleteGudangTransactionLocalFirst(id);
    });
    // Create COA (local-first)
    electron_1.ipcMain.handle('localFirst:coa:create', (_event, kode, nama, tipe, parentId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] localFirst:coa:create - ${kode}`);
        return localFirstOps.createCOALocalFirst(kode, nama, tipe, parentId, statusAktif);
    });
    // Update COA (local-first)
    electron_1.ipcMain.handle('localFirst:coa:update', (_event, id, nama, tipe, parentId, statusAktif) => {
        electron_log_1.default.debug(`[IPC] localFirst:coa:update - ${id}`);
        return localFirstOps.updateCOALocalFirst(id, nama, tipe, parentId, statusAktif);
    });
    // Delete COA (local-first, soft delete)
    electron_1.ipcMain.handle('localFirst:coa:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] localFirst:coa:delete - ${id}`);
        return localFirstOps.deleteCOALocalFirst(id);
    });
    // Create Blok (local-first)
    electron_1.ipcMain.handle('localFirst:blok:create', (_event, kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => {
        electron_log_1.default.debug(`[IPC] localFirst:blok:create - ${kodeBlok}`);
        return localFirstOps.createBlokLocalFirst(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
    });
    // Update Blok (local-first)
    electron_1.ipcMain.handle('localFirst:blok:update', (_event, id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => {
        electron_log_1.default.debug(`[IPC] localFirst:blok:update - ${id}`);
        return localFirstOps.updateBlokLocalFirst(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
    });
    // Delete Blok (local-first, soft delete)
    electron_1.ipcMain.handle('localFirst:blok:delete', (_event, id) => {
        electron_log_1.default.debug(`[IPC] localFirst:blok:delete - ${id}`);
        return localFirstOps.deleteBlokLocalFirst(id);
    });
    // ============ Sync Detection IPC Handlers ============
    // Detect local changes (push direction)
    electron_1.ipcMain.handle('syncDetection:detectLocalChanges', () => {
        electron_log_1.default.debug('[IPC] syncDetection:detectLocalChanges');
        return syncDetection.detectLocalChanges();
    });
    // Detect local changes for specific module
    electron_1.ipcMain.handle('syncDetection:detectLocalChangesForModule', (_event, module) => {
        electron_log_1.default.debug(`[IPC] syncDetection:detectLocalChangesForModule - ${module}`);
        return syncDetection.detectLocalChangesForModule(module);
    });
    // Detect remote changes (pull direction) - requires config
    electron_1.ipcMain.handle('syncDetection:detectRemoteChanges', async (_event, module, lastSyncTimestamp, config) => {
        electron_log_1.default.debug(`[IPC] syncDetection:detectRemoteChanges - ${module}`);
        return await syncDetection.detectRemoteChanges(module, lastSyncTimestamp, config);
    });
    // Get comprehensive sync status
    electron_1.ipcMain.handle('syncDetection:getStatus', () => {
        electron_log_1.default.debug('[IPC] syncDetection:getStatus');
        return syncDetection.getSyncDetectionStatus();
    });
    // Quick check for pending local changes
    electron_1.ipcMain.handle('syncDetection:hasPendingChanges', () => {
        electron_log_1.default.debug('[IPC] syncDetection:hasPendingChanges');
        return syncDetection.hasPendingLocalChanges();
    });
    // Quick check for specific module
    electron_1.ipcMain.handle('syncDetection:hasPendingChangesForModule', (_event, module) => {
        electron_log_1.default.debug(`[IPC] syncDetection:hasPendingChangesForModule - ${module}`);
        return syncDetection.hasPendingLocalChangesForModule(module);
    });
    // Get total pending count
    electron_1.ipcMain.handle('syncDetection:getTotalPendingCount', () => {
        electron_log_1.default.debug('[IPC] syncDetection:getTotalPendingCount');
        return syncDetection.getTotalPendingChangesCount();
    });
    // Estimate sync time
    electron_1.ipcMain.handle('syncDetection:estimateSyncTime', () => {
        electron_log_1.default.debug('[IPC] syncDetection:estimateSyncTime');
        return syncDetection.estimateSyncTime();
    });
    // Record sync result
    electron_1.ipcMain.handle('syncDetection:recordSyncResult', (_event, result) => {
        electron_log_1.default.debug(`[IPC] syncDetection:recordSyncResult - ${result.direction} for ${result.module}`);
        return syncDetection.recordSyncResult(result);
    });
    // ============ Auto-Sync Timer IPC Handlers ============
    // Get auto-sync timer status
    electron_1.ipcMain.handle('autoSyncTimer:getStatus', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:getStatus');
        return autoSyncTimer.getStatus();
    });
    // Get auto-sync timer configuration
    electron_1.ipcMain.handle('autoSyncTimer:getConfig', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:getConfig');
        return autoSyncTimer.getConfig();
    });
    // Set auto-sync timer configuration
    electron_1.ipcMain.handle('autoSyncTimer:setConfig', (_event, config) => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:setConfig');
        autoSyncTimer.setConfig(config);
        return { success: true, config: autoSyncTimer.getConfig() };
    });
    // Start auto-sync timer
    electron_1.ipcMain.handle('autoSyncTimer:start', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:start');
        autoSyncTimer.startTimer();
        return { success: true, status: autoSyncTimer.getStatus() };
    });
    // Stop auto-sync timer
    electron_1.ipcMain.handle('autoSyncTimer:stop', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:stop');
        autoSyncTimer.stopTimer();
        return { success: true, status: autoSyncTimer.getStatus() };
    });
    // Pause auto-sync timer
    electron_1.ipcMain.handle('autoSyncTimer:pause', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:pause');
        autoSyncTimer.pauseTimer();
        return { success: true, status: autoSyncTimer.getStatus() };
    });
    // Resume auto-sync timer
    electron_1.ipcMain.handle('autoSyncTimer:resume', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:resume');
        autoSyncTimer.resumeTimer();
        return { success: true, status: autoSyncTimer.getStatus() };
    });
    // Reset auto-sync timer
    electron_1.ipcMain.handle('autoSyncTimer:reset', () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:reset');
        autoSyncTimer.resetTimer();
        return { success: true, status: autoSyncTimer.getStatus() };
    });
    // Trigger manual sync
    electron_1.ipcMain.handle('autoSyncTimer:manualSync', async () => {
        electron_log_1.default.debug('[IPC] autoSyncTimer:manualSync');
        return await autoSyncTimer.triggerManualSync();
    });
    electron_log_1.default.info('[IPC] Auto-sync timer IPC handlers ready');
    electron_log_1.default.info('[IPC] Local-first operations IPC handlers ready');
}
// App lifecycle
electron_1.app.whenReady().then(async () => {
    electron_log_1.default.info('[App] App is ready');
    // Initialize Local Database Manager first (connection pooling, schema mirroring)
    try {
        await localDbMgr.localDatabaseManager.initialize();
        electron_log_1.default.info('[App] Local Database Manager initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Local Database Manager:', error);
    }
    // Initialize all local databases (master + sync + current period transactions)
    try {
        await localDbMgr.localDatabaseManager.initAllDatabases();
        electron_log_1.default.info('[App] All local databases initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize all local databases:', error);
    }
    // Initialize user database
    try {
        await userDb.initUserDatabase();
        electron_log_1.default.info('[App] User database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize user database:', error);
    }
    // Initialize COA database
    try {
        await coaDb.initCOADatabase();
        electron_log_1.default.info('[App] COA database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize COA database:', error);
    }
    // Initialize Blok database
    try {
        await blokDb.initBlokDatabase();
        electron_log_1.default.info('[App] Blok database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Blok database:', error);
    }
    // Initialize Kas database
    try {
        await kasDb.initKasDatabase();
        electron_log_1.default.info('[App] Kas database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Kas database:', error);
    }
    // Initialize Bank database
    try {
        await bankDb.initBankDatabase();
        electron_log_1.default.info('[App] Bank database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Bank database:', error);
    }
    // Initialize Gudang database
    try {
        await gudangDb.initGudangDatabase();
        electron_log_1.default.info('[App] Gudang database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Gudang database:', error);
    }
    // Initialize Sync database
    try {
        await syncDb.initSyncDatabase();
        electron_log_1.default.info('[App] Sync database initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Sync database:', error);
    }
    // Initialize Auto-Sync Timer
    try {
        autoSyncTimer.initAutoSyncTimer();
        electron_log_1.default.info('[App] Auto-sync timer initialized');
    }
    catch (error) {
        electron_log_1.default.error('[App] Failed to initialize Auto-sync timer:', error);
    }
    setupIpcHandlers();
    createWindow();
    startSocketServer(socketServerPort);
    // Cleanup expired sessions periodically (every 5 minutes)
    setInterval(() => {
        userDb.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    electron_log_1.default.info('[App] All windows closed');
    stopSocketServer();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', () => {
    electron_log_1.default.info('[App] Application quitting...');
    stopSocketServer();
    // Destroy auto-sync timer
    autoSyncTimer.destroy();
    // Close all database connections
    localDbMgr.localDatabaseManager.closeAll();
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    electron_log_1.default.error(`[Error] Uncaught exception: ${error.message}`);
    electron_log_1.default.error(error.stack || 'No stack trace');
});
process.on('unhandledRejection', (reason) => {
    electron_log_1.default.error(`[Error] Unhandled rejection: ${reason}`);
});
electron_log_1.default.info('[Main] Main process initialization complete');
