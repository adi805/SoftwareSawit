import React, { useState, useRef, useEffect } from 'react';
import { useSync, Notification } from '../context/SyncContext';

/**
 * Format timestamp to relative time (Indonesian)
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'baru saja';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} menit yang lalu`;
  } else if (diffHours < 24) {
    return `${diffHours} jam yang lalu`;
  } else if (diffDays === 1) {
    return 'kemarin';
  } else if (diffDays < 7) {
    return `${diffDays} hari yang lalu`;
  } else {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'success':
      return (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case 'warning':
      return (
        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      );
    case 'info':
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
  }
}

/**
 * NotificationHistory - Bell icon with dropdown showing notification history
 */
const NotificationHistory: React.FC = () => {
  const {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotificationHistory,
  } = useSync();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Mark notification as read when viewing
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markNotificationRead(notification.id);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="font-semibold text-gray-800">Riwayat Notifikasi</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllNotificationsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Tandai semua dibaca
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearNotificationHistory}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Hapus semua
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-2 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <p className="text-sm">Tidak ada notifikasi</p>
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`
                      px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors
                      ${!notification.read ? 'bg-blue-50/50' : ''}
                    `}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatRelativeTime(notification.timestamp)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="flex-shrink-0">
                          <span className="w-2 h-2 bg-blue-500 rounded-full block" />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-center">
              <span className="text-xs text-gray-500">
                {notifications.length} notifikasi
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationHistory;
