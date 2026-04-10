import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
  last_login: string | null;
  created_at: string;
}

interface UserListPageProps {
  onNavigateToUserForm?: (user?: User) => void;
  onNavigateToActivityLog?: () => void;
  onNavigateToSessions?: () => void;
  onNavigateToChangePassword?: () => void;
}

interface ImportConflict {
  username: string;
  full_name: string;
  role: string;
}

const UserListPage: React.FC<UserListPageProps> = ({
  onNavigateToUserForm,
  onNavigateToActivityLog,
  onNavigateToSessions,
  onNavigateToChangePassword,
}) => {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearError, setClearError] = useState('');

  // Export/Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportConflictDialog, setShowImportConflictDialog] = useState(false);
  const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);
  const [importFilePath, setImportFilePath] = useState('');
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    if (!window.electronAPI) return;
    
    try {
      const userList = await window.electronAPI.getAllUsers();
      setUsers(userList);
    } catch (error) {
      console.error('[UserList] Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (userId: string) => {
    if (!currentUser || !window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.deleteUser(userId, currentUser.id);
      if (result.success) {
        setShowDeleteConfirm(null);
        loadUsers();
      } else {
        setDeleteError(result.message);
        setTimeout(() => setDeleteError(''), 3000);
      }
    } catch (error) {
      console.error('[UserList] Delete error:', error);
      setDeleteError('Gagal menghapus user');
      setTimeout(() => setDeleteError(''), 3000);
    }
  };

  const handleClearAll = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.clearAllUsers();
      if (result.success) {
        setShowClearConfirm(false);
        loadUsers();
      } else {
        setClearError(result.message);
        setTimeout(() => setClearError(''), 5000);
      }
    } catch (error) {
      console.error('[USER] Clear all error:', error);
      setClearError('Gagal menghapus semua user');
      setTimeout(() => setClearError(''), 5000);
    }
  };

  // Export users database
  const handleExportDatabase = async () => {
    if (!window.electronAPI) return;

    try {
      // Get current date for filename
      const date = new Date().toISOString().split('T')[0];
      const defaultName = `users_backup_${date}.db`;

      const saveResult = await window.electronAPI.showSaveDialog(defaultName);
      if (!saveResult.canceled && saveResult.filePath) {
        setIsExporting(true);
        const result = await window.electronAPI.exportUsersDatabase(saveResult.filePath);
        if (result.success) {
          setImportMessage({ type: 'success', text: 'Database berhasil di-export' });
          setTimeout(() => setImportMessage(null), 5000);
        } else {
          setImportMessage({ type: 'error', text: result.message });
          setTimeout(() => setImportMessage(null), 5000);
        }
        setIsExporting(false);
      }
    } catch (error) {
      console.error('[USER] Export database error:', error);
      setIsExporting(false);
      setImportMessage({ type: 'error', text: 'Export database gagal' });
      setTimeout(() => setImportMessage(null), 5000);
    }
  };

  // Import users database - first show file dialog
  const handleImportDatabase = async () => {
    if (!window.electronAPI) return;

    try {
      const openResult = await window.electronAPI.showOpenDialog('Pilih file users.db untuk di-import');
      if (!openResult.canceled && openResult.filePaths && openResult.filePaths.length > 0) {
        const filePath = openResult.filePaths[0];
        setImportFilePath(filePath);

        // Show confirmation dialog with progress
        setIsImporting(true);

        // First try to import - backend will handle conflicts
        const result = await window.electronAPI.importUsersDatabase(filePath, 'skip');

        if (result.success) {
          setImportMessage({ type: 'success', text: result.message });
          setTimeout(() => setImportMessage(null), 5000);
          loadUsers();
        } else {
          setImportMessage({ type: 'error', text: result.message });
          setTimeout(() => setImportMessage(null), 5000);
        }
        setIsImporting(false);
      }
    } catch (error) {
      console.error('[USER] Import database error:', error);
      setIsImporting(false);
      setImportMessage({ type: 'error', text: 'Import database gagal' });
      setTimeout(() => setImportMessage(null), 5000);
    }
  };

  // Handle import with conflict resolution
  const handleImportWithResolution = async (resolution: 'skip' | 'overwrite' | 'merge') => {
    if (!window.electronAPI || !importFilePath) return;

    setShowImportConflictDialog(false);
    setIsImporting(true);

    try {
      const result = await window.electronAPI.importUsersDatabase(importFilePath, resolution);
      if (result.success) {
        setImportMessage({ type: 'success', text: result.message });
        setTimeout(() => setImportMessage(null), 5000);
        loadUsers();
      } else {
        setImportMessage({ type: 'error', text: result.message });
        setTimeout(() => setImportMessage(null), 5000);
      }
    } catch (error) {
      console.error('[USER] Import with resolution error:', error);
      setImportMessage({ type: 'error', text: 'Import gagal' });
      setTimeout(() => setImportMessage(null), 5000);
    } finally {
      setIsImporting(false);
      setImportFilePath('');
    }
  };

  const handleExportExcel = () => {
    const data = users.map((u, index) => ({
      No: index + 1,
      Username: u.username,
      'Nama Lengkap': u.full_name,
      Role: u.role,
      Status: u.status === 'active' ? 'Aktif' : 'Nonaktif',
      'Login Terakhir': u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : '-',
      'Dibuat Pada': new Date(u.created_at).toLocaleString('id-ID'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar User');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // Username
      { wch: 25 },  // Full Name
      { wch: 15 },  // Role
      { wch: 10 },  // Status
      { wch: 20 },  // Last Login
      { wch: 20 },  // Created At
    ];

    XLSX.writeFile(workbook, 'daftar_user.xlsx');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('id-ID');
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Administrator':
        return 'bg-red-100 text-red-800';
      case 'Approver':
        return 'bg-purple-100 text-purple-800';
      case 'Inputan Kas':
        return 'bg-green-100 text-green-800';
      case 'Inputan Bank':
        return 'bg-blue-100 text-blue-800';
      case 'Inputan Gudang':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isAdmin = currentUser?.role === 'Administrator';

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Manajemen User</h1>
            <p className="text-sm text-gray-500">Kelola data user dan hak akses</p>
          </div>
          <div className="flex items-center gap-3">
              <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={handleExportDatabase}
                  disabled={isExporting}
                  className={`px-4 py-2 text-white rounded-lg text-sm font-medium flex items-center gap-2 ${
                    isExporting 
                      ? 'bg-blue-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Export Database
                    </>
                  )}
                </button>
                <button
                  onClick={handleImportDatabase}
                  disabled={isImporting}
                  className={`px-4 py-2 text-white rounded-lg text-sm font-medium flex items-center gap-2 ${
                    isImporting 
                      ? 'bg-purple-400 cursor-not-allowed' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isImporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Importing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Import Database
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear All
                </button>
                <button
                  onClick={() => onNavigateToUserForm?.()}
                  className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Tambah User
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error/Success message */}
      {deleteError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {deleteError}
        </div>
      )}
      {clearError && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {clearError}
        </div>
      )}
      {importMessage && (
        <div className={`mx-6 mt-4 border px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          importMessage.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-700' 
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {importMessage.type === 'success' ? (
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {importMessage.text}
        </div>
      )}

      {/* Loading overlay for import/export */}
      {(isExporting || isImporting) && (
        <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {isExporting ? 'Sedang meng-export database...' : 'Sedang meng-import database...'}
        </div>
      )}

      {/* User List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Lengkap</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Login Terakhir</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Memuat...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Tidak ada data user
                  </td>
                </tr>
              ) : (
                users.map((user, index) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{user.full_name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(user.last_login)}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => onNavigateToUserForm?.(user)}
                              className="text-primary-600 hover:text-primary-800"
                              title="Edit"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {showDeleteConfirm === user.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(user.id)}
                                  className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1"
                                >
                                  Ya
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="text-gray-600 hover:text-gray-800 font-medium text-xs px-2 py-1"
                                >
                                  Tidak
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowDeleteConfirm(user.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Hapus"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                        {user.id === currentUser?.id && (
                          <button
                            onClick={() => onNavigateToChangePassword?.()}
                            className="text-gray-600 hover:text-gray-800"
                            title="Ubah Password"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Hapus Semua User</h3>
                <p className="text-sm text-gray-500">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Apakah Anda yakin ingin menghapus <strong>semua user</strong>? Tindakan ini akan menghapus semua data user kecuali akun Anda sendiri.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateToActivityLog?.()}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Log Aktivitas
            </button>
            {isAdmin && (
              <button
                onClick={() => onNavigateToSessions?.()}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Kelola Sesi
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Login sebagai: <strong>{currentUser?.full_name}</strong> ({currentUser?.role})
            </span>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Import Conflict Resolution Dialog */}
      {showImportConflictDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Konflik Data Terdeteksi</h3>
                <p className="text-sm text-gray-500">Ada {importConflicts.length} user dengan username yang sudah ada</p>
              </div>
            </div>

            {/* Conflict list */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2">Username</th>
                    <th className="pb-2">Nama</th>
                    <th className="pb-2">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {importConflicts.map((conflict, idx) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="py-2 font-mono">{conflict.username}</td>
                      <td className="py-2">{conflict.full_name}</td>
                      <td className="py-2">{conflict.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-gray-600 mb-6">
              Pilih cara menyelesaikan konflik:
            </p>

            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={() => handleImportWithResolution('skip')}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium text-left flex items-center gap-3"
              >
                <span className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center font-bold">1</span>
                <div>
                  <div className="font-medium">Lewati</div>
                  <div className="text-xs text-gray-500">User yang konflik tidak di-import</div>
                </div>
              </button>
              <button
                onClick={() => handleImportWithResolution('overwrite')}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium text-left flex items-center gap-3"
              >
                <span className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">2</span>
                <div>
                  <div className="font-medium">Timpa</div>
                  <div className="text-xs text-gray-500">Ganti data user yang sudah ada dengan yang baru</div>
                </div>
              </button>
              <button
                onClick={() => handleImportWithResolution('merge')}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium text-left flex items-center gap-3"
              >
                <span className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">3</span>
                <div>
                  <div className="font-medium">Gabungkan</div>
                  <div className="text-xs text-gray-500">Update role jika berbeda, pertahankan data lain</div>
                </div>
              </button>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportConflictDialog(false);
                  setImportFilePath('');
                  setImportConflicts([]);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserListPage;
