/**
 * Local-First Operations Service for SoftwareSawit
 * 
 * Implements the local-first data architecture:
 * - All CRUD operations work against local SQLite first
 * - Operations are queued for sync with metadata (timestamp, operation type)
 * - Local operations return immediately without waiting for cloud
 * - Offline mode works seamlessly without user awareness
 */

import log from 'electron-log';
import * as syncQueue from './syncQueueService';
import * as kasDb from './kasDatabase';
import * as bankDb from './bankDatabase';
import * as gudangDb from './gudangDatabase';
import * as coaDb from './coaDatabase';
import * as blokDb from './blokDatabase';

// Module types for sync
export type ModuleType = 'kas' | 'bank' | 'gudang' | 'coa' | 'aspek_kerja' | 'blok';

// Sync operation types
export type OperationType = 'create' | 'update' | 'delete';

// Local-first result wrapper
export interface LocalFirstResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
  // Sync info
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  syncedAt?: string;
}

// ============ CREATE Operations ============

// Create Kas transaction with local-first
export interface CreateKasTransactionInput {
  transaction_type: string;
  transaction_date: string;
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  created_by: string;
}

export function createKasTransactionLocalFirst(
  input: CreateKasTransactionInput
): LocalFirstResult<{ id: string; transaction_number: string }> {
  try {
    // 1. Create locally first (immediate return)
    const createResult = kasDb.createTransaction({
      transaction_type: input.transaction_type as kasDb.TransactionType,
      transaction_date: input.transaction_date,
      amount: input.amount,
      description: input.description,
      coa_id: input.coa_id,
      aspek_kerja_id: input.aspek_kerja_id,
      blok_id: input.blok_id,
      created_by: input.created_by,
    });

    if (!createResult.success || !createResult.transaction) {
      return { success: false, message: createResult.message, syncStatus: 'error' };
    }

    // 2. Queue for sync (non-blocking, no waiting for cloud)
    const transaction = createResult.transaction;
    syncQueue.queueSync('kas', 'create', transaction.id, {
      id: transaction.id,
      transaction_number: transaction.transaction_number,
      tanggal: transaction.transaction_date,
      transaction_type: transaction.transaction_type,
      amount: transaction.amount,
      description: transaction.description,
      coa_id: transaction.coa_id,
      aspek_kerja_id: transaction.aspek_kerja_id,
      blok_id: transaction.blok_id,
      status: transaction.status,
      created_by: transaction.created_by,
      created_at: transaction.created_at,
    });

    log.info(`[LocalFirst] Kas transaction created: ${transaction.id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil ditambahkan (queued for sync)',
      data: { id: transaction.id, transaction_number: transaction.transaction_number },
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to create Kas transaction:', error);
    return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
  }
}

// Create Bank transaction with local-first
export interface CreateBankTransactionInput {
  transaction_type: string;
  transaction_date: string;
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  bank_account: string | null;
  created_by: string;
}

export function createBankTransactionLocalFirst(
  input: CreateBankTransactionInput
): LocalFirstResult<{ id: string; transaction_number: string }> {
  try {
    const createResult = bankDb.createTransaction({
      transaction_type: input.transaction_type as bankDb.TransactionType,
      transaction_date: input.transaction_date,
      amount: input.amount,
      description: input.description,
      coa_id: input.coa_id,
      aspek_kerja_id: input.aspek_kerja_id,
      blok_id: input.blok_id,
      bank_account: input.bank_account,
      created_by: input.created_by,
    });

    if (!createResult.success || !createResult.transaction) {
      return { success: false, message: createResult.message, syncStatus: 'error' };
    }

    const transaction = createResult.transaction;
    syncQueue.queueSync('bank', 'create', transaction.id, {
      id: transaction.id,
      transaction_number: transaction.transaction_number,
      transaction_date: transaction.transaction_date,
      transaction_type: transaction.transaction_type,
      amount: transaction.amount,
      description: transaction.description,
      coa_id: transaction.coa_id,
      aspek_kerja_id: transaction.aspek_kerja_id,
      blok_id: transaction.blok_id,
      bank_account: transaction.bank_account,
      status: transaction.status,
      created_by: transaction.created_by,
      created_at: transaction.created_at,
    });

    log.info(`[LocalFirst] Bank transaction created: ${transaction.id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil ditambahkan (queued for sync)',
      data: { id: transaction.id, transaction_number: transaction.transaction_number },
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to create Bank transaction:', error);
    return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
  }
}

// Create Gudang transaction with local-first
export interface CreateGudangTransactionInput {
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
}

export function createGudangTransactionLocalFirst(
  input: CreateGudangTransactionInput
): LocalFirstResult<{ id: string; transaction_number: string }> {
  try {
    const createResult = gudangDb.createTransaction({
      transaction_type: input.transaction_type as gudangDb.TransactionType,
      transaction_date: input.transaction_date,
      amount: input.amount,
      description: input.description,
      coa_id: input.coa_id,
      aspek_kerja_id: input.aspek_kerja_id,
      blok_id: input.blok_id,
      item_name: input.item_name,
      item_unit: input.item_unit,
      created_by: input.created_by,
    });

    if (!createResult.success || !createResult.transaction) {
      return { success: false, message: createResult.message, syncStatus: 'error' };
    }

    const transaction = createResult.transaction;
    syncQueue.queueSync('gudang', 'create', transaction.id, {
      id: transaction.id,
      transaction_number: transaction.transaction_number,
      transaction_date: transaction.transaction_date,
      transaction_type: transaction.transaction_type,
      amount: transaction.amount,
      description: transaction.description,
      coa_id: transaction.coa_id,
      aspek_kerja_id: transaction.aspek_kerja_id,
      blok_id: transaction.blok_id,
      item_name: transaction.item_name,
      item_unit: transaction.item_unit,
      status: transaction.status,
      created_by: transaction.created_by,
      created_at: transaction.created_at,
    });

    log.info(`[LocalFirst] Gudang transaction created: ${transaction.id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil ditambahkan (queued for sync)',
      data: { id: transaction.id, transaction_number: transaction.transaction_number },
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to create Gudang transaction:', error);
    return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
  }
}

// ============ READ Operations ============

// Read operations return local data immediately (no network dependency)
export function getKasTransactionsLocal(): kasDb.KasTransactionWithDetails[] {
  try {
    return kasDb.getAllTransactions();
  } catch (error) {
    log.error('[LocalFirst] Failed to get Kas transactions:', error);
    return [];
  }
}

export function getBankTransactionsLocal(): bankDb.BankTransactionWithDetails[] {
  try {
    return bankDb.getAllTransactions();
  } catch (error) {
    log.error('[LocalFirst] Failed to get Bank transactions:', error);
    return [];
  }
}

export function getGudangTransactionsLocal(): gudangDb.GudangTransactionWithDetails[] {
  try {
    return gudangDb.getAllTransactions();
  } catch (error) {
    log.error('[LocalFirst] Failed to get Gudang transactions:', error);
    return [];
  }
}

// Get single transaction by ID (local only)
export function getKasTransactionByIdLocal(id: string): kasDb.KasTransactionWithDetails | null {
  try {
    return kasDb.getTransactionById(id);
  } catch (error) {
    log.error('[LocalFirst] Failed to get Kas transaction by ID:', error);
    return null;
  }
}

export function getBankTransactionByIdLocal(id: string): bankDb.BankTransactionWithDetails | null {
  try {
    return bankDb.getTransactionById(id);
  } catch (error) {
    log.error('[LocalFirst] Failed to get Bank transaction by ID:', error);
    return null;
  }
}

export function getGudangTransactionByIdLocal(id: string): gudangDb.GudangTransactionWithDetails | null {
  try {
    return gudangDb.getTransactionById(id);
  } catch (error) {
    log.error('[LocalFirst] Failed to get Gudang transaction by ID:', error);
    return null;
  }
}

// ============ UPDATE Operations ============

// Update with conflict detection metadata
export interface UpdateKasTransactionInput {
  transaction_date?: string;
  amount?: number;
  description?: string;
  coa_id?: string | null;
  aspek_kerja_id?: string | null;
  blok_id?: string | null;
}

export function updateKasTransactionLocalFirst(
  id: string,
  input: UpdateKasTransactionInput,
  updatedBy: string
): LocalFirstResult {
  try {
    // Get current transaction for conflict detection
    const current = kasDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    // Perform update locally
    const updateResult = kasDb.updateTransaction(id, input, updatedBy);
    if (!updateResult.success) {
      return { success: false, message: updateResult.message, syncStatus: 'error' };
    }

    // Queue for sync with conflict detection metadata
    // Transform input to use 'tanggal' instead of 'transaction_date' for periode routing
    const syncChanges: UpdateKasTransactionInput = { ...input };
    if ('transaction_date' in syncChanges) {
      (syncChanges as Record<string, unknown>).tanggal = input.transaction_date;
      delete (syncChanges as Record<string, unknown>).transaction_date;
    }
    
    syncQueue.queueSync('kas', 'update', id, {
      id,
      previous_modified_at: current.updated_at,
      modified_at: new Date().toISOString(),
      modified_by: updatedBy,
      changes: syncChanges,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Kas transaction updated: ${id}, queued for sync with conflict metadata`);

    return {
      success: true,
      message: 'Transaksi berhasil diupdate (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to update Kas transaction:', error);
    return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
  }
}

export interface UpdateBankTransactionInput {
  transaction_date?: string;
  amount?: number;
  description?: string;
  coa_id?: string | null;
  aspek_kerja_id?: string | null;
  blok_id?: string | null;
  bank_account?: string | null;
}

export function updateBankTransactionLocalFirst(
  id: string,
  input: UpdateBankTransactionInput,
  updatedBy: string
): LocalFirstResult {
  try {
    const current = bankDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    const updateResult = bankDb.updateTransaction(id, input, updatedBy);
    if (!updateResult.success) {
      return { success: false, message: updateResult.message, syncStatus: 'error' };
    }

    syncQueue.queueSync('bank', 'update', id, {
      id,
      previous_modified_at: current.updated_at,
      modified_at: new Date().toISOString(),
      modified_by: updatedBy,
      changes: input,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Bank transaction updated: ${id}, queued for sync with conflict metadata`);

    return {
      success: true,
      message: 'Transaksi berhasil diupdate (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to update Bank transaction:', error);
    return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
  }
}

export interface UpdateGudangTransactionInput {
  transaction_date?: string;
  amount?: number;
  description?: string;
  coa_id?: string | null;
  aspek_kerja_id?: string | null;
  blok_id?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
}

export function updateGudangTransactionLocalFirst(
  id: string,
  input: UpdateGudangTransactionInput,
  updatedBy: string
): LocalFirstResult {
  try {
    const current = gudangDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    const updateResult = gudangDb.updateTransaction(id, input, updatedBy);
    if (!updateResult.success) {
      return { success: false, message: updateResult.message, syncStatus: 'error' };
    }

    syncQueue.queueSync('gudang', 'update', id, {
      id,
      previous_modified_at: current.updated_at,
      modified_at: new Date().toISOString(),
      modified_by: updatedBy,
      changes: input,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Gudang transaction updated: ${id}, queued for sync with conflict metadata`);

    return {
      success: true,
      message: 'Transaksi berhasil diupdate (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to update Gudang transaction:', error);
    return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
  }
}

// ============ DELETE Operations (Soft Delete) ============

// Soft delete with sync queue
export function deleteKasTransactionLocalFirst(
  id: string
): LocalFirstResult {
  try {
    // Get current for soft delete tracking
    const current = kasDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    // Perform soft delete (kasDb.deleteTransaction already handles this)
    const deleteResult = kasDb.deleteTransaction(id);
    if (!deleteResult.success) {
      return { success: false, message: deleteResult.message, syncStatus: 'error' };
    }

    // Queue for sync with soft delete flag
    syncQueue.queueSync('kas', 'delete', id, {
      id,
      deleted: true,
      deleted_at: new Date().toISOString(),
      original_status: current.status,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Kas transaction deleted (soft): ${id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil dihapus (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete Kas transaction:', error);
    return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
  }
}

export function deleteBankTransactionLocalFirst(
  id: string
): LocalFirstResult {
  try {
    const current = bankDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    const deleteResult = bankDb.deleteTransaction(id);
    if (!deleteResult.success) {
      return { success: false, message: deleteResult.message, syncStatus: 'error' };
    }

    syncQueue.queueSync('bank', 'delete', id, {
      id,
      deleted: true,
      deleted_at: new Date().toISOString(),
      original_status: current.status,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Bank transaction deleted (soft): ${id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil dihapus (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete Bank transaction:', error);
    return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
  }
}

export function deleteGudangTransactionLocalFirst(
  id: string
): LocalFirstResult {
  try {
    const current = gudangDb.getTransactionById(id);
    if (!current) {
      return { success: false, message: 'Transaksi tidak ditemukan', syncStatus: 'error' };
    }

    const deleteResult = gudangDb.deleteTransaction(id);
    if (!deleteResult.success) {
      return { success: false, message: deleteResult.message, syncStatus: 'error' };
    }

    syncQueue.queueSync('gudang', 'delete', id, {
      id,
      deleted: true,
      deleted_at: new Date().toISOString(),
      original_status: current.status,
      device_id: syncQueue.getDeviceId(),
    });

    log.info(`[LocalFirst] Gudang transaction deleted (soft): ${id}, queued for sync`);

    return {
      success: true,
      message: 'Transaksi berhasil dihapus (queued for sync)',
      syncStatus: 'pending',
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete Gudang transaction:', error);
    return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
  }
}

// ============ Master Data Operations ============

// COA operations with local-first
export function createCOALocalFirst(
  kode: string,
  nama: string,
  tipe: string,
  parentId: string | null,
  statusAktif: number
): LocalFirstResult<{ id: string }> {
  try {
    const result = coaDb.createCOA(kode, nama, tipe, parentId, statusAktif);
    
    if (result.success && result.coa) {
      syncQueue.queueSync('coa', 'create', result.coa.id, {
        id: result.coa.id,
        kode: result.coa.kode,
        nama: result.coa.nama,
        tipe: result.coa.tipe,
        parent_id: result.coa.parent_id,
        status_aktif: result.coa.status_aktif,
        created_at: result.coa.created_at,
      });
      
      return { success: true, message: 'COA berhasil ditambahkan', data: { id: result.coa.id }, syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to create COA:', error);
    return { success: false, message: 'Gagal membuat COA', syncStatus: 'error' };
  }
}

export function updateCOALocalFirst(
  id: string,
  nama: string,
  tipe: string,
  parentId: string | null,
  statusAktif: number
): LocalFirstResult {
  try {
    const result = coaDb.updateCOA(id, nama, tipe, parentId, statusAktif);
    
    if (result.success) {
      syncQueue.queueSync('coa', 'update', id, {
        id,
        nama,
        tipe,
        parent_id: parentId,
        status_aktif: statusAktif,
        modified_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'COA berhasil diupdate', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to update COA:', error);
    return { success: false, message: 'Gagal mengupdate COA', syncStatus: 'error' };
  }
}

export function deleteCOALocalFirst(id: string): LocalFirstResult {
  try {
    const result = coaDb.deleteCOA(id);
    
    if (result.success) {
      syncQueue.queueSync('coa', 'delete', id, {
        id,
        deleted: true,
        deleted_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'COA berhasil dihapus', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete COA:', error);
    return { success: false, message: 'Gagal menghapus COA', syncStatus: 'error' };
  }
}

// Blok operations with local-first
export function createBlokLocalFirst(
  kodeBlok: string,
  nama: string,
  tahunTanam: number,
  luas: number,
  status: string,
  keterangan: string | null,
  pokok?: number | null,
  sph?: number | null,
  bulanTanam?: string | null,
  statusTanaman2025?: string | null,
  statusTanaman2026?: string | null,
  statusTanaman2027?: string | null
): LocalFirstResult<{ id: string }> {
  try {
    const result = blokDb.createBlok(
      kodeBlok, nama, tahunTanam, luas, status, keterangan,
      pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027
    );
    
    if (result.success && result.blok) {
      syncQueue.queueSync('blok', 'create', result.blok.id, {
        id: result.blok.id,
        kode_blok: result.blok.kode_blok,
        nama: result.blok.nama,
        tahun_tanam: result.blok.tahun_tanam,
        luas: result.blok.luas,
        status: result.blok.status,
        keterangan: result.blok.keterangan,
        pokok: result.blok.pokok,
        sph: result.blok.sph,
        bulan_tanam: result.blok.bulan_tanam,
        status_tanaman_2025: statusTanaman2025,
        status_tanaman_2026: statusTanaman2026,
        status_tanaman_2027: statusTanaman2027,
        created_at: result.blok.created_at,
      });
      
      return { success: true, message: 'Blok berhasil ditambahkan', data: { id: result.blok.id }, syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to create Blok:', error);
    return { success: false, message: 'Gagal membuat Blok', syncStatus: 'error' };
  }
}

export function updateBlokLocalFirst(
  id: string,
  nama: string,
  tahunTanam: number,
  luas: number,
  status: string,
  keterangan: string | null,
  pokok?: number | null,
  sph?: number | null,
  bulanTanam?: string | null,
  statusTanaman2025?: string | null,
  statusTanaman2026?: string | null,
  statusTanaman2027?: string | null
): LocalFirstResult {
  try {
    const result = blokDb.updateBlok(
      id, nama, tahunTanam, luas, status, keterangan,
      pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027
    );
    
    if (result.success) {
      syncQueue.queueSync('blok', 'update', id, {
        id,
        nama,
        tahun_tanam: tahunTanam,
        luas,
        status,
        keterangan,
        pokok,
        sph,
        bulan_tanam: bulanTanam,
        status_tanaman_2025: statusTanaman2025,
        status_tanaman_2026: statusTanaman2026,
        status_tanaman_2027: statusTanaman2027,
        modified_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'Blok berhasil diupdate', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to update Blok:', error);
    return { success: false, message: 'Gagal mengupdate Blok', syncStatus: 'error' };
  }
}

export function deleteBlokLocalFirst(id: string): LocalFirstResult {
  try {
    const result = blokDb.deleteBlok(id);
    
    if (result.success) {
      syncQueue.queueSync('blok', 'delete', id, {
        id,
        deleted: true,
        deleted_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'Blok berhasil dihapus', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete Blok:', error);
    return { success: false, message: 'Gagal menghapus Blok', syncStatus: 'error' };
  }
}

// ============ Aspek Kerja Local-First Operations ============

export function createAspekKerjaLocalFirst(
  kode: string,
  nama: string,
  coaId: string | null,
  jenis: string,
  statusAktif: number
): LocalFirstResult<{ id: string }> {
  try {
    const result = coaDb.createAspekKerja(kode, nama, coaId, jenis, statusAktif);
    
    if (result.success && result.aspekKerja) {
      syncQueue.queueSync('aspek_kerja', 'create', result.aspekKerja.id, {
        id: result.aspekKerja.id,
        kode: result.aspekKerja.kode,
        nama: result.aspekKerja.nama,
        coa_id: result.aspekKerja.coa_id,
        jenis: result.aspekKerja.jenis,
        status_aktif: result.aspekKerja.status_aktif,
        created_at: result.aspekKerja.created_at,
      });
      
      return { success: true, message: 'Aspek Kerja berhasil ditambahkan', data: { id: result.aspekKerja.id }, syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to create Aspek Kerja:', error);
    return { success: false, message: 'Gagal membuat Aspek Kerja', syncStatus: 'error' };
  }
}

export function updateAspekKerjaLocalFirst(
  id: string,
  nama: string,
  coaId: string | null,
  jenis: string,
  statusAktif: number
): LocalFirstResult {
  try {
    const result = coaDb.updateAspekKerja(id, nama, coaId, jenis, statusAktif);
    
    if (result.success) {
      syncQueue.queueSync('aspek_kerja', 'update', id, {
        id,
        nama,
        coa_id: coaId,
        jenis,
        status_aktif: statusAktif,
        modified_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'Aspek Kerja berhasil diupdate', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to update Aspek Kerja:', error);
    return { success: false, message: 'Gagal mengupdate Aspek Kerja', syncStatus: 'error' };
  }
}

export function deleteAspekKerjaLocalFirst(id: string): LocalFirstResult {
  try {
    const result = coaDb.deleteAspekKerja(id);
    
    if (result.success) {
      syncQueue.queueSync('aspek_kerja', 'delete', id, {
        id,
        deleted: true,
        deleted_at: new Date().toISOString(),
      });
      
      return { success: true, message: 'Aspek Kerja berhasil dihapus', syncStatus: 'pending' };
    }
    
    return { success: false, message: result.message, syncStatus: 'error' };
  } catch (error) {
    log.error('[LocalFirst] Failed to delete Aspek Kerja:', error);
    return { success: false, message: 'Gagal menghapus Aspek Kerja', syncStatus: 'error' };
  }
}

// ============ Sync Queue Status ============

export function getSyncQueueStatus(): {
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
} {
  try {
    const stats = syncQueue.getQueueStats();
    const items = syncQueue.getPendingItems();
    
    return {
      ...stats,
      items: items.map(item => ({
        id: item.id,
        module: item.module,
        operation: item.operation,
        recordId: item.recordId,
        timestamp: item.timestamp,
        status: item.status,
        attempts: item.attempts,
        lastError: item.lastError,
      })),
    };
  } catch (error) {
    log.error('[LocalFirst] Failed to get sync queue status:', error);
    return { pending: 0, failed: 0, total: 0, items: [] };
  }
}

// Check if we have pending operations for a specific module
export function hasPendingSyncForModule(module: ModuleType): boolean {
  const status = getSyncQueueStatus();
  return status.items.some(item => item.module === module);
}

// Get count of pending operations for a module
export function getPendingSyncCountForModule(module: ModuleType): number {
  const status = getSyncQueueStatus();
  return status.items.filter(item => item.module === module).length;
}

export default {
  // Create operations
  createKasTransactionLocalFirst,
  createBankTransactionLocalFirst,
  createGudangTransactionLocalFirst,
  createCOALocalFirst,
  createBlokLocalFirst,
  
  // Read operations
  getKasTransactionsLocal,
  getBankTransactionsLocal,
  getGudangTransactionsLocal,
  getKasTransactionByIdLocal,
  getBankTransactionByIdLocal,
  getGudangTransactionByIdLocal,
  
  // Update operations
  updateKasTransactionLocalFirst,
  updateBankTransactionLocalFirst,
  updateGudangTransactionLocalFirst,
  updateCOALocalFirst,
  updateBlokLocalFirst,
  
  // Delete operations
  deleteKasTransactionLocalFirst,
  deleteBankTransactionLocalFirst,
  deleteGudangTransactionLocalFirst,
  deleteCOALocalFirst,
  deleteBlokLocalFirst,
  createAspekKerjaLocalFirst,
  updateAspekKerjaLocalFirst,
  deleteAspekKerjaLocalFirst,
  
  // Sync status
  getSyncQueueStatus,
  hasPendingSyncForModule,
  getPendingSyncCountForModule,
};
