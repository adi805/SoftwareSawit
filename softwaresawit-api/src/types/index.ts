// Shared types for the SoftwareSawit API

export interface BaseEntity {
  id: string;
  created_at?: string;
  updated_at?: string;
  deleted?: number;
}

export interface SyncableEntity extends BaseEntity {
  sync_status: 'synced' | 'pending' | 'conflict' | 'error';
  modified_at?: string;
  device_id?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface SyncChangesResponse<T> {
  data: T[];
  since: string | null;
  timestamp: string;
}

// User types
export interface User {
  id: string;
  username: string;
  password: string;
  nama: string;
  role: 'admin' | 'user' | 'approver';
  modules: string[];
  created_at?: string;
  updated_at?: string;
  deleted?: number;
}

// Transaction types
export interface KasTransaction extends SyncableEntity {
  tanggal: string;
  kode_akun: string;
  uraian: string;
  debet: number;
  kredit: number;
}

export interface BankTransaction extends SyncableEntity {
  tanggal: string;
  kode_akun: string;
  uraian: string;
  debet: number;
  kredit: number;
}

export interface GudangTransaction extends SyncableEntity {
  tanggal: string;
  kode_barang: string;
  nama_barang: string;
  quantity: number;
  satuan: string;
  harga_satuan: number;
  total_harga: number;
  jenis_transaksi: 'masuk' | 'keluar';
  uraian?: string;
}

// Master data types
export interface COA extends SyncableEntity {
  kode: string;
  nama: string;
  jenis: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  kategori?: string;
  parent_kode?: string;
}

export interface Blok extends SyncableEntity {
  kode_blok: string;
  nama: string;
  tahun_tanam: number;
  luas: number;
  status: 'TM' | 'TBM' | 'TTM' | 'TLS';
  keterangan?: string;
  pokok?: number;
  sph?: number;
  bulan_tanam?: string;
  status_tanaman?: string;
}

export interface AspekKerja extends SyncableEntity {
  kode: string;
  nama: string;
  kategori?: string;
}

// Sync types
export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  module: string;
  periode: string;
  record_id: string;
  data?: any;
  status: 'pending' | 'in_progress' | 'failed' | 'completed';
  attempts: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  direction: 'up' | 'down';
  module: string;
  records_count: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string;
  started_at: string;
  completed_at?: string;
}

export interface DeviceRegistry {
  device_id: string;
  user_id: string;
  last_seen: string;
  created_at: string;
}
