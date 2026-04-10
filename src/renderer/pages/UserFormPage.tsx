import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
}

interface UserFormPageProps {
  user?: User | null;
  onSave?: () => void;
  onCancel?: () => void;
}

const ROLES = ['Administrator', 'Inputan Kas', 'Inputan Bank', 'Inputan Gudang', 'Approver'];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Administrator': [
    'Akses penuh ke semua modul',
    'Kelola user dan role',
    'Kelola sesi user',
    'Lihat log aktivitas',
    'Reset password user',
    'Export data',
  ],
  'Inputan Kas': [
    'Input transaksi kas',
    'Edit transaksi kas own',
    'Lihat laporan kas',
  ],
  'Inputan Bank': [
    'Input transaksi bank',
    'Edit transaksi bank own',
    'Lihat laporan bank',
  ],
  'Inputan Gudang': [
    'Input transaksi gudang',
    'Edit transaksi gudang own',
    'Lihat laporan gudang',
  ],
  'Approver': [
    'Approve/reject transaksi',
    'Lihat semua laporan',
    'Export data',
  ],
};

const UserFormPage: React.FC<UserFormPageProps> = ({ user, onSave, onCancel }) => {
  const { user: currentUser } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [roles, setRoles] = useState<string[]>(ROLES);

  const isEditMode = !!user;

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setFullName(user.full_name);
      setRole(user.role);
    }
  }, [user]);

  // Load roles from main process
  useEffect(() => {
    const loadRoles = async () => {
      if (window.electronAPI) {
        const loadedRoles = await window.electronAPI.getRoles();
        setRoles(loadedRoles);
      }
    };
    loadRoles();
  }, []);

  const validatePassword = async (pwd: string): Promise<{ valid: boolean; message: string }> => {
    if (!window.electronAPI) {
      // Fallback validation
      if (pwd.length < 8) return { valid: false, message: 'Password minimal 8 karakter' };
      if (!/[A-Z]/.test(pwd)) return { valid: false, message: 'Password harus mengandung huruf besar' };
      if (!/[0-9]/.test(pwd)) return { valid: false, message: 'Password harus mengandung angka' };
      return { valid: true, message: 'Password valid' };
    }
    return await window.electronAPI.validatePassword(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate required fields
      if (!fullName.trim()) {
        setError('Nama lengkap harus diisi');
        setIsLoading(false);
        return;
      }

      if (!isEditMode) {
        // Validate password for new user
        if (!password) {
          setError('Password harus diisi');
          setIsLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError('Password tidak cocok');
          setIsLoading(false);
          return;
        }

        const pwdValidation = await validatePassword(password);
        if (!pwdValidation.valid) {
          setError(pwdValidation.message);
          setIsLoading(false);
          return;
        }

        // Check if only admin can assign admin role
        if (role === 'Administrator' && currentUser?.role !== 'Administrator') {
          setError('Hanya admin yang dapat membuat user Administrator');
          setIsLoading(false);
          return;
        }

        if (!window.electronAPI) {
          setError('Electron API not available');
          setIsLoading(false);
          return;
        }

        const result = await window.electronAPI.createUser(username, password, fullName, role);
        if (result.success) {
          onSave?.();
        } else {
          setError(result.message);
        }
      } else {
        // Only admin can change roles
        if (role === 'Administrator' && currentUser?.role !== 'Administrator') {
          setError('Hanya admin yang dapat mengubah role ke Administrator');
          setIsLoading(false);
          return;
        }

        if (!window.electronAPI) {
          setError('Electron API not available');
          setIsLoading(false);
          return;
        }

        const result = await window.electronAPI.updateUser(user.id, fullName, role);
        if (result.success) {
          onSave?.();
        } else {
          setError(result.message);
        }
      }
    } catch (err) {
      setError('Terjadi kesalahan saat menyimpan');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {isEditMode ? 'Edit User' : 'Tambah User Baru'}
            </h1>
            <p className="text-sm text-gray-500">
              {isEditMode ? 'Edit informasi user' : 'Tambah user baru ke sistem'}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Username - disabled in edit mode */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEditMode}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                placeholder="Masukkan username"
                required
              />
              {isEditMode && (
                <p className="mt-1 text-xs text-gray-500">Username tidak dapat diubah</p>
              )}
            </div>

            {/* Password - only for new users */}
            {!isEditMode && (
              <>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Masukkan password"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimal 8 karakter, mengandung huruf besar dan angka
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Konfirmasi Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Konfirmasi password"
                    required
                  />
                </div>
              </>
            )}

            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Permission Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview Hak Akses ({role})</h3>
              <ul className="space-y-1">
                {ROLE_PERMISSIONS[role]?.map((perm, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {perm}
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                  isLoading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-700 hover:bg-primary-800'
                }`}
              >
                {isLoading ? 'Memproses...' : isEditMode ? 'Simpan Perubahan' : 'Buat User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserFormPage;
