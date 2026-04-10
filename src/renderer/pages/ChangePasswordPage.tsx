import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ChangePasswordPageProps {
  onBack?: () => void;
}

const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ onBack }) => {
  const { user, changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    setSuccess('');
    setIsLoading(true);

    try {
      // Validate old password is not empty
      if (!oldPassword) {
        setError('Password lama harus diisi');
        setIsLoading(false);
        return;
      }

      // Validate new password
      if (!newPassword) {
        setError('Password baru harus diisi');
        setIsLoading(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('Password baru tidak cocok');
        setIsLoading(false);
        return;
      }

      const pwdValidation = await validatePassword(newPassword);
      if (!pwdValidation.valid) {
        setError(pwdValidation.message);
        setIsLoading(false);
        return;
      }

      const result = await changePassword(oldPassword, newPassword);
      
      if (result.success) {
        setSuccess('Password berhasil diubah');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Terjadi kesalahan saat mengubah password');
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
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Ubah Password</h1>
            <p className="text-sm text-gray-500">Ubah password untuk akun {user?.username}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-md mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* Old Password */}
            <div>
              <label htmlFor="oldPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Password Lama <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="oldPassword"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Masukkan password lama"
                required
              />
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Password Baru <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Masukkan password baru"
                required
              />
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                <p className="flex items-center gap-1">
                  <svg className={`w-4 h-4 ${newPassword.length >= 8 ? 'text-green-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Minimal 8 karakter
                </p>
                <p className="flex items-center gap-1">
                  <svg className={`w-4 h-4 ${/[A-Z]/.test(newPassword) ? 'text-green-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mengandung huruf besar
                </p>
                <p className="flex items-center gap-1">
                  <svg className={`w-4 h-4 ${/[0-9]/.test(newPassword) ? 'text-green-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mengandung angka
                </p>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Konfirmasi Password Baru <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Konfirmasi password baru"
                required
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-xs text-red-500">Password tidak cocok</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onBack}
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
                {isLoading ? 'Memproses...' : 'Ubah Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
