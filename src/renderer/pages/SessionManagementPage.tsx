import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface Session {
  id: string;
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string;
}

interface SessionWithUser extends Session {
  user: {
    username: string;
    full_name: string;
    role: string;
  };
}

interface SessionManagementPageProps {
  onBack?: () => void;
}

const SessionManagementPage: React.FC<SessionManagementPageProps> = ({ onBack }) => {
  const { user: currentUser } = useAuth();
  const [sessions, setSessions] = useState<SessionWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [terminateConfirm, setTerminateConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const activeSessions = await window.electronAPI.getActiveSessions();
      setSessions(activeSessions);
    } catch (err) {
      console.error('[Sessions] Failed to load sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleTerminate = async (sessionId: string) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.terminateSession(sessionId);
      if (result.success) {
        setTerminateConfirm(null);
        loadSessions();
      } else {
        setError(result.message);
        setTimeout(() => setError(''), 3000);
      }
    } catch (err) {
      console.error('[Sessions] Terminate error:', err);
      setError('Gagal mengakhiri sesi');
      setTimeout(() => setError(''), 3000);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const isOwnSession = (session: SessionWithUser) => {
    return session.user_id === currentUser?.id;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
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
              <h1 className="text-xl font-bold text-gray-800">Kelola Sesi</h1>
              <p className="text-sm text-gray-500">Lihat dan kelola sesi user aktif</p>
            </div>
          </div>
          <button
            onClick={loadSessions}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Session List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mulai</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sisa Waktu</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Memuat...
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Tidak ada sesi aktif
                  </td>
                </tr>
              ) : (
                sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-700 font-medium text-sm">
                            {session.user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{session.user.full_name}</p>
                          <p className="text-xs text-gray-500">{session.user.username}</p>
                        </div>
                        {isOwnSession(session) && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Anda</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{session.user.role}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(session.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(session.expires_at)}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        {getTimeRemaining(session.expires_at)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {terminateConfirm === session.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTerminate(session.id)}
                            className="text-red-600 hover:text-red-800 font-medium text-xs px-2 py-1"
                          >
                            Ya, Akhiri
                          </button>
                          <button
                            onClick={() => setTerminateConfirm(null)}
                            className="text-gray-600 hover:text-gray-800 font-medium text-xs px-2 py-1"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setTerminateConfirm(session.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Akhiri Sesi"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      <div className="bg-white border-t border-gray-200 px-6 py-2">
        <p className="text-xs text-gray-400">
          {sessions.length} sesi aktif
        </p>
      </div>
    </div>
  );
};

export default SessionManagementPage;
