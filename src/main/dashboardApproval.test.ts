/**
 * Dashboard Approval Service Tests
 * 
 * Tests for F002-BE: Dashboard Approval Backend
 * F003-TEST: Dashboard Testing
 */

import * as dashboardApproval from './dashboardApproval';
import * as kasDb from './kasDatabase';
import * as bankDb from './bankDatabase';
import * as gudangDb from './gudangDatabase';

// Mock the dependencies
jest.mock('./localDatabaseManager', () => ({
  localDatabaseManager: {
    getExistingPeriods: jest.fn(),
    getTransactionDatabasePath: jest.fn(),
  },
}));

jest.mock('sql.js', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      run: jest.fn(),
      exec: jest.fn(),
      close: jest.fn(),
    })),
  };
});

jest.mock('electron-log', () => {
  return {
    __esModule: true,
    default: {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
  };
});

// Mock database modules
jest.mock('./kasDatabase', () => ({
  TRANSACTION_STATUS: {
    PENDING_APPROVAL_1: 'Pending Approval 1',
    PENDING_APPROVAL_2: 'Pending Approval 2',
    FULLY_APPROVED: 'Fully Approved',
    REJECTED: 'Rejected',
  },
  approveTransaction: jest.fn(),
  rejectTransaction: jest.fn(),
  getTransactionById: jest.fn(),
  getApprovalHistory: jest.fn(),
}));

jest.mock('./bankDatabase', () => ({
  TRANSACTION_STATUS: {
    PENDING_APPROVAL_1: 'Pending Approval 1',
    PENDING_APPROVAL_2: 'Pending Approval 2',
    FULLY_APPROVED: 'Fully Approved',
    REJECTED: 'Rejected',
  },
  approveTransaction: jest.fn(),
  rejectTransaction: jest.fn(),
  getTransactionById: jest.fn(),
  getApprovalHistory: jest.fn(),
}));

jest.mock('./gudangDatabase', () => ({
  TRANSACTION_STATUS: {
    PENDING_APPROVAL_1: 'Pending Approval 1',
    PENDING_APPROVAL_2: 'Pending Approval 2',
    FULLY_APPROVED: 'Fully Approved',
    REJECTED: 'Rejected',
  },
  approveTransaction: jest.fn(),
  rejectTransaction: jest.fn(),
  getTransactionById: jest.fn(),
  getApprovalHistory: jest.fn(),
}));

describe('Dashboard Approval Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('approveFromDashboard', () => {
    it('should route approval to kas module correctly', async () => {
      (kasDb.approveTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil disetujui' });

      const result = await dashboardApproval.approveFromDashboard('kas', 'tx-123', {
        approver_id: 'approver-1',
        approver_name: 'Approver One',
      });

      expect(result.success).toBe(true);
      expect(kasDb.approveTransaction).toHaveBeenCalledWith('tx-123', {
        approver_id: 'approver-1',
        approver_name: 'Approver One',
      });
    });

    it('should route approval to bank module correctly', async () => {
      (bankDb.approveTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil disetujui' });

      const result = await dashboardApproval.approveFromDashboard('bank', 'tx-456', {
        approver_id: 'approver-2',
        approver_name: 'Approver Two',
      });

      expect(result.success).toBe(true);
      expect(bankDb.approveTransaction).toHaveBeenCalledWith('tx-456', {
        approver_id: 'approver-2',
        approver_name: 'Approver Two',
      });
    });

    it('should route approval to gudang module correctly', async () => {
      (gudangDb.approveTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil disetujui' });

      const result = await dashboardApproval.approveFromDashboard('gudang', 'tx-789', {
        approver_id: 'approver-3',
        approver_name: 'Approver Three',
      });

      expect(result.success).toBe(true);
      expect(gudangDb.approveTransaction).toHaveBeenCalledWith('tx-789', {
        approver_id: 'approver-3',
        approver_name: 'Approver Three',
      });
    });

    it('should return error for invalid module', async () => {
      const result = await dashboardApproval.approveFromDashboard('invalid' as any, 'tx-123', {
        approver_id: 'approver-1',
        approver_name: 'Approver One',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Modul tidak valid');
    });

    it('should enforce creator cannot approve own transaction (kas)', async () => {
      (kasDb.approveTransaction as jest.Mock).mockReturnValue({ 
        success: false, 
        message: 'Tidak dapat menyetujui transaksi sendiri' 
      });

      const result = await dashboardApproval.approveFromDashboard('kas', 'tx-123', {
        approver_id: 'creator-1',
        approver_name: 'Creator One',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Tidak dapat menyetujui transaksi sendiri');
    });
  });

  describe('rejectFromDashboard', () => {
    it('should route rejection to kas module correctly', async () => {
      (kasDb.rejectTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil ditolak' });

      const result = await dashboardApproval.rejectFromDashboard('kas', 'tx-123', {
        rejected_by_id: 'rejector-1',
        rejected_by_name: 'Rejector One',
        reason: 'Invalid data',
      });

      expect(result.success).toBe(true);
      expect(kasDb.rejectTransaction).toHaveBeenCalledWith('tx-123', {
        rejected_by_id: 'rejector-1',
        rejected_by_name: 'Rejector One',
        reason: 'Invalid data',
      });
    });

    it('should route rejection to bank module correctly', async () => {
      (bankDb.rejectTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil ditolak' });

      const result = await dashboardApproval.rejectFromDashboard('bank', 'tx-456', {
        rejected_by_id: 'rejector-2',
        rejected_by_name: 'Rejector Two',
        reason: 'Missing documentation',
      });

      expect(result.success).toBe(true);
      expect(bankDb.rejectTransaction).toHaveBeenCalledWith('tx-456', {
        rejected_by_id: 'rejector-2',
        rejected_by_name: 'Rejector Two',
        reason: 'Missing documentation',
      });
    });

    it('should route rejection to gudang module correctly', async () => {
      (gudangDb.rejectTransaction as jest.Mock).mockReturnValue({ success: true, message: 'Transaksi berhasil ditolak' });

      const result = await dashboardApproval.rejectFromDashboard('gudang', 'tx-789', {
        rejected_by_id: 'rejector-3',
        rejected_by_name: 'Rejector Three',
        reason: 'Amount mismatch',
      });

      expect(result.success).toBe(true);
      expect(gudangDb.rejectTransaction).toHaveBeenCalledWith('tx-789', {
        rejected_by_id: 'rejector-3',
        rejected_by_name: 'Rejector Three',
        reason: 'Amount mismatch',
      });
    });

    it('should validate rejection reason minimum length', async () => {
      const result = await dashboardApproval.rejectFromDashboard('kas', 'tx-123', {
        rejected_by_id: 'rejector-1',
        rejected_by_name: 'Rejector One',
        reason: 'no',  // Less than 5 characters
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alasan penolakan minimal 5 karakter');
    });

    it('should validate rejection reason is not empty', async () => {
      const result = await dashboardApproval.rejectFromDashboard('kas', 'tx-123', {
        rejected_by_id: 'rejector-1',
        rejected_by_name: 'Rejector One',
        reason: '',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alasan penolakan minimal 5 karakter');
    });

    it('should return error for invalid module', async () => {
      const result = await dashboardApproval.rejectFromDashboard('invalid' as any, 'tx-123', {
        rejected_by_id: 'rejector-1',
        rejected_by_name: 'Rejector One',
        reason: 'Some reason here',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Modul tidak valid');
    });
  });

  describe('getTransactionFromDashboard', () => {
    it('should get transaction from kas module', async () => {
      (kasDb.getTransactionById as jest.Mock).mockReturnValue({
        id: 'tx-123',
        transaction_number: 'KAS-M/20260408/0001',
        status: 'Pending Approval 1',
        created_at: new Date().toISOString(),
      });

      const result = await dashboardApproval.getTransactionFromDashboard('kas', 'tx-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('tx-123');
      expect(result?.module).toBe('kas');
    });

    it('should get transaction from bank module', async () => {
      (bankDb.getTransactionById as jest.Mock).mockReturnValue({
        id: 'tx-456',
        transaction_number: 'BANK-M/20260408/0001',
        status: 'Pending Approval 2',
        created_at: new Date().toISOString(),
      });

      const result = await dashboardApproval.getTransactionFromDashboard('bank', 'tx-456');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('tx-456');
      expect(result?.module).toBe('bank');
    });

    it('should get transaction from gudang module', async () => {
      (gudangDb.getTransactionById as jest.Mock).mockReturnValue({
        id: 'tx-789',
        transaction_number: 'GUD-M/20260408/0001',
        status: 'Fully Approved',
        created_at: new Date().toISOString(),
      });

      const result = await dashboardApproval.getTransactionFromDashboard('gudang', 'tx-789');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('tx-789');
      expect(result?.module).toBe('gudang');
    });

    it('should return null for non-existent transaction', async () => {
      (kasDb.getTransactionById as jest.Mock).mockReturnValue(null);

      const result = await dashboardApproval.getTransactionFromDashboard('kas', 'non-existent');

      expect(result).toBeNull();
    });

    it('should calculate overdue status correctly', async () => {
      // Transaction created 48 hours ago
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      (kasDb.getTransactionById as jest.Mock).mockReturnValue({
        id: 'tx-123',
        transaction_number: 'KAS-M/20260408/0001',
        status: 'Pending Approval 1',
        created_at: twoDaysAgo,
      });

      const result = await dashboardApproval.getTransactionFromDashboard('kas', 'tx-123');

      expect(result?.is_overdue).toBe(true);
      expect(result?.hours_pending).toBeGreaterThan(24);
    });
  });

  describe('getApprovalHistoryFromDashboard', () => {
    it('should get approval history from kas module', async () => {
      const mockHistory = [
        { id: 'h1', action: 'created', user_name: 'Creator', action_at: new Date().toISOString() },
      ];
      (kasDb.getApprovalHistory as jest.Mock).mockReturnValue(mockHistory);

      const result = await dashboardApproval.getApprovalHistoryFromDashboard('kas', 'tx-123');

      expect(result).toEqual(mockHistory);
      expect(kasDb.getApprovalHistory).toHaveBeenCalledWith('tx-123');
    });

    it('should get approval history from bank module', async () => {
      const mockHistory = [
        { id: 'h1', action: 'created', user_name: 'Creator', action_at: new Date().toISOString() },
        { id: 'h2', action: 'approved_1', user_name: 'Approver 1', action_at: new Date().toISOString() },
      ];
      (bankDb.getApprovalHistory as jest.Mock).mockReturnValue(mockHistory);

      const result = await dashboardApproval.getApprovalHistoryFromDashboard('bank', 'tx-456');

      expect(result).toEqual(mockHistory);
      expect(bankDb.getApprovalHistory).toHaveBeenCalledWith('tx-456');
    });

    it('should get approval history from gudang module', async () => {
      const mockHistory = [
        { id: 'h1', action: 'created', user_name: 'Creator', action_at: new Date().toISOString() },
        { id: 'h2', action: 'approved_1', user_name: 'Approver 1', action_at: new Date().toISOString() },
        { id: 'h3', action: 'approved_2', user_name: 'Approver 2', action_at: new Date().toISOString() },
      ];
      (gudangDb.getApprovalHistory as jest.Mock).mockReturnValue(mockHistory);

      const result = await dashboardApproval.getApprovalHistoryFromDashboard('gudang', 'tx-789');

      expect(result).toEqual(mockHistory);
      expect(gudangDb.getApprovalHistory).toHaveBeenCalledWith('tx-789');
    });

    it('should return empty array for invalid module', async () => {
      const result = await dashboardApproval.getApprovalHistoryFromDashboard('invalid' as any, 'tx-123');
      expect(result).toEqual([]);
    });
  });
});
