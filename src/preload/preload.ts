import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  // Admin mode
  setAdminMode: (enabled: boolean) => ipcRenderer.invoke('app:setAdminMode', enabled),
  getAdminMode: () => ipcRenderer.invoke('app:getAdminMode'),

  // DevTools
  toggleDevTools: () => ipcRenderer.invoke('dev:toggleDevTools'),

  // Socket server
  toggleSocketServer: () => ipcRenderer.invoke('socket:toggle'),
  getSocketStatus: () => ipcRenderer.invoke('socket:getStatus'),

  // Logging
  getLogEntries: () => ipcRenderer.invoke('log:getEntries'),

  // Database path
  getDataPath: () => ipcRenderer.invoke('app:getDataPath'),

  // ============ User Management ============

  // Get all users
  getAllUsers: () => ipcRenderer.invoke('user:getAll'),

  // Get user by ID
  getUserById: (userId: string) => ipcRenderer.invoke('user:getById', userId),

  // Get roles
  getRoles: () => ipcRenderer.invoke('user:getRoles'),

  // Create user
  createUser: (username: string, password: string, fullName: string, role: string) =>
    ipcRenderer.invoke('user:create', username, password, fullName, role),

  // Update user
  updateUser: (userId: string, fullName: string, role: string) =>
    ipcRenderer.invoke('user:update', userId, fullName, role),

  // Delete user
  deleteUser: (userId: string, requestingUserId: string) =>
    ipcRenderer.invoke('user:delete', userId, requestingUserId),

  // Clear all non-admin users (admin only)
  clearAllUsers: () => ipcRenderer.invoke('user:clearAll'),

  // Login
  login: (username: string, password: string) =>
    ipcRenderer.invoke('user:login', username, password),

  // Logout
  logout: (token: string, userId: string) =>
    ipcRenderer.invoke('user:logout', token, userId),

  // Validate session
  validateSession: (token: string) =>
    ipcRenderer.invoke('user:validateSession', token),

  // Refresh session
  refreshSession: (token: string) =>
    ipcRenderer.invoke('user:refreshSession', token),

  // Get active sessions
  getActiveSessions: () => ipcRenderer.invoke('user:getActiveSessions'),

  // Terminate session
  terminateSession: (sessionId: string) =>
    ipcRenderer.invoke('user:terminateSession', sessionId),

  // Get activity log
  getActivityLog: (userId?: string, limit?: number) =>
    ipcRenderer.invoke('user:getActivityLog', userId, limit),

  // Change password
  changePassword: (userId: string, oldPassword: string, newPassword: string) =>
    ipcRenderer.invoke('user:changePassword', userId, oldPassword, newPassword),

  // Admin reset password
  adminResetPassword: (adminId: string, targetUserId: string, newPassword: string) =>
    ipcRenderer.invoke('user:adminResetPassword', adminId, targetUserId, newPassword),

  // Validate password strength
  validatePassword: (password: string) =>
    ipcRenderer.invoke('user:validatePassword', password),

  // Export users database
  exportUsersDatabase: (targetPath: string) =>
    ipcRenderer.invoke('user:exportDatabase', targetPath),

  // Import users database
  importUsersDatabase: (sourcePath: string, conflictResolution: 'skip' | 'overwrite' | 'merge') =>
    ipcRenderer.invoke('user:importDatabase', sourcePath, conflictResolution),

  // Get users database path
  getUsersDbPath: () =>
    ipcRenderer.invoke('user:getUsersDbPath'),

  // ============ COA Management ============

  // Get all COA
  getAllCOA: () => ipcRenderer.invoke('coa:getAll'),

  // Get COA by ID
  getCOAById: (id: string) => ipcRenderer.invoke('coa:getById', id),

  // Get COA by Kode
  getCOAByKode: (kode: string) => ipcRenderer.invoke('coa:getByKode', kode),

  // Create COA
  createCOA: (kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    ipcRenderer.invoke('coa:create', kode, nama, tipe, parentId, statusAktif),

  // Update COA
  updateCOA: (id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    ipcRenderer.invoke('coa:update', id, nama, tipe, parentId, statusAktif),

  // Delete COA
  deleteCOA: (id: string) => ipcRenderer.invoke('coa:delete', id),

  // Delete COA with cascade
  deleteCOAWithAspekKerja: (id: string) => ipcRenderer.invoke('coa:deleteWithAspekKerja', id),

  // Clear all COA data (admin only)
  clearAllCOA: () => ipcRenderer.invoke('coa:clearAll'),

  // Clear all Aspek Kerja data (admin only)
  clearAllAspekKerja: () => ipcRenderer.invoke('aspekKerja:clearAll'),

  // Search COA
  searchCOA: (searchTerm: string, tipe?: string, statusAktif?: number) =>
    ipcRenderer.invoke('coa:search', searchTerm, tipe, statusAktif),

  // Get COA by parent
  getCOAByParent: (parentId: string | null) => ipcRenderer.invoke('coa:getByParent', parentId),

  // Get COA with pagination
  getCOAWithPagination: (page: number, pageSize: number, searchTerm?: string, tipe?: string, statusAktif?: number) =>
    ipcRenderer.invoke('coa:getWithPagination', page, pageSize, searchTerm, tipe, statusAktif),

  // Get tipe options
  getCOATipeOptions: () => ipcRenderer.invoke('coa:getTipeOptions'),

  // Get aspek kerja count
  getCOAAspekKerjaCount: (coaId: string) => ipcRenderer.invoke('coa:getAspekKerjaCount', coaId),

  // ============ Aspek Kerja Management ============

  // Get all Aspek Kerja
  getAllAspekKerja: () => ipcRenderer.invoke('aspekKerja:getAll'),

  // Get Aspek Kerja by ID
  getAspekKerjaById: (id: string) => ipcRenderer.invoke('aspekKerja:getById', id),

  // Get Aspek Kerja by Kode
  getAspekKerjaByKode: (kode: string) => ipcRenderer.invoke('aspekKerja:getByKode', kode),

  // Create Aspek Kerja
  createAspekKerja: (kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    ipcRenderer.invoke('aspekKerja:create', kode, nama, coaId, jenis, statusAktif),

  // Update Aspek Kerja
  updateAspekKerja: (id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    ipcRenderer.invoke('aspekKerja:update', id, nama, coaId, jenis, statusAktif),

  // Delete Aspek Kerja
  deleteAspekKerja: (id: string) => ipcRenderer.invoke('aspekKerja:delete', id),

  // Search Aspek Kerja
  searchAspekKerja: (searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) =>
    ipcRenderer.invoke('aspekKerja:search', searchTerm, jenis, coaId, statusAktif),

  // Get Aspek Kerja with pagination
  getAspekKerjaWithPagination: (page: number, pageSize: number, searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) =>
    ipcRenderer.invoke('aspekKerja:getWithPagination', page, pageSize, searchTerm, jenis, coaId, statusAktif),

  // Get active COA for dropdown
  getActiveCOA: () => ipcRenderer.invoke('aspekKerja:getActiveCOA'),

  // ============ Blok Management ============

  // Get all Blok
  getAllBlok: () => ipcRenderer.invoke('blok:getAll'),

  // Get Blok by ID
  getBlokById: (id: string) => ipcRenderer.invoke('blok:getById', id),

  // Get Blok by Kode
  getBlokByKode: (kodeBlok: string) => ipcRenderer.invoke('blok:getByKode', kodeBlok),

  // Create Blok
  createBlok: (kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    ipcRenderer.invoke('blok:create', kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),

  // Update Blok
  updateBlok: (id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    ipcRenderer.invoke('blok:update', id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),

  // Delete Blok
  deleteBlok: (id: string) => ipcRenderer.invoke('blok:delete', id),

  // Clear all Blok (admin only)
  clearAllBlok: () => ipcRenderer.invoke('blok:clearAll'),

  // Search Blok
  searchBlok: (searchTerm?: string, tahunTanam?: number, status?: string) =>
    ipcRenderer.invoke('blok:search', searchTerm, tahunTanam, status),

  // Get Blok with pagination
  getBlokWithPagination: (page: number, pageSize: number, searchTerm?: string, tahunTanam?: number, status?: string) =>
    ipcRenderer.invoke('blok:getWithPagination', page, pageSize, searchTerm, tahunTanam, status),

  // Get status options
  getBlokStatusOptions: () => ipcRenderer.invoke('blok:getStatusOptions'),

  // Get available years for filter
  getBlokAvailableYears: () => ipcRenderer.invoke('blok:getAvailableYears'),

  // ============ Import/Export IPC ============

  // Show save dialog for export
  showSaveDialog: (defaultName: string) => ipcRenderer.invoke('dialog:showSave', defaultName),
  // Show open dialog for import
  showOpenDialog: (title: string) => ipcRenderer.invoke('dialog:showOpen', title),
  // Read Excel file via main process
  readExcelFile: (filePath: string) => ipcRenderer.invoke('excel:readFile', filePath),

  // Import COA batch
  importCOABatch: (data: Array<{ kode: string; nama: string; tipe: string; parent_kode?: string; status_aktif?: number }>) =>
    ipcRenderer.invoke('coa:importBatch', data),

  // Get all COA codes
  getAllCOAKodes: () => ipcRenderer.invoke('coa:getAllKodes'),

  // Import Aspek Kerja batch
  importAspekKerjaBatch: (data: Array<{ kode: string; nama: string; coa_kode?: string; jenis?: string; status_aktif?: number }>) =>
    ipcRenderer.invoke('aspekKerja:importBatch', data),

  // Get all Aspek Kerja codes
  getAllAspekKerjaKodes: () => ipcRenderer.invoke('aspekKerja:getAllKodes'),

  // Import Blok batch
  importBlokBatch: (data: Array<{ kode_blok: string; nama: string; tahun_tanam: string | number; luas: string | number; pokok?: number | null; sph?: number | null; bulan_tanam?: string | null; status_tanaman_2025?: string | null; status_tanaman_2026?: string | null; status_tanaman_2027?: string | null; keterangan?: string }>) =>
    ipcRenderer.invoke('blok:importBatch', data),

  // Get all Blok codes
  getAllBlokKodes: () => ipcRenderer.invoke('blok:getAllKodes'),

  // ORG-1 parsing utilities for Blok mapping
  parseORG1Data: (rawData: Array<Record<string, unknown>>) => 
    ipcRenderer.invoke('blok:parseORG1', rawData),
  mapORG1ToBlok: (org1Data: Array<{ costCentre: string; kodeGL: string; namaAkun: string; tahunTanam: number | null; blokKode: string | null; status: string | null }>) =>
    ipcRenderer.invoke('blok:mapORG1ToBlok', org1Data),
  compareORG1WithBlok: (org1Data: Array<{ costCentre: string; kodeGL: string; namaAkun: string; tahunTanam: number | null; blokKode: string | null; status: string | null }>) =>
    ipcRenderer.invoke('blok:compareORG1WithBlok', org1Data),

  // ============ Kas Transaction ============

  // Get all transactions
  getAllKasTransactions: () => ipcRenderer.invoke('kas:getAll'),

  // Get transaction by ID
  getKasTransactionById: (id: string) => ipcRenderer.invoke('kas:getById', id),

  // Create transaction
  createKasTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    created_by: string;
  }) => ipcRenderer.invoke('kas:create', input),

  // Update transaction
  updateKasTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('kas:update', id, input, updatedBy),

  // Delete transaction
  deleteKasTransaction: (id: string) => ipcRenderer.invoke('kas:delete', id),

  // Clear all Kas data (admin only)
  clearAllKas: () => ipcRenderer.invoke('kas:clearAll'),

  // Approve transaction
  approveKasTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    ipcRenderer.invoke('kas:approve', id, input),

  // Reject transaction
  rejectKasTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    ipcRenderer.invoke('kas:reject', id, input),

  // Get approval history
  getKasApprovalHistory: (transactionId: string) => ipcRenderer.invoke('kas:getApprovalHistory', transactionId),

  // Get approvers
  getKasApprovers: () => ipcRenderer.invoke('kas:getApprovers'),

  // Check approver setup
  checkKasApproverSetup: () => ipcRenderer.invoke('kas:checkApproverSetup'),

  // Get Kas balance
  getKasBalance: () => ipcRenderer.invoke('kas:getBalance'),

  // Search transactions
  searchKasTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('kas:search', searchTerm, transactionType, status, startDate, endDate),

  // Get transactions with pagination
  getKasWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('kas:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate),

  // Get status options
  getKasStatusOptions: () => ipcRenderer.invoke('kas:getStatusOptions'),

  // Copy transaction
  copyKasTransaction: (id: string, createdBy: string) => ipcRenderer.invoke('kas:copy', id, createdBy),

  // Validate COA
  validateKasCOA: (coaId: string | null) => ipcRenderer.invoke('kas:validateCOA', coaId),

  // Get active COA
  getKasActiveCOA: () => ipcRenderer.invoke('kas:getActiveCOA'),

  // Get active Aspek Kerja
  getKasActiveAspekKerja: () => ipcRenderer.invoke('kas:getActiveAspekKerja'),

  // Get active Blok
  getKasActiveBlok: () => ipcRenderer.invoke('kas:getActiveBlok'),

  // Switch period
  switchKasPeriod: (year: number, month: number) => ipcRenderer.invoke('kas:switchPeriod', year, month),

  // Get current period
  getKasCurrentPeriod: () => ipcRenderer.invoke('kas:getCurrentPeriod'),

  // Import Kas batch
  importKasBatch: (data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    created_by_name?: string;
  }>, createdBy: string) => ipcRenderer.invoke('kas:importBatch', data, createdBy),

  // ============ Bank Transaction ============

  // Get all transactions
  getAllBankTransactions: () => ipcRenderer.invoke('bank:getAll'),

  // Get transaction by ID
  getBankTransactionById: (id: string) => ipcRenderer.invoke('bank:getById', id),

  // Create transaction
  createBankTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    bank_account: string | null;
    created_by: string;
  }) => ipcRenderer.invoke('bank:create', input),

  // Update transaction
  updateBankTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    bank_account?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('bank:update', id, input, updatedBy),

  // Delete transaction
  deleteBankTransaction: (id: string) => ipcRenderer.invoke('bank:delete', id),

  // Clear all Bank data (admin only)
  clearAllBank: () => ipcRenderer.invoke('bank:clearAll'),

  // Approve transaction
  approveBankTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    ipcRenderer.invoke('bank:approve', id, input),

  // Reject transaction
  rejectBankTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    ipcRenderer.invoke('bank:reject', id, input),

  // Get approval history
  getBankApprovalHistory: (transactionId: string) => ipcRenderer.invoke('bank:getApprovalHistory', transactionId),

  // Get approvers
  getBankApprovers: () => ipcRenderer.invoke('bank:getApprovers'),

  // Check approver setup
  checkBankApproverSetup: () => ipcRenderer.invoke('bank:checkApproverSetup'),

  // Get Bank balance
  getBankBalance: () => ipcRenderer.invoke('bank:getBalance'),

  // Search transactions
  searchBankTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('bank:search', searchTerm, transactionType, status, startDate, endDate),

  // Get transactions with pagination
  getBankWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) =>
    ipcRenderer.invoke('bank:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate, syncStatusFilter),

  // Get status options
  getBankStatusOptions: () => ipcRenderer.invoke('bank:getStatusOptions'),

  // Copy transaction
  copyBankTransaction: (id: string, createdBy: string) => ipcRenderer.invoke('bank:copy', id, createdBy),

  // Validate COA
  validateBankCOA: (coaId: string | null) => ipcRenderer.invoke('bank:validateCOA', coaId),

  // Get active COA
  getBankActiveCOA: () => ipcRenderer.invoke('bank:getActiveCOA'),

  // Get active Aspek Kerja
  getBankActiveAspekKerja: () => ipcRenderer.invoke('bank:getActiveAspekKerja'),

  // Get active Blok
  getBankActiveBlok: () => ipcRenderer.invoke('bank:getActiveBlok'),

  // Switch period
  switchBankPeriod: (year: number, month: number) => ipcRenderer.invoke('bank:switchPeriod', year, month),

  // Get current period
  getBankCurrentPeriod: () => ipcRenderer.invoke('bank:getCurrentPeriod'),

  // Import Bank batch
  importBankBatch: (data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    bank_account?: string;
    created_by_name?: string;
  }>, createdBy: string) => ipcRenderer.invoke('bank:importBatch', data, createdBy),

  // ============ Gudang Transaction ============

  // Get all transactions
  getAllGudangTransactions: () => ipcRenderer.invoke('gudang:getAll'),

  // Get transaction by ID
  getGudangTransactionById: (id: string) => ipcRenderer.invoke('gudang:getById', id),

  // Create transaction
  createGudangTransaction: (input: {
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
  }) => ipcRenderer.invoke('gudang:create', input),

  // Update transaction
  updateGudangTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    item_name?: string | null;
    item_unit?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('gudang:update', id, input, updatedBy),

  // Delete transaction
  deleteGudangTransaction: (id: string) => ipcRenderer.invoke('gudang:delete', id),

  // Clear all Gudang data (admin only)
  clearAllGudang: () => ipcRenderer.invoke('gudang:clearAll'),

  // Approve transaction
  approveGudangTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    ipcRenderer.invoke('gudang:approve', id, input),

  // Reject transaction
  rejectGudangTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    ipcRenderer.invoke('gudang:reject', id, input),

  // Get approval history
  getGudangApprovalHistory: (transactionId: string) => ipcRenderer.invoke('gudang:getApprovalHistory', transactionId),

  // Get approvers
  getGudangApprovers: () => ipcRenderer.invoke('gudang:getApprovers'),

  // Check approver setup
  checkGudangApproverSetup: () => ipcRenderer.invoke('gudang:checkApproverSetup'),

  // Get Gudang stock
  getGudangStock: () => ipcRenderer.invoke('gudang:getStock'),

  // Search transactions
  searchGudangTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('gudang:search', searchTerm, transactionType, status, startDate, endDate),

  // Get transactions with pagination
  getGudangWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) =>
    ipcRenderer.invoke('gudang:getWithPagination', page, pageSize, searchTerm, transactionType, status, startDate, endDate, syncStatusFilter),

  // Get status options
  getGudangStatusOptions: () => ipcRenderer.invoke('gudang:getStatusOptions'),

  // Copy transaction
  copyGudangTransaction: (id: string, createdBy: string) => ipcRenderer.invoke('gudang:copy', id, createdBy),

  // Validate COA
  validateGudangCOA: (coaId: string | null) => ipcRenderer.invoke('gudang:validateCOA', coaId),

  // Get active COA
  getGudangActiveCOA: () => ipcRenderer.invoke('gudang:getActiveCOA'),

  // Get active Aspek Kerja
  getGudangActiveAspekKerja: () => ipcRenderer.invoke('gudang:getActiveAspekKerja'),

  // Get active Blok
  getGudangActiveBlok: () => ipcRenderer.invoke('gudang:getActiveBlok'),

  // Switch period
  switchGudangPeriod: (year: number, month: number) => ipcRenderer.invoke('gudang:switchPeriod', year, month),

  // Get current period
  getGudangCurrentPeriod: () => ipcRenderer.invoke('gudang:getCurrentPeriod'),

  // Import Gudang batch
  importGudangBatch: (data: Array<{
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
  }>, createdBy: string) => ipcRenderer.invoke('gudang:importBatch', data, createdBy),

  // ============ Revision Workflow ============
  createRevisionRequest: (module: 'kas' | 'bank' | 'gudang', input: {
    transaction_id: string;
    revision_reason: string;
    proposed_transaction_date?: string;
    proposed_transaction_type?: string;
    proposed_amount?: number;
    proposed_description?: string;
    proposed_coa_id?: string | null;
    proposed_aspek_kerja_id?: string | null;
    proposed_blok_id?: string | null;
    proposed_bank_account?: string | null;
    proposed_item_name?: string | null;
    proposed_item_unit?: string | null;
  }) => ipcRenderer.invoke('revision:create', module, input),
  getRevisionRequest: (module: 'kas' | 'bank' | 'gudang', transactionId: string) =>
    ipcRenderer.invoke('revision:get', module, transactionId),
  hasPendingRevision: (module: 'kas' | 'bank' | 'gudang', transactionId: string) =>
    ipcRenderer.invoke('revision:hasPending', module, transactionId),
  getPendingRevisionCount: (module: 'kas' | 'bank' | 'gudang') =>
    ipcRenderer.invoke('revision:getPendingCount', module),

  // Get pending revisions from all modules
  getPendingRevisions: (filters?: {
    module?: 'kas' | 'bank' | 'gudang';
    transactionId?: string;
  }) => ipcRenderer.invoke('revision:getPendingRevisions', filters),

  // Get revision by ID
  getRevisionById: (revisionId: string) =>
    ipcRenderer.invoke('revision:getById', revisionId),

  // Get all revisions for a transaction
  getRevisionsForTransaction: (module: 'kas' | 'bank' | 'gudang', transactionId: string) =>
    ipcRenderer.invoke('revision:getForTransaction', module, transactionId),

  // Approve revision
  approveRevision: (revisionId: string, input: { approver_id: string; approver_name: string }) =>
    ipcRenderer.invoke('revision:approve', revisionId, input),

  // Reject revision
  rejectRevision: (revisionId: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    ipcRenderer.invoke('revision:reject', revisionId, input),

  // Cancel revision (by requester)
  cancelRevision: (revisionId: string, cancelledBy: string) =>
    ipcRenderer.invoke('revision:cancel', revisionId, cancelledBy),

  // Get revision counts for summary
  getRevisionCounts: () => ipcRenderer.invoke('revision:getCounts'),

  // ============ Sync System ============

  // Initialize sync database
  initSync: () => ipcRenderer.invoke('sync:init'),

  // Get all sync configurations
  getAllSyncConfigs: () => ipcRenderer.invoke('sync:getAllConfigs'),

  // Get sync config by module
  getSyncConfig: (module: string) => ipcRenderer.invoke('sync:getConfig', module),

  // Save sync config
  saveSyncConfig: (input: { module: string; remotePath: string; enabled: boolean }) =>
    ipcRenderer.invoke('sync:saveConfig', input),

  // Delete sync config
  deleteSyncConfig: (module: string) => ipcRenderer.invoke('sync:deleteConfig', module),

  // Check connection status for a module
  checkSyncConnection: (module: string) => ipcRenderer.invoke('sync:checkConnection', module),

  // Check all connections
  checkAllSyncConnections: () => ipcRenderer.invoke('sync:checkAllConnections'),

  // Get sync queue count
  getSyncQueueCount: () => ipcRenderer.invoke('sync:getQueueCount'),

  // Get per-module sync status summary (for VAL-UI-008)
  getModuleSyncStatus: () => ipcRenderer.invoke('sync:getModuleSyncStatus'),

  // Get pending sync items
  getPendingSyncItems: () => ipcRenderer.invoke('sync:getPendingItems'),

  // Add to sync queue
  addToSyncQueue: (module: string, operation: 'create' | 'update' | 'delete', recordId: string, data: Record<string, unknown>) =>
    ipcRenderer.invoke('sync:addToQueue', module, operation, recordId, data),

  // Trigger manual sync
  performSync: (module: string) => ipcRenderer.invoke('sync:performSync', module),

  // Trigger auto-sync (with delay)
  triggerAutoSync: (module: string) => ipcRenderer.invoke('sync:triggerAutoSync', module),

  // Clear sync queue
  clearSyncQueue: () => ipcRenderer.invoke('sync:clearQueue'),

  // Get recent conflicts
  getSyncConflicts: (limit?: number) => ipcRenderer.invoke('sync:getConflicts', limit),

  // Detect conflict
  detectSyncConflict: (module: string, recordId: string, localTimestamp: string, remoteTimestamp: string) =>
    ipcRenderer.invoke('sync:detectConflict', module, recordId, localTimestamp, remoteTimestamp),

  // ============ Conflict Resolution IPC Handlers ============

  // Get pending conflicts that need manual resolution
  getPendingSyncConflicts: (module?: string) => ipcRenderer.invoke('sync:getPendingConflicts', module),

  // Get a specific conflict by ID
  getSyncConflictById: (id: string) => ipcRenderer.invoke('sync:getConflictById', id),

  // Resolve a conflict manually
  resolveSyncConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merged', resolvedData?: Record<string, unknown>) =>
    ipcRenderer.invoke('sync:resolveConflict', conflictId, resolution, resolvedData),

  // Discard a conflict
  discardSyncConflict: (conflictId: string) => ipcRenderer.invoke('sync:discardConflict', conflictId),

  // Get conflict statistics
  getSyncConflictStats: () => ipcRenderer.invoke('sync:getConflictStats'),

  // Get sync history (VAL-UI-009)
  getSyncHistory: (page?: number, pageSize?: number, filter?: {
    startDate?: string;
    endDate?: string;
    module?: string;
    direction?: 'up' | 'down';
    status?: 'success' | 'partial' | 'failed';
  }) => ipcRenderer.invoke('sync:getSyncHistory', page, pageSize, filter),

  // ============ Transaction Sync Status (F012-BE) ============
  // Get sync status for a transaction
  getTransactionSyncStatus: (module: 'kas' | 'bank' | 'gudang', recordId: string) =>
    ipcRenderer.invoke('sync:getTransactionSyncStatus', module, recordId),

  // Get all transactions with sync status for a module
  getTransactionsWithSyncStatus: (module: 'kas' | 'bank' | 'gudang') =>
    ipcRenderer.invoke('sync:getTransactionsWithSyncStatus', module),

  // Update transaction sync status (internal use)
  updateTransactionSyncStatus: (module: 'kas' | 'bank' | 'gudang', recordId: string, status: 'synced' | 'pending' | 'failed' | 'conflict', errorMessage?: string) =>
    ipcRenderer.invoke('sync:updateTransactionSyncStatus', module, recordId, status, errorMessage),

  // Reset transaction sync status for retry
  resetTransactionSyncStatus: (module: 'kas' | 'bank' | 'gudang', recordId: string) =>
    ipcRenderer.invoke('sync:resetTransactionSyncStatus', module, recordId),

  // Listen for sync status change events from main process
  onSyncStatusChange: (callback: (data: {
    id: string;
    module: 'kas' | 'bank' | 'gudang';
    recordId: string;
    syncStatus: 'synced' | 'pending' | 'failed' | 'conflict' | 'in_progress';
    syncAttempts: number;
    lastSyncAt: string | null;
    syncError: string | null;
  }) => void) => {
    ipcRenderer.on('sync:transactionStatusChanged', (_event, data) => callback(data));
  },
  offSyncStatusChange: () => {
    ipcRenderer.removeAllListeners('sync:transactionStatusChanged');
  },

  // ============ Sync Health Dashboard (F014-BE) ============

  // Get sync statistics - accurate counts (pending, failed, total)
  getSyncHealthStats: () => ipcRenderer.invoke('syncHealth:getStats'),

  // Get per-module sync status breakdown
  getSyncHealthModuleSyncStatus: () => ipcRenderer.invoke('syncHealth:getModuleSyncStatus'),

  // Get list of failed items with retry information
  getSyncHealthFailedItems: (options?: {
    module?: string;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke('syncHealth:getFailedItems', options),

  // Retry a single failed item
  retrySyncHealthFailedItem: (itemId: string) => ipcRenderer.invoke('syncHealth:retryFailedItem', itemId),

  // Retry all failed items
  retrySyncHealthAllFailed: () => ipcRenderer.invoke('syncHealth:retryAllFailed'),

  // Get retry configuration info
  getSyncHealthRetryConfig: () => ipcRenderer.invoke('syncHealth:getRetryConfig'),

  // Get queue health status
  getSyncHealthQueueHealth: () => ipcRenderer.invoke('syncHealth:getQueueHealth'),

  // Get comprehensive health dashboard data
  getSyncHealthDashboardData: () => ipcRenderer.invoke('syncHealth:getHealthDashboardData'),

  // ============ Local-First Operations ============

  // Get sync queue status
  localFirstGetSyncQueueStatus: () => ipcRenderer.invoke('localFirst:getSyncQueueStatus'),

  // Check if module has pending sync operations
  localFirstHasPendingSyncForModule: (module: string) => 
    ipcRenderer.invoke('localFirst:hasPendingSyncForModule', module),

  // Get pending sync count for module
  localFirstGetPendingSyncCountForModule: (module: string) => 
    ipcRenderer.invoke('localFirst:getPendingSyncCountForModule', module),

  // Create Kas transaction (local-first with sync queue)
  localFirstCreateKasTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    created_by: string;
  }) => ipcRenderer.invoke('localFirst:kas:create', input),

  // Update Kas transaction (local-first with sync queue)
  localFirstUpdateKasTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('localFirst:kas:update', id, input, updatedBy),

  // Delete Kas transaction (local-first with sync queue, soft delete)
  localFirstDeleteKasTransaction: (id: string) => ipcRenderer.invoke('localFirst:kas:delete', id),

  // Create Bank transaction (local-first with sync queue)
  localFirstCreateBankTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    bank_account: string | null;
    created_by: string;
  }) => ipcRenderer.invoke('localFirst:bank:create', input),

  // Update Bank transaction (local-first with sync queue)
  localFirstUpdateBankTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    bank_account?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('localFirst:bank:update', id, input, updatedBy),

  // Delete Bank transaction (local-first with sync queue, soft delete)
  localFirstDeleteBankTransaction: (id: string) => ipcRenderer.invoke('localFirst:bank:delete', id),

  // Create Gudang transaction (local-first with sync queue)
  localFirstCreateGudangTransaction: (input: {
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
  }) => ipcRenderer.invoke('localFirst:gudang:create', input),

  // Update Gudang transaction (local-first with sync queue)
  localFirstUpdateGudangTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    item_name?: string | null;
    item_unit?: string | null;
  }, updatedBy: string) => ipcRenderer.invoke('localFirst:gudang:update', id, input, updatedBy),

  // Delete Gudang transaction (local-first with sync queue, soft delete)
  localFirstDeleteGudangTransaction: (id: string) => ipcRenderer.invoke('localFirst:gudang:delete', id),

  // ============ COA Local-First Operations ============

  // Create COA (local-first with sync queue)
  localFirstCreateCOA: (kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    ipcRenderer.invoke('localFirst:coa:create', kode, nama, tipe, parentId, statusAktif),

  // Update COA (local-first with sync queue)
  localFirstUpdateCOA: (id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    ipcRenderer.invoke('localFirst:coa:update', id, nama, tipe, parentId, statusAktif),

  // Delete COA (local-first with sync queue, soft delete)
  localFirstDeleteCOA: (id: string) => ipcRenderer.invoke('localFirst:coa:delete', id),

  // ============ Blok Local-First Operations ============

  // Create Blok (local-first with sync queue)
  localFirstCreateBlok: (kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    ipcRenderer.invoke('localFirst:blok:create', kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),

  // Update Blok (local-first with sync queue)
  localFirstUpdateBlok: (id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    ipcRenderer.invoke('localFirst:blok:update', id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027),

  // Delete Blok (local-first with sync queue, soft delete)
  localFirstDeleteBlok: (id: string) => ipcRenderer.invoke('localFirst:blok:delete', id),

  // ============ Aspek Kerja Local-First Operations ============

  // Create Aspek Kerja (local-first with sync queue)
  localFirstCreateAspekKerja: (kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    ipcRenderer.invoke('localFirst:aspekKerja:create', kode, nama, coaId, jenis, statusAktif),

  // Update Aspek Kerja (local-first with sync queue)
  localFirstUpdateAspekKerja: (id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    ipcRenderer.invoke('localFirst:aspekKerja:update', id, nama, coaId, jenis, statusAktif),

  // Delete Aspek Kerja (local-first with sync queue, soft delete)
  localFirstDeleteAspekKerja: (id: string) => ipcRenderer.invoke('localFirst:aspekKerja:delete', id),

  // ============ Auto-Sync Timer ============

  // Get auto-sync timer status
  getAutoSyncTimerStatus: () => ipcRenderer.invoke('autoSyncTimer:getStatus'),

  // Get auto-sync timer configuration
  getAutoSyncTimerConfig: () => ipcRenderer.invoke('autoSyncTimer:getConfig'),

  // Set auto-sync timer configuration
  setAutoSyncTimerConfig: (config: {
    intervalMs?: number;
    enabled?: boolean;
    modules?: string[];
    minIntervalMs?: number;
  }) => ipcRenderer.invoke('autoSyncTimer:setConfig', config),

  // Start auto-sync timer
  startAutoSyncTimer: () => ipcRenderer.invoke('autoSyncTimer:start'),

  // Stop auto-sync timer
  stopAutoSyncTimer: () => ipcRenderer.invoke('autoSyncTimer:stop'),

  // Pause auto-sync timer
  pauseAutoSyncTimer: () => ipcRenderer.invoke('autoSyncTimer:pause'),

  // Resume auto-sync timer
  resumeAutoSyncTimer: () => ipcRenderer.invoke('autoSyncTimer:resume'),

  // Reset auto-sync timer
  resetAutoSyncTimer: () => ipcRenderer.invoke('autoSyncTimer:reset'),

  // Trigger manual sync
  triggerManualSync: () => ipcRenderer.invoke('autoSyncTimer:manualSync'),

  // Listen for auto-sync timer events
  onAutoSyncTimerStatus: (callback: (status: unknown) => void) => {
    ipcRenderer.on('autoSyncTimer:status', (_event, status) => callback(status));
  },
  offAutoSyncTimerStatus: () => {
    ipcRenderer.removeAllListeners('autoSyncTimer:status');
  },

  onAutoSyncTimerProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on('autoSyncTimer:syncProgress', (_event, progress) => callback(progress));
  },
  offAutoSyncTimerProgress: () => {
    ipcRenderer.removeAllListeners('autoSyncTimer:syncProgress');
  },

  onAutoSyncTimerResult: (callback: (result: unknown) => void) => {
    ipcRenderer.on('autoSyncTimer:syncResult', (_event, result) => callback(result));
  },
  offAutoSyncTimerResult: () => {
    ipcRenderer.removeAllListeners('autoSyncTimer:syncResult');
  },

  // ============ Network Status ============

  // Get current network status
  getNetworkStatus: () => ipcRenderer.invoke('networkStatus:getStatus'),

  // Check network connectivity now
  checkNetworkStatus: () => ipcRenderer.invoke('networkStatus:checkNow'),

  // Get connection quality
  getNetworkConnectionQuality: () => ipcRenderer.invoke('networkStatus:getConnectionQuality'),

  // Check for captive portal
  checkCaptivePortal: () => ipcRenderer.invoke('networkStatus:checkCaptivePortal'),

  // Check if online
  isNetworkOnline: () => ipcRenderer.invoke('networkStatus:isOnline'),

  // Set network status configuration
  setNetworkStatusConfig: (config: {
    checkUrl?: string;
    checkTimeoutMs?: number;
    maxConsecutiveFailures?: number;
    checkIntervalMs?: number;
    detectCaptivePortal?: boolean;
    captivePortalCheckUrl?: string;
  }) => ipcRenderer.invoke('networkStatus:setConfig', config),

  // Listen for network status changes
  onNetworkStatusChange: (callback: (status: unknown) => void) => {
    ipcRenderer.on('networkStatus:changed', (_event, status) => callback(status));
  },
  offNetworkStatusChange: () => {
    ipcRenderer.removeAllListeners('networkStatus:changed');
  },

  // Listen for network status sync control (pause/resume)
  onNetworkStatusSyncControl: (callback: (data: { command: string; networkStatus: unknown }) => void) => {
    ipcRenderer.on('networkStatus:syncControl', (_event, data) => callback(data));
  },
  offNetworkStatusSyncControl: () => {
    ipcRenderer.removeAllListeners('networkStatus:syncControl');
  },

  // ============ Dashboard Approval ============

  // Get all pending approvals from all modules
  getDashboardPendingApprovals: (filters?: {
    module?: 'kas' | 'bank' | 'gudang';
    status?: string;
    searchTerm?: string;
  }) => ipcRenderer.invoke('dashboard:getPendingApprovals', filters),

  // Get approval counts for summary cards
  getDashboardApprovalCounts: () => ipcRenderer.invoke('dashboard:getApprovalCounts'),

  // Approve transaction from dashboard
  approveFromDashboard: (module: 'kas' | 'bank' | 'gudang', transactionId: string, input: { approver_id: string; approver_name: string }) =>
    ipcRenderer.invoke('dashboard:approve', module, transactionId, input),

  // Reject transaction from dashboard
  rejectFromDashboard: (module: 'kas' | 'bank' | 'gudang', transactionId: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    ipcRenderer.invoke('dashboard:reject', module, transactionId, input),

  // Get transaction details from dashboard
  getDashboardTransaction: (module: 'kas' | 'bank' | 'gudang', transactionId: string) =>
    ipcRenderer.invoke('dashboard:getTransaction', module, transactionId),

  // Get approval history for a transaction
  getDashboardApprovalHistory: (module: 'kas' | 'bank' | 'gudang', transactionId: string) =>
    ipcRenderer.invoke('dashboard:getApprovalHistory', module, transactionId),
});
