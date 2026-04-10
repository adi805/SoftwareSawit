"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getAppInfo: () => electron_1.ipcRenderer.invoke('app:getInfo'),
    // Admin mode
    setAdminMode: (enabled) => electron_1.ipcRenderer.invoke('app:setAdminMode', enabled),
    getAdminMode: () => electron_1.ipcRenderer.invoke('app:getAdminMode'),
    // DevTools
    toggleDevTools: () => electron_1.ipcRenderer.invoke('dev:toggleDevTools'),
    // Socket server
    toggleSocketServer: () => electron_1.ipcRenderer.invoke('socket:toggle'),
    getSocketStatus: () => electron_1.ipcRenderer.invoke('socket:getStatus'),
    // Logging
    getLogEntries: () => electron_1.ipcRenderer.invoke('log:getEntries'),
    // Database path
    getDataPath: () => electron_1.ipcRenderer.invoke('app:getDataPath'),
    // ============ User Management ============
    // Get all users
    getAllUsers: () => electron_1.ipcRenderer.invoke('user:getAll'),
    // Get user by ID
    getUserById: (userId) => electron_1.ipcRenderer.invoke('user:getById', userId),
    // Get roles
    getRoles: () => electron_1.ipcRenderer.invoke('user:getRoles'),
    // Create user
    createUser: (username, password, fullName, role) => electron_1.ipcRenderer.invoke('user:create', username, password, fullName, role),
    // Update user
    updateUser: (userId, fullName, role) => electron_1.ipcRenderer.invoke('user:update', userId, fullName, role),
    // Delete user
    deleteUser: (userId, requestingUserId) => electron_1.ipcRenderer.invoke('user:delete', userId, requestingUserId),
    // Clear all non-admin users (admin only)
    clearAllUsers: () => electron_1.ipcRenderer.invoke('user:clearAll'),
    // Login
    login: (username, password) => electron_1.ipcRenderer.invoke('user:login', username, password),
    // Logout
    logout: (token, userId) => electron_1.ipcRenderer.invoke('user:logout', token, userId),
    // Validate session
    validateSession: (token) => electron_1.ipcRenderer.invoke('user:validateSession', token),
    // Refresh session
    refreshSession: (token) => electron_1.ipcRenderer.invoke('user:refreshSession', token),
    // Get active sessions
    getActiveSessions: () => electron_1.ipcRenderer.invoke('user:getActiveSessions'),
    // Terminate session
    terminateSession: (sessionId) => electron_1.ipcRenderer.invoke('user:terminateSession', sessionId),
    // Get activity log
    getActivityLog: (userId, limit) => electron_1.ipcRenderer.invoke('user:getActivityLog', userId, limit),
    // Change password
    changePassword: (userId, oldPassword, newPassword) => electron_1.ipcRenderer.invoke('user:changePassword', userId, oldPassword, newPassword),
    // Admin reset password
    adminResetPassword: (adminId, targetUserId, newPassword) => electron_1.ipcRenderer.invoke('user:adminResetPassword', adminId, targetUserId, newPassword),
    // Validate password strength
    validatePassword: (password) => electron_1.ipcRenderer.invoke('user:validatePassword', password),
    // ============ COA Management ============
    // Get all COA
    getAllCOA: () => electron_1.ipcRenderer.invoke('coa:getAll'),
    // Get COA by ID
    getCOAById: (id) => electron_1.ipcRenderer.invoke('coa:getById', id),
    // Get COA by Kode
    getCOAByKode: (kode) => electron_1.ipcRenderer.invoke('coa:getByKode', kode),
    // Create COA
    createCOA: (kode, nama, tipe, parentId, statusAktif) => electron_1.ipcRenderer.invoke('coa:create', kode, nama, tipe, parentId, statusAktif),
    // Update COA
    updateCOA: (id, nama, tipe, parentId, statusAktif) => electron_1.ipcRenderer.invoke('coa:update', id, nama, tipe, parentId, statusAktif),
    // Delete COA
    deleteCOA: (id) => electron_1.ipcRenderer.invoke('coa:delete', id),
    // Delete COA with cascade
    deleteCOAWithAspekKerja: (id) => electron_1.ipcRenderer.invoke('coa:deleteWithAspekKerja', id),
    // Clear all COA data (admin only)
    clearAllCOA: () => electron_1.ipcRenderer.invoke('coa:clearAll'),
    // Clear all Aspek Kerja data (admin only)
    clearAllAspekKerja: () => electron_1.ipcRenderer.invoke('aspekKerja:clearAll'),
    // Search COA
    searchCOA: (searchTerm, tipe, statusAktif) => electron_1.ipcRenderer.invoke('coa:search', searchTerm, tipe, statusAktif),
    // Get COA by parent
    getCOAByParent: (parentId) => electron_1.ipcRenderer.invoke('coa:getByParent', parentId),
    // Get COA with pagination
    getCOAWithPagination: (page, pageSize, searchTerm, tipe, statusAktif) => electron_1.ipcRenderer.invoke('coa:getWithPagination', page, pageSize, searchTerm, tipe, statusAktif),
    // Get tipe options
    getCOATipeOptions: () => electron_1.ipcRenderer.invoke('coa:getTipeOptions'),
    // Get aspek kerja count
    getCOAAspekKerjaCount: (coaId) => electron_1.ipcRenderer.invoke('coa:getAspekKerjaCount', coaId),
    // ============ Aspek Kerja Management ============
    // Get all Aspek Kerja
    getAllAspekKerja: () => electron_1.ipcRenderer.invoke('aspekKerja:getAll'),
    // Get Aspek Kerja by ID
    getAspekKerjaById: (id) => electron_1.ipcRenderer.invoke('aspekKerja:getById', id),
    // Get Aspek Kerja by Kode
    getAspekKerjaByKode: (kode) => electron_1.ipcRenderer.invoke('aspekKerja:getByKode', kode),
    // Create Aspek Kerja
    createAspekKerja: (kode, nama, coaId, jenis, statusAktif) => electron_1.ipcRenderer.invoke('aspekKerja:create', kode, nama, coaId, jenis, statusAktif),
    // Update Aspek Kerja
    updateAspekKerja: (id, nama, coaId, jenis, statusAktif) => electron_1.ipcRenderer.invoke('aspekKerja:update', id, nama, coaId, jenis, statusAktif),
    // Delete Aspek Kerja
    deleteAspekKerja: (id) => electron_1.ipcRenderer.invoke('aspekKerja:delete', id),
    // Search Aspek Kerja
    searchAspekKerja: (searchTerm, jenis, coaId, statusAktif) => electron_1.ipcRenderer.invoke('aspekKerja:search', searchTerm, jenis, coaId, statusAktif),
    // Get Aspek Kerja with pagination
    getAspekKerjaWithPagination: (page, pageSize, searchTerm, jenis, coaId, statusAktif) => electron_1.ipcRenderer.invoke('aspekKerja:getWithPagination', page, pageSize, searchTerm, jenis, coaId, statusAktif),
    // Get active COA for dropdown
    getActiveCOA: () => electron_1.ipcRenderer.invoke('aspekKerja:getActiveCOA'),
    // ============ Blok Management ============
    // Get all Blok
    getAllBlok: () => electron_1.ipcRenderer.invoke('blok:getAll'),
    // Get Blok by ID
    getBlokById: (id) => electron_1.ipcRenderer.invoke('blok:getById', id),
    // Get Blok by Kode
    getBlokByKode: (kodeBlok) => electron_1.ipcRenderer.invoke('blok:getByKode', kodeBlok),
    // Create Blok
    createBlok: (kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => electron_1.ipcRenderer.invoke('blok:create', kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),
    // Update Blok
    updateBlok: (id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) => electron_1.ipcRenderer.invoke('blok:update', id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),
    // Delete Blok
    deleteBlok: (id) => electron_1.ipcRenderer.invoke('blok:delete', id),
    // Clear all Blok (admin only)
    clearAllBlok: () => electron_1.ipcRenderer.invoke('blok:clearAll'),
    // Search Blok
    searchBlok: (searchTerm, tahunTanam, status) => electron_1.ipcRenderer.invoke('blok:search', searchTerm, tahunTanam, status),
    // Get Blok with pagination
    getBlokWithPagination: (page, pageSize, searchTerm, tahunTanam, status) => electron_1.ipcRenderer.invoke('blok:getWithPagination', page, pageSize, searchTerm, tahunTanam, status),
    // Get status options
    getBlokStatusOptions: () => electron_1.ipcRenderer.invoke('blok:getStatusOptions'),
    // Get available years for filter
    getBlokAvailableYears: () => electron_1.ipcRenderer.invoke('blok:getAvailableYears'),
    // ============ Import/Export IPC ============
    // Show save dialog for export
    showSaveDialog: (defaultName) => electron_1.ipcRenderer.invoke('dialog:showSave', defaultName),
    // Show open dialog for import
    showOpenDialog: (title) => electron_1.ipcRenderer.invoke('dialog:showOpen', title),
    // Read Excel file via main process
    readExcelFile: (filePath) => electron_1.ipcRenderer.invoke('excel:readFile', filePath),
    // Import COA batch
    importCOABatch: (data) => electron_1.ipcRenderer.invoke('coa:importBatch', data),
    // Get all COA codes
    getAllCOAKodes: () => electron_1.ipcRenderer.invoke('coa:getAllKodes'),
    // Import Aspek Kerja batch
    importAspekKerjaBatch: (data) => electron_1.ipcRenderer.invoke('aspekKerja:importBatch', data),
    // Get all Aspek Kerja codes
    getAllAspekKerjaKodes: () => electron_1.ipcRenderer.invoke('aspekKerja:getAllKodes'),
    // Import Blok batch
    importBlokBatch: (data) => electron_1.ipcRenderer.invoke('blok:importBatch', data),
    // Get all Blok codes
    getAllBlokKodes: () => electron_1.ipcRenderer.invoke('blok:getAllKodes'),
    // ORG-1 parsing utilities for Blok mapping
    parseORG1Data: (rawData) => electron_1.ipcRenderer.invoke('blok:parseORG1', rawData),
    mapORG1ToBlok: (org1Data) => electron_1.ipcRenderer.invoke('blok:mapORG1ToBlok', org1Data),
    compareORG1WithBlok: (org1Data) => electron_1.ipcRenderer.invoke('blok:compareORG1WithBlok', org1Data),
    // ============ Kas Transaction ============
    // Get all transactions
    getAllKasTransactions: () => electron_1.ipcRenderer.invoke('kas:getAll'),
    // Get transaction by ID
    getKasTransactionById: (id) => electron_1.ipcRenderer.invoke('kas:getById', id),
    // Create transaction
    createKasTransaction: (input) => electron_1.ipcRenderer.invoke('kas:create', input),
    // Update transaction
    updateKasTransaction: (id, input, updatedBy) => electron_1.ipcRenderer.invoke('kas:update', id, input, updatedBy),
    // Delete transaction
    deleteKasTransaction: (id) => electron_1.ipcRenderer.invoke('kas:delete', id),
    // Clear all Kas data (admin only)
    clearAllKas: () => electron_1.ipcRenderer.invoke('kas:clearAll'),
    // Approve transaction
    approveKasTransaction: (id, input) => electron_1.ipcRenderer.invoke('kas:approve', id, input),
    // Reject transaction
    rejectKasTransaction: (id, input) => electron_1.ipcRenderer.invoke('kas:reject', id, input),
    // Get approval history
    getKasApprovalHistory: (transactionId) => electron_1.ipcRenderer.invoke('kas:getApprovalHistory', transactionId),
    // Get approvers
    getKasApprovers: () => electron_1.ipcRenderer.invoke('kas:getApprovers'),
    // Check approver setup
    checkKasApproverSetup: () => electron_1.ipcRenderer.invoke('kas:checkApproverSetup'),
    // Get Kas balance
    getKasBalance: () => electron_1.ipcRenderer.invoke('kas:getBalance'),
    // Search transactions
    searchKasTransactions: (searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('kas:search', searchTerm, transactionType, status, startDate, endDate),
    // Get transactions with pagination
    getKasWithPagination: (page, pageSize, searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('kas:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate),
    // Get status options
    getKasStatusOptions: () => electron_1.ipcRenderer.invoke('kas:getStatusOptions'),
    // Copy transaction
    copyKasTransaction: (id, createdBy) => electron_1.ipcRenderer.invoke('kas:copy', id, createdBy),
    // Validate COA
    validateKasCOA: (coaId) => electron_1.ipcRenderer.invoke('kas:validateCOA', coaId),
    // Get active COA
    getKasActiveCOA: () => electron_1.ipcRenderer.invoke('kas:getActiveCOA'),
    // Get active Aspek Kerja
    getKasActiveAspekKerja: () => electron_1.ipcRenderer.invoke('kas:getActiveAspekKerja'),
    // Get active Blok
    getKasActiveBlok: () => electron_1.ipcRenderer.invoke('kas:getActiveBlok'),
    // Switch period
    switchKasPeriod: (year, month) => electron_1.ipcRenderer.invoke('kas:switchPeriod', year, month),
    // Get current period
    getKasCurrentPeriod: () => electron_1.ipcRenderer.invoke('kas:getCurrentPeriod'),
    // Import Kas batch
    importKasBatch: (data, createdBy) => electron_1.ipcRenderer.invoke('kas:importBatch', data, createdBy),
    // ============ Bank Transaction ============
    // Get all transactions
    getAllBankTransactions: () => electron_1.ipcRenderer.invoke('bank:getAll'),
    // Get transaction by ID
    getBankTransactionById: (id) => electron_1.ipcRenderer.invoke('bank:getById', id),
    // Create transaction
    createBankTransaction: (input) => electron_1.ipcRenderer.invoke('bank:create', input),
    // Update transaction
    updateBankTransaction: (id, input, updatedBy) => electron_1.ipcRenderer.invoke('bank:update', id, input, updatedBy),
    // Delete transaction
    deleteBankTransaction: (id) => electron_1.ipcRenderer.invoke('bank:delete', id),
    // Clear all Bank data (admin only)
    clearAllBank: () => electron_1.ipcRenderer.invoke('bank:clearAll'),
    // Approve transaction
    approveBankTransaction: (id, input) => electron_1.ipcRenderer.invoke('bank:approve', id, input),
    // Reject transaction
    rejectBankTransaction: (id, input) => electron_1.ipcRenderer.invoke('bank:reject', id, input),
    // Get approval history
    getBankApprovalHistory: (transactionId) => electron_1.ipcRenderer.invoke('bank:getApprovalHistory', transactionId),
    // Get approvers
    getBankApprovers: () => electron_1.ipcRenderer.invoke('bank:getApprovers'),
    // Check approver setup
    checkBankApproverSetup: () => electron_1.ipcRenderer.invoke('bank:checkApproverSetup'),
    // Get Bank balance
    getBankBalance: () => electron_1.ipcRenderer.invoke('bank:getBalance'),
    // Search transactions
    searchBankTransactions: (searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('bank:search', searchTerm, transactionType, status, startDate, endDate),
    // Get transactions with pagination
    getBankWithPagination: (page, pageSize, searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('bank:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate),
    // Get status options
    getBankStatusOptions: () => electron_1.ipcRenderer.invoke('bank:getStatusOptions'),
    // Copy transaction
    copyBankTransaction: (id, createdBy) => electron_1.ipcRenderer.invoke('bank:copy', id, createdBy),
    // Validate COA
    validateBankCOA: (coaId) => electron_1.ipcRenderer.invoke('bank:validateCOA', coaId),
    // Get active COA
    getBankActiveCOA: () => electron_1.ipcRenderer.invoke('bank:getActiveCOA'),
    // Get active Aspek Kerja
    getBankActiveAspekKerja: () => electron_1.ipcRenderer.invoke('bank:getActiveAspekKerja'),
    // Get active Blok
    getBankActiveBlok: () => electron_1.ipcRenderer.invoke('bank:getActiveBlok'),
    // Switch period
    switchBankPeriod: (year, month) => electron_1.ipcRenderer.invoke('bank:switchPeriod', year, month),
    // Get current period
    getBankCurrentPeriod: () => electron_1.ipcRenderer.invoke('bank:getCurrentPeriod'),
    // Import Bank batch
    importBankBatch: (data, createdBy) => electron_1.ipcRenderer.invoke('bank:importBatch', data, createdBy),
    // ============ Gudang Transaction ============
    // Get all transactions
    getAllGudangTransactions: () => electron_1.ipcRenderer.invoke('gudang:getAll'),
    // Get transaction by ID
    getGudangTransactionById: (id) => electron_1.ipcRenderer.invoke('gudang:getById', id),
    // Create transaction
    createGudangTransaction: (input) => electron_1.ipcRenderer.invoke('gudang:create', input),
    // Update transaction
    updateGudangTransaction: (id, input, updatedBy) => electron_1.ipcRenderer.invoke('gudang:update', id, input, updatedBy),
    // Delete transaction
    deleteGudangTransaction: (id) => electron_1.ipcRenderer.invoke('gudang:delete', id),
    // Clear all Gudang data (admin only)
    clearAllGudang: () => electron_1.ipcRenderer.invoke('gudang:clearAll'),
    // Approve transaction
    approveGudangTransaction: (id, input) => electron_1.ipcRenderer.invoke('gudang:approve', id, input),
    // Reject transaction
    rejectGudangTransaction: (id, input) => electron_1.ipcRenderer.invoke('gudang:reject', id, input),
    // Get approval history
    getGudangApprovalHistory: (transactionId) => electron_1.ipcRenderer.invoke('gudang:getApprovalHistory', transactionId),
    // Get approvers
    getGudangApprovers: () => electron_1.ipcRenderer.invoke('gudang:getApprovers'),
    // Check approver setup
    checkGudangApproverSetup: () => electron_1.ipcRenderer.invoke('gudang:checkApproverSetup'),
    // Get Gudang stock
    getGudangStock: () => electron_1.ipcRenderer.invoke('gudang:getStock'),
    // Search transactions
    searchGudangTransactions: (searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('gudang:search', searchTerm, transactionType, status, startDate, endDate),
    // Get transactions with pagination
    getGudangWithPagination: (page, pageSize, searchTerm, transactionType, status, startDate, endDate) => electron_1.ipcRenderer.invoke('gudang:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate),
    // Get status options
    getGudangStatusOptions: () => electron_1.ipcRenderer.invoke('gudang:getStatusOptions'),
    // Copy transaction
    copyGudangTransaction: (id, createdBy) => electron_1.ipcRenderer.invoke('gudang:copy', id, createdBy),
    // Validate COA
    validateGudangCOA: (coaId) => electron_1.ipcRenderer.invoke('gudang:validateCOA', coaId),
    // Get active COA
    getGudangActiveCOA: () => electron_1.ipcRenderer.invoke('gudang:getActiveCOA'),
    // Get active Aspek Kerja
    getGudangActiveAspekKerja: () => electron_1.ipcRenderer.invoke('gudang:getActiveAspekKerja'),
    // Get active Blok
    getGudangActiveBlok: () => electron_1.ipcRenderer.invoke('gudang:getActiveBlok'),
    // Switch period
    switchGudangPeriod: (year, month) => electron_1.ipcRenderer.invoke('gudang:switchPeriod', year, month),
    // Get current period
    getGudangCurrentPeriod: () => electron_1.ipcRenderer.invoke('gudang:getCurrentPeriod'),
    // Import Gudang batch
    importGudangBatch: (data, createdBy) => electron_1.ipcRenderer.invoke('gudang:importBatch', data, createdBy),
    // ============ Sync System ============
    // Initialize sync database
    initSync: () => electron_1.ipcRenderer.invoke('sync:init'),
    // Get all sync configurations
    getAllSyncConfigs: () => electron_1.ipcRenderer.invoke('sync:getAllConfigs'),
    // Get sync config by module
    getSyncConfig: (module) => electron_1.ipcRenderer.invoke('sync:getConfig', module),
    // Save sync config
    saveSyncConfig: (input) => electron_1.ipcRenderer.invoke('sync:saveConfig', input),
    // Delete sync config
    deleteSyncConfig: (module) => electron_1.ipcRenderer.invoke('sync:deleteConfig', module),
    // Check connection status for a module
    checkSyncConnection: (module) => electron_1.ipcRenderer.invoke('sync:checkConnection', module),
    // Check all connections
    checkAllSyncConnections: () => electron_1.ipcRenderer.invoke('sync:checkAllConnections'),
    // Get sync queue count
    getSyncQueueCount: () => electron_1.ipcRenderer.invoke('sync:getQueueCount'),
    // Get pending sync items
    getPendingSyncItems: () => electron_1.ipcRenderer.invoke('sync:getPendingItems'),
    // Add to sync queue
    addToSyncQueue: (module, operation, recordId, data) => electron_1.ipcRenderer.invoke('sync:addToQueue', module, operation, recordId, data),
    // Trigger manual sync
    performSync: (module) => electron_1.ipcRenderer.invoke('sync:performSync', module),
    // Trigger auto-sync (with delay)
    triggerAutoSync: (module) => electron_1.ipcRenderer.invoke('sync:triggerAutoSync', module),
    // Clear sync queue
    clearSyncQueue: () => electron_1.ipcRenderer.invoke('sync:clearQueue'),
    // Get recent conflicts
    getSyncConflicts: (limit) => electron_1.ipcRenderer.invoke('sync:getConflicts', limit),
    // Detect conflict
    detectSyncConflict: (module, recordId, localTimestamp, remoteTimestamp) => electron_1.ipcRenderer.invoke('sync:detectConflict', module, recordId, localTimestamp, remoteTimestamp),
    // ============ Auto-Sync Timer ============
    // Get auto-sync timer status
    getAutoSyncTimerStatus: () => electron_1.ipcRenderer.invoke('autoSyncTimer:getStatus'),
    // Get auto-sync timer configuration
    getAutoSyncTimerConfig: () => electron_1.ipcRenderer.invoke('autoSyncTimer:getConfig'),
    // Set auto-sync timer configuration
    setAutoSyncTimerConfig: (config) => electron_1.ipcRenderer.invoke('autoSyncTimer:setConfig', config),
    // Start auto-sync timer
    startAutoSyncTimer: () => electron_1.ipcRenderer.invoke('autoSyncTimer:start'),
    // Stop auto-sync timer
    stopAutoSyncTimer: () => electron_1.ipcRenderer.invoke('autoSyncTimer:stop'),
    // Pause auto-sync timer
    pauseAutoSyncTimer: () => electron_1.ipcRenderer.invoke('autoSyncTimer:pause'),
    // Resume auto-sync timer
    resumeAutoSyncTimer: () => electron_1.ipcRenderer.invoke('autoSyncTimer:resume'),
    // Reset auto-sync timer
    resetAutoSyncTimer: () => electron_1.ipcRenderer.invoke('autoSyncTimer:reset'),
    // Trigger manual sync
    triggerManualSync: () => electron_1.ipcRenderer.invoke('autoSyncTimer:manualSync'),
    // Listen for auto-sync timer events
    onAutoSyncTimerStatus: (callback) => {
        electron_1.ipcRenderer.on('autoSyncTimer:status', (_event, status) => callback(status));
    },
    onAutoSyncTimerProgress: (callback) => {
        electron_1.ipcRenderer.on('autoSyncTimer:syncProgress', (_event, progress) => callback(progress));
    },
    onAutoSyncTimerResult: (callback) => {
        electron_1.ipcRenderer.on('autoSyncTimer:syncResult', (_event, result) => callback(result));
    },
});
