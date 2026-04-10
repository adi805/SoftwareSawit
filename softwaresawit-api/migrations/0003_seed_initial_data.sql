-- Migration: 0003_seed_initial_data
-- Description: Seed initial master data for SoftwareSawit
-- Created: 2026-04-08

-- ============================================
-- INITIAL COA DATA
-- ============================================

INSERT INTO coa (id, kode, nama, jenis, kategori, sync_status) VALUES
    ('coa-1001', '1101', 'Kas', 'asset', 'Aset Lancar', 'synced'),
    ('coa-1002', '1102', 'Bank', 'asset', 'Aset Lancar', 'synced'),
    ('coa-1003', '1103', 'Piutang', 'asset', 'Aset Lancar', 'synced'),
    ('coa-1004', '1104', 'Persediaan', 'asset', 'Aset Lancar', 'synced'),
    ('coa-2001', '2101', 'Hutang Dagang', 'liability', 'Hutang Lancar', 'synced'),
    ('coa-2002', '2102', 'Hutang Bank', 'liability', 'Hutang Jangka Panjang', 'synced'),
    ('coa-3001', '3001', 'Modal', 'equity', 'Modal', 'synced'),
    ('coa-4001', '4101', 'Pendapatan Penjualan', 'revenue', 'Pendapatan', 'synced'),
    ('coa-5001', '5101', 'Beban Gaji', 'expense', 'Beban Operasional', 'synced'),
    ('coa-5002', '5102', 'Beban Supplies', 'expense', 'Beban Operasional', 'synced'),
    ('coa-5003', '5103', 'Beban Transport', 'expense', 'Beban Operasional', 'synced'),
    ('coa-5004', '5104', 'Beban Lain-lain', 'expense', 'Beban Lain', 'synced');

-- ============================================
-- INITIAL ASPEK KERJA DATA
-- ============================================

INSERT INTO aspek_kerja (id, kode, nama, kategori, sync_status) VALUES
    ('aspek-001', 'AK-001', 'Pemeliharaan Kebun', 'operasional', 'synced'),
    ('aspek-002', 'AK-002', 'Panen', 'operasional', 'synced'),
    ('aspek-003', 'AK-003', 'Pengangkutan', 'transport', 'synced'),
    ('aspek-004', 'AK-004', 'Pengelolaan Kantor', 'admin', 'synced'),
    ('aspek-005', 'AK-005', 'Perbaikan Mesin', 'maintenance', 'synced');

-- ============================================
-- DEFAULT ADMIN USER
-- ============================================

INSERT INTO users (id, username, password, nama, role, modules, sync_status) VALUES
    ('user-admin-001', 'admin', 'admin123', 'Administrator', 'admin', '["kas", "bank", "gudang"]', 'synced');
