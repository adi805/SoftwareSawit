// Type declarations for window.electronAPI

interface User {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  last_activity: string;
  expires_at: string;
}

interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string;
  parent_id: string | null;
  parent_kode?: string;
  parent_nama?: string;
  status_aktif: number;
  aspek_kerja_count?: number;
  created_at: string;
  updated_at: string;
}

interface COAPaginationResult {
  data: COA[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Blok {
  id: string;
  kode_blok: string;
  nama: string;
  tahun_tanam: number;
  luas: number;
  status: string;
  keterangan: string | null;
  pokok: number | null;       // NEW
  sph: number | null;         // NEW
  bulan_tanam: string | null; // NEW
  status_tanaman_2025: string | null; // Status for year 2025
  status_tanaman_2026: string | null; // Status for year 2026
  status_tanaman_2027: string | null; // Status for year 2027
  created_at: string;
  updated_at: string;
}

interface BlokPaginationResult {
  data: Blok[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface AspekKerja {
  id: string;
  kode: string;
  nama: string;
  coa_id: string | null;
  jenis: string;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface AspekKerjaWithCOA extends AspekKerja {
  coa_kode?: string;
  coa_nama?: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
  value: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  importedCount: number;
  errors: ImportError[];
}

// Kas Transaction types
interface KasTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Kas Masuk' | 'Kas Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  approver_1_id: string | null;
  approver_1_name: string | null;
  approver_1_at: string | null;
  approver_2_id: string | null;
  approver_2_name: string | null;
  approver_2_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  // Sync status fields (F011-UI)
  sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
  last_sync_at?: string | null;
}

interface KasTransactionWithDetails extends KasTransaction {
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface ApprovalHistoryEntry {
  id: string;
  transaction_id: string;
  action: 'created' | 'approved_1' | 'approved_2' | 'rejected' | 'edited';
  user_id: string;
  user_name: string;
  action_at: string;
  notes: string | null;
}

interface KasBalance {
  kasMasuk: number;
  kasKeluar: number;
  balance: number;
}

interface ApproverSetupStatus {
  complete: boolean;
  approverCount: number;
  message: string;
}

interface KasPaginationResult {
  data: KasTransactionWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Bank Transaction types
interface BankTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Bank Masuk' | 'Bank Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  bank_account: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  approver_1_id: string | null;
  approver_1_name: string | null;
  approver_1_at: string | null;
  approver_2_id: string | null;
  approver_2_name: string | null;
  approver_2_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  // Sync status fields (F011-UI)
  sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
  last_sync_at?: string | null;
}

interface BankTransactionWithDetails extends BankTransaction {
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface BankBalance {
  bankMasuk: number;
  bankKeluar: number;
  balance: number;
}

interface BankPaginationResult {
  data: BankTransactionWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Gudang Transaction types
interface GudangTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Gudang Masuk' | 'Gudang Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  approver_1_id: string | null;
  approver_1_name: string | null;
  approver_1_at: string | null;
  approver_2_id: string | null;
  approver_2_name: string | null;
  approver_2_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  // Sync status fields (F011-UI)
  sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
  last_sync_at?: string | null;
}

interface GudangTransactionWithDetails extends GudangTransaction {
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface GudangStock {
  gudangMasuk: number;
  gudangKeluar: number;
  stock: number;
}

interface GudangPaginationResult {
  data: GudangTransactionWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Revision Transaction interface
interface RevisionTransaction {
  id: string;
  transaction_id: string;
  module: 'kas' | 'bank' | 'gudang';
  status: 'Pending Revision Approval 1' | 'Pending Revision Approval 2' | 'Approved' | 'Rejected' | 'Cancelled';
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
  // Original values (snapshot before revision)
  original_transaction_number: string;
  original_transaction_date: string;
  original_transaction_type: string;
  original_amount: number;
  original_description: string | null;
  original_coa_id: string | null;
  original_aspek_kerja_id: string | null;
  original_blok_id: string | null;
  original_bank_account: string | null;
  original_item_name: string | null;
  original_item_unit: string | null;
  // Proposed values (changes)
  proposed_transaction_date: string | null;
  proposed_transaction_type: string | null;
  proposed_amount: number | null;
  proposed_description: string | null;
  proposed_coa_id: string | null;
  proposed_aspek_kerja_id: string | null;
  proposed_blok_id: string | null;
  proposed_bank_account: string | null;
  proposed_item_name: string | null;
  proposed_item_unit: string | null;
}

interface ElectronAPI {
  // App info
  getAppInfo: () => Promise<{
    version: string;
    electron: string;
    node: string;
    platform: string;
    socketPort: number;
  }>;

  // Admin mode
  setAdminMode: (enabled: boolean) => Promise<boolean>;
  getAdminMode: () => Promise<boolean>;

  // DevTools
  toggleDevTools: () => Promise<boolean>;

  // Socket server
  toggleSocketServer: () => Promise<boolean>;
  getSocketStatus: () => Promise<{
    running: boolean;
    port: number;
  }>;

  // Logging
  getLogEntries: () => Promise<Array<{
    timestamp: string;
    level: string;
    message: string;
  }>>;

  // Database path
  getDataPath: () => Promise<string>;

  // ============ User Management ============
  getAllUsers: () => Promise<User[]>;
  getUserById: (userId: string) => Promise<User | null>;
  getRoles: () => Promise<string[]>;
  createUser: (username: string, password: string, fullName: string, role: string) =>
    Promise<{ success: boolean; message: string; user?: User }>;
  updateUser: (userId: string, fullName: string, role: string) =>
    Promise<{ success: boolean; message: string }>;
  deleteUser: (userId: string, requestingUserId: string) =>
    Promise<{ success: boolean; message: string }>;
  clearAllUsers: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  login: (username: string, password: string) =>
    Promise<{ success: boolean; message: string; token?: string; user?: User }>;
  logout: (token: string, userId: string) =>
    Promise<{ success: boolean; message: string }>;
  validateSession: (token: string) =>
    Promise<{ valid: boolean; user?: User; session?: Session; expired?: boolean }>;
  refreshSession: (token: string) =>
    Promise<{ success: boolean; newExpiresAt?: string; expired?: boolean }>;
  getActiveSessions: () => Promise<(Session & { user: User })[]>;
  terminateSession: (sessionId: string) =>
    Promise<{ success: boolean; message: string }>;
  getActivityLog: (userId?: string, limit?: number) => Promise<ActivityLog[]>;
  changePassword: (userId: string, oldPassword: string, newPassword: string) =>
    Promise<{ success: boolean; message: string }>;
  adminResetPassword: (adminId: string, targetUserId: string, newPassword: string) =>
    Promise<{ success: boolean; message: string }>;
  validatePassword: (password: string) =>
    Promise<{ valid: boolean; message: string }>;
  // Export users database
  exportUsersDatabase: (targetPath: string) =>
    Promise<{ success: boolean; message: string }>;
  // Import users database
  importUsersDatabase: (sourcePath: string, conflictResolution: 'skip' | 'overwrite' | 'merge') =>
    Promise<{ success: boolean; message: string; imported: number; conflicts: number }>;
  // Get users database path
  getUsersDbPath: () => Promise<string>;

  // ============ COA Management ============
  getAllCOA: () => Promise<COA[]>;
  getCOAById: (id: string) => Promise<COA | null>;
  getCOAByKode: (kode: string) => Promise<COA | null>;
  createCOA: (kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    Promise<{ success: boolean; message: string; coa?: COA }>;
  updateCOA: (id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    Promise<{ success: boolean; message: string }>;
  deleteCOA: (id: string) =>
    Promise<{ success: boolean; message: string; aspekKerjaCount?: number }>;
  deleteCOAWithAspekKerja: (id: string) =>
    Promise<{ success: boolean; message: string }>;
  clearAllCOA: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  clearAllAspekKerja: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  searchCOA: (searchTerm: string, tipe?: string, statusAktif?: number) => Promise<COA[]>;
  getCOAByParent: (parentId: string | null) => Promise<COA[]>;
  getCOAWithPagination: (page: number, pageSize: number, searchTerm?: string, tipe?: string, statusAktif?: number) =>
    Promise<COAPaginationResult>;
  getCOATipeOptions: () => Promise<string[]>;
  getCOAAspekKerjaCount: (coaId: string) => Promise<number>;

  // ============ Aspek Kerja Management ============
  getAllAspekKerja: () => Promise<AspekKerjaWithCOA[]>;
  getAspekKerjaById: (id: string) => Promise<AspekKerjaWithCOA | null>;
  getAspekKerjaByKode: (kode: string) => Promise<AspekKerja | null>;
  createAspekKerja: (kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    Promise<{ success: boolean; message: string; aspekKerja?: AspekKerja }>;
  updateAspekKerja: (id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    Promise<{ success: boolean; message: string }>;
  deleteAspekKerja: (id: string) =>
    Promise<{ success: boolean; message: string }>;
  searchAspekKerja: (searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) =>
    Promise<AspekKerjaWithCOA[]>;
  getAspekKerjaWithPagination: (page: number, pageSize: number, searchTerm?: string, jenis?: string, coaId?: string, statusAktif?: number) =>
    Promise<{ data: AspekKerjaWithCOA[]; total: number; page: number; pageSize: number; totalPages: number }>;
  getActiveCOA: () => Promise<COA[]>;

  // ============ Blok Management ============
  getAllBlok: () => Promise<Blok[]>;
  getBlokById: (id: string) => Promise<Blok | null>;
  getBlokByKode: (kodeBlok: string) => Promise<Blok | null>;
  createBlok: (kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    Promise<{ success: boolean; message: string; blok?: Blok }>;
  updateBlok: (id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    Promise<{ success: boolean; message: string }>;
  deleteBlok: (id: string) => Promise<{ success: boolean; message: string }>;
  clearAllBlok: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  searchBlok: (searchTerm?: string, tahunTanam?: number, status?: string) => Promise<Blok[]>;
  getBlokWithPagination: (page: number, pageSize: number, searchTerm?: string, tahunTanam?: number, status?: string) =>
    Promise<BlokPaginationResult>;
  getBlokStatusOptions: () => Promise<string[]>;
  getBlokAvailableYears: () => Promise<number[]>;

  // ============ Import/Export ============
  showSaveDialog: (defaultName: string) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog: (title: string) => Promise<{ canceled: boolean; filePaths: string[] }>;
  readExcelFile: (filePath: string) => Promise<{ success: boolean; data?: Record<string, unknown>[]; sheetName?: string; error?: string }>;
  importCOABatch: (data: Array<{ kode: string; nama: string; tipe: string; parent_kode?: string; status_aktif?: number }>) => Promise<ImportResult>;
  getAllCOAKodes: () => Promise<string[]>;
  importAspekKerjaBatch: (data: Array<{ kode: string; nama: string; coa_kode?: string; jenis?: string; status_aktif?: number }>) => Promise<ImportResult>;
  getAllAspekKerjaKodes: () => Promise<string[]>;
  importBlokBatch: (data: Array<{ kode_blok: string; nama: string; tahun_tanam: string | number; luas: string | number; pokok?: number | null; sph?: number | null; bulan_tanam?: string | null; status_tanaman_2025?: string | null; status_tanaman_2026?: string | null; status_tanaman_2027?: string | null; keterangan?: string }>) => Promise<ImportResult>;
  getAllBlokKodes: () => Promise<string[]>;
  // ORG-1 parsing utilities for Blok mapping
  parseORG1Data: (rawData: Array<Record<string, unknown>>) => Promise<{
    success: boolean;
    message: string;
    data: Array<{
      costCentre: string;
      kodeGL: string;
      namaAkun: string;
      tahunTanam: number | null;
      blokKode: string | null;
      status: string | null;
    }>;
    totalRows: number;
    blokMappingCount: number;
  }>;
  mapORG1ToBlok: (org1Data: Array<{ costCentre: string; kodeGL: string; namaAkun: string; tahunTanam: number | null; blokKode: string | null; status: string | null }>) =>
    Promise<Array<{ kode_blok: string; nama: string; tahun_tanam: number | null; costCentre: string; status: string }>>;
  compareORG1WithBlok: (org1Data: Array<{ costCentre: string; kodeGL: string; namaAkun: string; tahunTanam: number | null; blokKode: string | null; status: string | null }>) =>
    Promise<{ inORG1NotInBlok: string[]; inBlokNotInORG1: string[]; matched: string[] }>;

  // ============ Kas Transaction ============
  getAllKasTransactions: () => Promise<KasTransactionWithDetails[]>;
  getKasTransactionById: (id: string) => Promise<KasTransactionWithDetails | null>;
  createKasTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    created_by: string;
  }) => Promise<{ success: boolean; message: string; transaction?: KasTransaction }>;
  updateKasTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string }>;
  deleteKasTransaction: (id: string) => Promise<{ success: boolean; message: string }>;
  clearAllKas: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  approveKasTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    Promise<{ success: boolean; message: string }>;
  rejectKasTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    Promise<{ success: boolean; message: string }>;
  getKasApprovalHistory: (transactionId: string) => Promise<ApprovalHistoryEntry[]>;
  getKasApprovers: () => Promise<Array<{ id: string; full_name: string }>>;
  checkKasApproverSetup: () => Promise<ApproverSetupStatus>;
  getKasBalance: () => Promise<KasBalance>;
  searchKasTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    Promise<KasTransactionWithDetails[]>;
  getKasWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) =>
    Promise<KasPaginationResult>;
  getKasStatusOptions: () => Promise<string[]>;
  copyKasTransaction: (id: string, createdBy: string) => Promise<{ success: boolean; message: string; transaction?: KasTransaction }>;
  validateKasCOA: (coaId: string | null) => Promise<{ valid: boolean; message: string }>;
  getKasActiveCOA: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getKasActiveAspekKerja: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getKasActiveBlok: () => Promise<Array<{ id: string; kode_blok: string; nama: string }>>;
  switchKasPeriod: (year: number, month: number) => Promise<{ success: boolean; message: string }>;
  getKasCurrentPeriod: () => Promise<{ year: number; month: number }>;
  importKasBatch: (data: Array<{
    transaction_type?: string;
    transaction_date?: string;
    amount?: string | number;
    description?: string;
    coa_kode?: string;
    aspek_kerja_kode?: string;
    blok_kode?: string;
    created_by_name?: string;
  }>, createdBy: string) => Promise<{
    success: boolean;
    message: string;
    importedCount: number;
    errors: Array<{ row: number; field: string; message: string; value: string }>;
  }>;

  // ============ Bank Transaction ============
  getAllBankTransactions: () => Promise<BankTransactionWithDetails[]>;
  getBankTransactionById: (id: string) => Promise<BankTransactionWithDetails | null>;
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
  }) => Promise<{ success: boolean; message: string; transaction?: BankTransaction }>;
  updateBankTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    bank_account?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string }>;
  deleteBankTransaction: (id: string) => Promise<{ success: boolean; message: string }>;
  clearAllBank: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  approveBankTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    Promise<{ success: boolean; message: string }>;
  rejectBankTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    Promise<{ success: boolean; message: string }>;
  getBankApprovalHistory: (transactionId: string) => Promise<ApprovalHistoryEntry[]>;
  getBankApprovers: () => Promise<Array<{ id: string; full_name: string }>>;
  checkBankApproverSetup: () => Promise<ApproverSetupStatus>;
  getBankBalance: () => Promise<BankBalance>;
  searchBankTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    Promise<BankTransactionWithDetails[]>;
  getBankWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) =>
    Promise<BankPaginationResult>;
  getBankStatusOptions: () => Promise<string[]>;
  copyBankTransaction: (id: string, createdBy: string) => Promise<{ success: boolean; message: string; transaction?: BankTransaction }>;
  validateBankCOA: (coaId: string | null) => Promise<{ valid: boolean; message: string }>;
  getBankActiveCOA: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getBankActiveAspekKerja: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getBankActiveBlok: () => Promise<Array<{ id: string; kode_blok: string; nama: string }>>;
  switchBankPeriod: (year: number, month: number) => Promise<{ success: boolean; message: string }>;
  getBankCurrentPeriod: () => Promise<{ year: number; month: number }>;
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
  }>, createdBy: string) => Promise<{
    success: boolean;
    message: string;
    importedCount: number;
    errors: Array<{ row: number; field: string; message: string; value: string }>;
  }>;

  // ============ Gudang Transaction ============
  getAllGudangTransactions: () => Promise<GudangTransactionWithDetails[]>;
  getGudangTransactionById: (id: string) => Promise<GudangTransactionWithDetails | null>;
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
  }) => Promise<{ success: boolean; message: string; transaction?: GudangTransaction }>;
  updateGudangTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    item_name?: string | null;
    item_unit?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string }>;
  deleteGudangTransaction: (id: string) => Promise<{ success: boolean; message: string }>;
  clearAllGudang: () => Promise<{ success: boolean; message: string; deletedCount: number }>;
  approveGudangTransaction: (id: string, input: { approver_id: string; approver_name: string }) =>
    Promise<{ success: boolean; message: string }>;
  rejectGudangTransaction: (id: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    Promise<{ success: boolean; message: string }>;
  getGudangApprovalHistory: (transactionId: string) => Promise<ApprovalHistoryEntry[]>;
  getGudangApprovers: () => Promise<Array<{ id: string; full_name: string }>>;
  checkGudangApproverSetup: () => Promise<ApproverSetupStatus>;
  getGudangStock: () => Promise<GudangStock>;
  searchGudangTransactions: (searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string) =>
    Promise<GudangTransactionWithDetails[]>;
  getGudangWithPagination: (page: number, pageSize: number, searchTerm?: string, transactionType?: string, status?: string, startDate?: string, endDate?: string, syncStatusFilter?: string) =>
    Promise<GudangPaginationResult>;
  getGudangStatusOptions: () => Promise<string[]>;
  copyGudangTransaction: (id: string, createdBy: string) => Promise<{ success: boolean; message: string; transaction?: GudangTransaction }>;
  validateGudangCOA: (coaId: string | null) => Promise<{ valid: boolean; message: string }>;
  getGudangActiveCOA: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getGudangActiveAspekKerja: () => Promise<Array<{ id: string; kode: string; nama: string }>>;
  getGudangActiveBlok: () => Promise<Array<{ id: string; kode_blok: string; nama: string }>>;
  switchGudangPeriod: (year: number, month: number) => Promise<{ success: boolean; message: string }>;
  getGudangCurrentPeriod: () => Promise<{ year: number; month: number }>;
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
  }>, createdBy: string) => Promise<{
    success: boolean;
    message: string;
    importedCount: number;
    errors: Array<{ row: number; field: string; message: string; value: string }>;
  }>;

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
  }) => Promise<{ success: boolean; message: string; revision_id?: string }>;
  getRevisionRequest: (module: 'kas' | 'bank' | 'gudang', transactionId: string) => Promise<{
    hasPendingRevision: boolean;
    revision_id?: string;
    status?: string;
    revision_reason?: string;
  }>;
  hasPendingRevision: (module: 'kas' | 'bank' | 'gudang', transactionId: string) => Promise<boolean>;
  getPendingRevisionCount: (module: 'kas' | 'bank' | 'gudang') => Promise<number>;

  // Get pending revisions from all modules
  getPendingRevisions: (filters?: {
    module?: 'kas' | 'bank' | 'gudang';
    transactionId?: string;
  }) => Promise<{
    success: boolean;
    message?: string;
    revisions: RevisionTransaction[];
  }>;

  // Get revision by ID
  getRevisionById: (revisionId: string) => Promise<{
    success: boolean;
    message?: string;
    revision?: RevisionTransaction;
  }>;

  // Get all revisions for a transaction
  getRevisionsForTransaction: (module: 'kas' | 'bank' | 'gudang', transactionId: string) => Promise<{
    success: boolean;
    message?: string;
    revisions: RevisionTransaction[];
  }>;

  // Approve revision
  approveRevision: (revisionId: string, input: { approver_id: string; approver_name: string }) =>
    Promise<{ success: boolean; message: string }>;

  // Reject revision
  rejectRevision: (revisionId: string, input: { rejected_by_id: string; rejected_by_name: string; reason: string }) =>
    Promise<{ success: boolean; message: string }>;

  // Cancel revision (by requester)
  cancelRevision: (revisionId: string, cancelledBy: string) =>
    Promise<{ success: boolean; message: string }>;

  // Get revision counts for summary
  getRevisionCounts: () => Promise<{
    success: boolean;
    message?: string;
    counts: {
      pendingRevisionApproval1: number;
      pendingRevisionApproval2: number;
      totalPending: number;
      byModule: {
        kas: number;
        bank: number;
        gudang: number;
      };
    };
  }>;

  // ============ Sync System ============
  initSync: () => Promise<{ success: boolean; message: string }>;
  getAllSyncConfigs: () => Promise<SyncConfig[]>;
  getSyncConfig: (module: string) => Promise<SyncConfig | null>;
  saveSyncConfig: (input: { module: string; remotePath: string; enabled: boolean }) =>
    Promise<{ success: boolean; message: string; config?: SyncConfig }>;
  deleteSyncConfig: (module: string) => Promise<{ success: boolean; message: string }>;
  checkSyncConnection: (module: string) => Promise<ConnectionStatus>;
  checkAllSyncConnections: () => Promise<ConnectionStatus[]>;
  getSyncQueueCount: () => Promise<{ pending: number; failed: number; total: number }>;
  getModuleSyncStatus: () => Promise<{
    success: boolean;
    modules?: Record<string, {
      module: string;
      pendingCount: number;
      failedCount: number;
      lastSyncAt: string | null;
      syncState: 'synced' | 'pending' | 'error' | 'not_configured';
    }>;
    message?: string;
  }>;
  getPendingSyncItems: () => Promise<SyncQueueItem[]>;
  addToSyncQueue: (module: string, operation: 'create' | 'update' | 'delete', recordId: string, data: Record<string, unknown>) =>
    Promise<{ success: boolean; message: string; item?: SyncQueueItem }>;
  performSync: (module: string) => Promise<SyncResult>;
  triggerAutoSync: (module: string) => Promise<{ success: boolean; message: string }>;
  clearSyncQueue: () => Promise<{ success: boolean; message: string; removedCount: number }>;
  getSyncConflicts: (limit?: number) => Promise<SyncConflict[]>;
  detectSyncConflict: (module: string, recordId: string, localTimestamp: string, remoteTimestamp: string) =>
    Promise<{ hasConflict: boolean; resolution: 'local' | 'remote' | 'latest' }>;

  // ============ Conflict Resolution ============
  getPendingSyncConflicts: (module?: string) => Promise<SyncConflictRecord[]>;
  getSyncConflictById: (id: string) => Promise<SyncConflictRecord | null>;
  resolveSyncConflict: (conflictId: string, resolution: 'local' | 'remote' | 'merged', resolvedData?: Record<string, unknown>) =>
    Promise<{ success: boolean; message: string }>;
  discardSyncConflict: (conflictId: string) => Promise<{ success: boolean; message: string }>;
  getSyncConflictStats: () => Promise<{
    total: number;
    pending: number;
    resolved: number;
    byModule: Record<string, number>;
    byType: Record<string, number>;
  }>;

  // Get sync history (VAL-UI-009)
  getSyncHistory: (page?: number, pageSize?: number, filter?: SyncHistoryFilter) => Promise<SyncHistoryResult>;

  // ============ Auto-Sync Timer ============
  getAutoSyncTimerStatus: () => Promise<AutoSyncTimerStatus>;
  getAutoSyncTimerConfig: () => Promise<AutoSyncTimerConfig>;
  setAutoSyncTimerConfig: (config: Partial<AutoSyncTimerConfig>) => Promise<{ success: boolean; config: AutoSyncTimerConfig }>;
  startAutoSyncTimer: () => Promise<{ success: boolean; status: AutoSyncTimerStatus }>;
  stopAutoSyncTimer: () => Promise<{ success: boolean; status: AutoSyncTimerStatus }>;
  pauseAutoSyncTimer: () => Promise<{ success: boolean; status: AutoSyncTimerStatus }>;
  resumeAutoSyncTimer: () => Promise<{ success: boolean; status: AutoSyncTimerStatus }>;
  resetAutoSyncTimer: () => Promise<{ success: boolean; status: AutoSyncTimerStatus }>;
  triggerManualSync: () => Promise<{ success: boolean; message: string }>;

  // Auto-Sync Timer event listeners
  onAutoSyncTimerStatus: (callback: (status: AutoSyncTimerStatus) => void) => void;
  offAutoSyncTimerStatus: () => void;
  onAutoSyncTimerProgress: (callback: (progress: SyncProgress) => void) => void;
  offAutoSyncTimerProgress: () => void;
  onAutoSyncTimerResult: (callback: (result: { success: boolean; message?: string; totalProcessed?: number; succeeded?: number; failed?: number }) => void) => void;
  offAutoSyncTimerResult: () => void;

  // ============ Network Status ============
  getNetworkStatus: () => Promise<NetworkStatusInfo>;
  checkNetworkStatus: () => Promise<NetworkStatusInfo>;
  getNetworkConnectionQuality: () => Promise<'good' | 'fair' | 'poor' | 'unknown'>;
  checkCaptivePortal: () => Promise<boolean>;
  isNetworkOnline: () => Promise<boolean>;
  setNetworkStatusConfig: (config: {
    checkUrl?: string;
    checkTimeoutMs?: number;
    maxConsecutiveFailures?: number;
    checkIntervalMs?: number;
    detectCaptivePortal?: boolean;
    captivePortalCheckUrl?: string;
  }) => Promise<{ success: boolean }>;
  onNetworkStatusChange: (callback: (status: NetworkStatusInfo) => void) => void;
  offNetworkStatusChange: () => void;
  onNetworkStatusSyncControl: (callback: (data: { command: string; networkStatus: NetworkStatusInfo }) => void) => void;
  offNetworkStatusSyncControl: () => void;

  // ============ Local-First Operations ============
  localFirstGetSyncQueueStatus: () => Promise<{
    pending: number;
    failed: number;
    total: number;
    items: Array<{
      id: string;
      module: string;
      operation: string;
      recordId: string;
      timestamp: string;
      status: string;
      attempts: number;
      lastError: string | null;
    }>;
  }>;
  localFirstHasPendingSyncForModule: (module: string) => Promise<boolean>;
  localFirstGetPendingSyncCountForModule: (module: string) => Promise<number>;
  localFirstCreateKasTransaction: (input: {
    transaction_type: string;
    transaction_date: string;
    amount: number;
    description: string;
    coa_id: string | null;
    aspek_kerja_id: string | null;
    blok_id: string | null;
    created_by: string;
  }) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateKasTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteKasTransaction: (id: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
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
  }) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateBankTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    bank_account?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteBankTransaction: (id: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
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
  }) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateGudangTransaction: (id: string, input: {
    transaction_date?: string;
    amount?: number;
    description?: string;
    coa_id?: string | null;
    aspek_kerja_id?: string | null;
    blok_id?: string | null;
    item_name?: string | null;
    item_unit?: string | null;
  }, updatedBy: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteGudangTransaction: (id: string) => Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;

  // ============ COA Local-First Operations ============
  localFirstCreateCOA: (kode: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    Promise<{ success: boolean; message: string; data?: { id: string }; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateCOA: (id: string, nama: string, tipe: string, parentId: string | null, statusAktif: number) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteCOA: (id: string) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;

  // ============ Blok Local-First Operations ============
  localFirstCreateBlok: (kodeBlok: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    Promise<{ success: boolean; message: string; data?: { id: string }; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateBlok: (id: string, nama: string, tahunTanam: number, luas: number, status: string, keterangan: string | null, pokok?: number | null, sph?: number | null, bulanTanam?: string | null, statusTanaman2025?: string | null, statusTanaman2026?: string | null, statusTanaman2027?: string | null) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteBlok: (id: string) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;

  // ============ Aspek Kerja Local-First Operations ============
  localFirstCreateAspekKerja: (kode: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    Promise<{ success: boolean; message: string; data?: { id: string }; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstUpdateAspekKerja: (id: string, nama: string, coaId: string | null, jenis: string, statusAktif: number) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;
  localFirstDeleteAspekKerja: (id: string) =>
    Promise<{ success: boolean; message: string; syncStatus: 'synced' | 'pending' | 'conflict' | 'error' }>;

  // ============ Sync Health Dashboard (F014-BE) ============

  // Get sync statistics - accurate counts (pending, failed, total)
  getSyncHealthStats: () => Promise<{
    pending: number;
    inProgress: number;
    failed: number;
    completed: number;
    total: number;
    oldestPendingTimestamp: string | null;
  }>;

  // Get per-module sync status breakdown
  getSyncHealthModuleSyncStatus: () => Promise<{
    success: boolean;
    modules?: Record<string, {
      module: string;
      pendingCount: number;
      failedCount: number;
      lastSyncAt: string | null;
      syncState: 'synced' | 'pending' | 'error' | 'not_configured';
      isConfigured: boolean;
      isEnabled: boolean;
    }>;
    message?: string;
  }>;

  // Get list of failed items with retry information
  getSyncHealthFailedItems: (options?: {
    module?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{
    items: Array<{
      id: string;
      module: string;
      operation: 'create' | 'update' | 'delete';
      recordId: string;
      attempts: number;
      lastError: string | null;
      createdAt: string;
      lastAttemptAt: string | null;
      nextRetryAt: string | null;
      canRetry: boolean;
      maxRetries: number;
      retryDelayMs: number | null;
      retryDelayFormatted: string | null;
      status: 'failed' | 'error';
    }>;
    totalCount: number;
    totalRetriedCount: number;
  }>;

  // Retry a single failed item
  retrySyncHealthFailedItem: (itemId: string) => Promise<{
    success: boolean;
    message: string;
    itemId?: string;
  }>;

  // Retry all failed items
  retrySyncHealthAllFailed: () => Promise<{
    success: boolean;
    message: string;
    retriedCount?: number;
  }>;

  // Get retry configuration info
  getSyncHealthRetryConfig: () => Promise<{
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    retrySequence: number[];
    retrySequenceFormatted: string[];
  }>;

  // Get queue health status
  getSyncHealthQueueHealth: () => Promise<{
    healthy: boolean;
    issues: string[];
    warnings: string[];
  }>;

  // Get comprehensive health dashboard data
  getSyncHealthDashboardData: () => Promise<{
    stats: {
      pending: number;
      inProgress: number;
      failed: number;
      completed: number;
      total: number;
      oldestPendingTimestamp: string | null;
    };
    moduleStatus: Record<string, {
      module: string;
      pendingCount: number;
      failedCount: number;
      lastSyncAt: string | null;
      syncState: 'synced' | 'pending' | 'error' | 'not_configured';
    }>;
    health: { healthy: boolean; issues: string[]; warnings: string[] };
    retryConfig: {
      maxRetries: number;
      baseDelayMs: number;
      maxDelayMs: number;
      multiplier: number;
      retrySequence: number[];
      retrySequenceFormatted: string[];
    };
    failedItemsCount: number;
  }>;
}

// Sync System types
interface SyncConfig {
  id: string;
  module: string;
  remotePath: string;
  enabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SyncQueueItem {
  id: string;
  module: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  data: string;
  timestamp: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  errorMessage: string | null;
}

interface SyncConflict {
  id: string;
  module: string;
  recordId: string;
  localTimestamp: string;
  remoteTimestamp: string;
  resolvedWith: 'local' | 'remote' | 'latest';
  resolvedAt: string;
}

interface ConnectionStatus {
  module: string;
  path: string;
  connected: boolean;
  lastChecked: string;
  error?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  syncedCount: number;
  conflictCount: number;
  errorCount: number;
}

// Conflict Resolution types
interface SyncConflictRecord {
  id: string;
  module: string;
  recordId: string;
  conflictType: 'edit_edit' | 'delete_edit' | 'edit_delete';
  localTimestamp: string;
  remoteTimestamp: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  resolutionStrategy: 'last_write_wins' | 'local_wins' | 'remote_wins' | 'merge' | 'manual';
  resolvedWith?: 'local' | 'remote' | 'merged';
  resolutionData?: Record<string, unknown>;
  resolvedAt?: string;
  resolvedBy?: string;
  needsManualResolution: boolean;
  fieldConflicts?: string[];
  mergedData?: Record<string, unknown>;
  createdAt: string;
}

// Sync History types (VAL-UI-009)
interface SyncHistoryEntry {
  id: string;
  direction: 'up' | 'down';
  module: string;
  batchId: string | null;
  recordsCount: number;
  status: 'success' | 'partial' | 'failed';
  errors: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface SyncHistoryFilter {
  startDate?: string;
  endDate?: string;
  module?: string;
  direction?: 'up' | 'down';
  status?: 'success' | 'partial' | 'failed';
}

interface SyncHistoryResult {
  entries: SyncHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Auto-Sync Timer types
interface AutoSyncTimerStatus {
  isRunning: boolean;
  isSyncing: boolean;
  isPaused: boolean;
  isPausedByNetwork: boolean;
  isManuallyPaused: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  intervalMs: number;
  enabled: boolean;
  tickCount: number;
  networkStatus: NetworkStatusInfo;
}

interface AutoSyncTimerConfig {
  intervalMs: number;
  enabled: boolean;
  modules: string[];
  minIntervalMs: number;
}

interface SyncProgress {
  currentBatch: number;
  totalBatches: number;
  itemsProcessed: number;
  totalProcessed: number;
  totalItems: number;
  succeeded: number;
  failed: number;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  elapsedMs: number;
  estimatedRemainingMs: number | null;
}

interface NetworkStatusInfo {
  status: 'online' | 'offline' | 'checking';
  isInternetAccessible: boolean;
  connectionQuality: 'good' | 'fair' | 'poor' | 'unknown';
  lastCheckedAt: string;
  lastStatusChangeAt: string | null;
  previousStatus: 'online' | 'offline' | 'checking' | null;
  consecutiveFailures: number;
  checkUrl: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
