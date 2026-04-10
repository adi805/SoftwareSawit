"use strict";
/**
 * Local-First Operations Service for SoftwareSawit
 *
 * Implements the local-first data architecture:
 * - All CRUD operations work against local SQLite first
 * - Operations are queued for sync with metadata (timestamp, operation type)
 * - Local operations return immediately without waiting for cloud
 * - Offline mode works seamlessly without user awareness
 */
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
exports.createKasTransactionLocalFirst = createKasTransactionLocalFirst;
exports.createBankTransactionLocalFirst = createBankTransactionLocalFirst;
exports.createGudangTransactionLocalFirst = createGudangTransactionLocalFirst;
exports.getKasTransactionsLocal = getKasTransactionsLocal;
exports.getBankTransactionsLocal = getBankTransactionsLocal;
exports.getGudangTransactionsLocal = getGudangTransactionsLocal;
exports.getKasTransactionByIdLocal = getKasTransactionByIdLocal;
exports.getBankTransactionByIdLocal = getBankTransactionByIdLocal;
exports.getGudangTransactionByIdLocal = getGudangTransactionByIdLocal;
exports.updateKasTransactionLocalFirst = updateKasTransactionLocalFirst;
exports.updateBankTransactionLocalFirst = updateBankTransactionLocalFirst;
exports.updateGudangTransactionLocalFirst = updateGudangTransactionLocalFirst;
exports.deleteKasTransactionLocalFirst = deleteKasTransactionLocalFirst;
exports.deleteBankTransactionLocalFirst = deleteBankTransactionLocalFirst;
exports.deleteGudangTransactionLocalFirst = deleteGudangTransactionLocalFirst;
exports.createCOALocalFirst = createCOALocalFirst;
exports.updateCOALocalFirst = updateCOALocalFirst;
exports.deleteCOALocalFirst = deleteCOALocalFirst;
exports.createBlokLocalFirst = createBlokLocalFirst;
exports.updateBlokLocalFirst = updateBlokLocalFirst;
exports.deleteBlokLocalFirst = deleteBlokLocalFirst;
exports.getSyncQueueStatus = getSyncQueueStatus;
exports.hasPendingSyncForModule = hasPendingSyncForModule;
exports.getPendingSyncCountForModule = getPendingSyncCountForModule;
const electron_log_1 = __importDefault(require("electron-log"));
const syncQueue = __importStar(require("./syncQueueService"));
const kasDb = __importStar(require("./kasDatabase"));
const bankDb = __importStar(require("./bankDatabase"));
const gudangDb = __importStar(require("./gudangDatabase"));
const coaDb = __importStar(require("./coaDatabase"));
const blokDb = __importStar(require("./blokDatabase"));
function createKasTransactionLocalFirst(input) {
    try {
        // 1. Create locally first (immediate return)
        const createResult = kasDb.createTransaction({
            transaction_type: input.transaction_type,
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
            transaction_date: transaction.transaction_date,
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
        electron_log_1.default.info(`[LocalFirst] Kas transaction created: ${transaction.id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil ditambahkan (queued for sync)',
            data: { id: transaction.id, transaction_number: transaction.transaction_number },
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to create Kas transaction:', error);
        return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
    }
}
function createBankTransactionLocalFirst(input) {
    try {
        const createResult = bankDb.createTransaction({
            transaction_type: input.transaction_type,
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
        electron_log_1.default.info(`[LocalFirst] Bank transaction created: ${transaction.id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil ditambahkan (queued for sync)',
            data: { id: transaction.id, transaction_number: transaction.transaction_number },
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to create Bank transaction:', error);
        return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
    }
}
function createGudangTransactionLocalFirst(input) {
    try {
        const createResult = gudangDb.createTransaction({
            transaction_type: input.transaction_type,
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
        electron_log_1.default.info(`[LocalFirst] Gudang transaction created: ${transaction.id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil ditambahkan (queued for sync)',
            data: { id: transaction.id, transaction_number: transaction.transaction_number },
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to create Gudang transaction:', error);
        return { success: false, message: 'Gagal membuat transaksi', syncStatus: 'error' };
    }
}
// ============ READ Operations ============
// Read operations return local data immediately (no network dependency)
function getKasTransactionsLocal() {
    try {
        return kasDb.getAllTransactions();
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Kas transactions:', error);
        return [];
    }
}
function getBankTransactionsLocal() {
    try {
        return bankDb.getAllTransactions();
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Bank transactions:', error);
        return [];
    }
}
function getGudangTransactionsLocal() {
    try {
        return gudangDb.getAllTransactions();
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Gudang transactions:', error);
        return [];
    }
}
// Get single transaction by ID (local only)
function getKasTransactionByIdLocal(id) {
    try {
        return kasDb.getTransactionById(id);
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Kas transaction by ID:', error);
        return null;
    }
}
function getBankTransactionByIdLocal(id) {
    try {
        return bankDb.getTransactionById(id);
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Bank transaction by ID:', error);
        return null;
    }
}
function getGudangTransactionByIdLocal(id) {
    try {
        return gudangDb.getTransactionById(id);
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get Gudang transaction by ID:', error);
        return null;
    }
}
function updateKasTransactionLocalFirst(id, input, updatedBy) {
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
        syncQueue.queueSync('kas', 'update', id, {
            id,
            previous_modified_at: current.updated_at,
            modified_at: new Date().toISOString(),
            modified_by: updatedBy,
            changes: input,
            device_id: syncQueue.getDeviceId(),
        });
        electron_log_1.default.info(`[LocalFirst] Kas transaction updated: ${id}, queued for sync with conflict metadata`);
        return {
            success: true,
            message: 'Transaksi berhasil diupdate (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to update Kas transaction:', error);
        return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
    }
}
function updateBankTransactionLocalFirst(id, input, updatedBy) {
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
        electron_log_1.default.info(`[LocalFirst] Bank transaction updated: ${id}, queued for sync with conflict metadata`);
        return {
            success: true,
            message: 'Transaksi berhasil diupdate (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to update Bank transaction:', error);
        return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
    }
}
function updateGudangTransactionLocalFirst(id, input, updatedBy) {
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
        electron_log_1.default.info(`[LocalFirst] Gudang transaction updated: ${id}, queued for sync with conflict metadata`);
        return {
            success: true,
            message: 'Transaksi berhasil diupdate (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to update Gudang transaction:', error);
        return { success: false, message: 'Gagal mengupdate transaksi', syncStatus: 'error' };
    }
}
// ============ DELETE Operations (Soft Delete) ============
// Soft delete with sync queue
function deleteKasTransactionLocalFirst(id) {
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
        electron_log_1.default.info(`[LocalFirst] Kas transaction deleted (soft): ${id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil dihapus (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to delete Kas transaction:', error);
        return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
    }
}
function deleteBankTransactionLocalFirst(id) {
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
        electron_log_1.default.info(`[LocalFirst] Bank transaction deleted (soft): ${id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil dihapus (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to delete Bank transaction:', error);
        return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
    }
}
function deleteGudangTransactionLocalFirst(id) {
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
        electron_log_1.default.info(`[LocalFirst] Gudang transaction deleted (soft): ${id}, queued for sync`);
        return {
            success: true,
            message: 'Transaksi berhasil dihapus (queued for sync)',
            syncStatus: 'pending',
        };
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to delete Gudang transaction:', error);
        return { success: false, message: 'Gagal menghapus transaksi', syncStatus: 'error' };
    }
}
// ============ Master Data Operations ============
// COA operations with local-first
function createCOALocalFirst(kode, nama, tipe, parentId, statusAktif) {
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to create COA:', error);
        return { success: false, message: 'Gagal membuat COA', syncStatus: 'error' };
    }
}
function updateCOALocalFirst(id, nama, tipe, parentId, statusAktif) {
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to update COA:', error);
        return { success: false, message: 'Gagal mengupdate COA', syncStatus: 'error' };
    }
}
function deleteCOALocalFirst(id) {
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to delete COA:', error);
        return { success: false, message: 'Gagal menghapus COA', syncStatus: 'error' };
    }
}
// Blok operations with local-first
function createBlokLocalFirst(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) {
    try {
        const result = blokDb.createBlok(kodeBlok, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to create Blok:', error);
        return { success: false, message: 'Gagal membuat Blok', syncStatus: 'error' };
    }
}
function updateBlokLocalFirst(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027) {
    try {
        const result = blokDb.updateBlok(id, nama, tahunTanam, luas, status, keterangan, pokok, sph, bulanTanam, statusTanaman2025, statusTanaman2026, statusTanaman2027);
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to update Blok:', error);
        return { success: false, message: 'Gagal mengupdate Blok', syncStatus: 'error' };
    }
}
function deleteBlokLocalFirst(id) {
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to delete Blok:', error);
        return { success: false, message: 'Gagal menghapus Blok', syncStatus: 'error' };
    }
}
// ============ Sync Queue Status ============
function getSyncQueueStatus() {
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
    }
    catch (error) {
        electron_log_1.default.error('[LocalFirst] Failed to get sync queue status:', error);
        return { pending: 0, failed: 0, total: 0, items: [] };
    }
}
// Check if we have pending operations for a specific module
function hasPendingSyncForModule(module) {
    const status = getSyncQueueStatus();
    return status.items.some(item => item.module === module);
}
// Get count of pending operations for a module
function getPendingSyncCountForModule(module) {
    const status = getSyncQueueStatus();
    return status.items.filter(item => item.module === module).length;
}
exports.default = {
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
    // Sync status
    getSyncQueueStatus,
    hasPendingSyncForModule,
    getPendingSyncCountForModule,
};
