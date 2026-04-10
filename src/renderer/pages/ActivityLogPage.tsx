import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

interface ActivityLogPageProps {
  onBack?: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  'USER_CREATED': 'User Dibuat',
  'USER_UPDATED': 'User Diupdate',
  'USER_DELETED': 'User Dihapus',
  'LOGIN': 'Login',
  'LOGOUT': 'Logout',
  'PASSWORD_CHANGED': 'Password Diubah',
  'PASSWORD_CHANGE_FAILED': 'Gagal Ubah Password',
  'PASSWORD_RESET': 'Password Direset',
  'ACCOUNT_LOCKED': 'Akun Terkunci',
  'SESSION_TERMINATED': 'Sesi Dihentikan',
};

const ActivityLogPage: React.FC<ActivityLogPageProps> = ({ onBack }) => {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!window.electronAPI) return;

    try {
      const userId = filterUserId || undefined;
      const activityLogs = await window.electronAPI.getActivityLog(userId, 200);
      setLogs(activityLogs);
    } catch (error) {
      console.error('[ActivityLog] Failed to load logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filterUserId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETED') || action.includes('FAILED') || action.includes('LOCKED')) {
      return 'bg-red-100 text-red-800';
    }
    if (action.includes('CREATED') || action.includes('CHANGED') || action.includes('RESET')) {
      return 'bg-green-100 text-green-800';
    }
    if (action.includes('LOGIN')) {
      return 'bg-blue-100 text-blue-800';
    }
    if (action.includes('LOGOUT')) {
      return 'bg-gray-100 text-gray-800';
    }
    return 'bg-purple-100 text-purple-800';
  };

  const handleCopy = (log: ActivityLog) => {
    const text = `[${formatTimestamp(log.created_at)}] [${ACTION_LABELS[log.action] || log.action}] ${log.details || '-'}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCopyAll = () => {
    const text = logs
      .map((log) => `[${formatTimestamp(log.created_at)}] [${ACTION_LABELS[log.action] || log.action}] ${log.details || '-'}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const isAdmin = currentUser?.role === 'Administrator';

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
              <h1 className="text-xl font-bold text-gray-800">Log Aktivitas</h1>
              <p className="text-sm text-gray-500">Riwayat aktivitas user dalam sistem</p>
            </div>
          </div>
          <button
            onClick={handleCopyAll}
            className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Semua
          </button>
        </div>
      </div>

      {/* Filter */}
      {isAdmin && (
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-600">Filter berdasarkan User:</label>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Semua User</option>
            </select>
            <button
              onClick={loadLogs}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Log List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500">
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Memuat...
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Tidak ada log aktivitas
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleCopy(log)}
                  title="Klik untuk copy"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getActionColor(log.action)}`}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimestamp(log.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">
                        {log.details || '-'}
                      </p>
                    </div>
                    {copiedId === log.id && (
                      <span className="text-green-600 text-xs">Copied!</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="bg-white border-t border-gray-200 px-6 py-2">
        <p className="text-xs text-gray-400">
          Klik pada log untuk copy ke clipboard • {logs.length} entri
        </p>
      </div>
    </div>
  );
};

export default ActivityLogPage;
