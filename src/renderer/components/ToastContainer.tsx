import React, { useEffect, useState } from 'react';
import { useSync } from '../context/SyncContext';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

/**
 * Individual Toast component
 */
const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      handleDismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 300); // Wait for exit animation
  };

  const bgColorClass = toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'error' ? 'bg-red-600' :
    toast.type === 'warning' ? 'bg-yellow-600' :
    'bg-blue-600';

  const icon = toast.type === 'success' ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ) : toast.type === 'error' ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ) : toast.type === 'warning' ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div
      className={`
        ${bgColorClass} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 
        max-w-sm w-full
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
      aria-live="polite"
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

/**
 * ToastContainer - Displays multiple stacked toast notifications
 * 
 * Displays toasts in the top-right corner, stacking newest on top.
 * Each toast auto-dismisses after 5 seconds and can be manually dismissed.
 */
const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useSync();
  
  // Convert notifications to toast items (use most recent ones, max 5 visible)
  const visibleToasts: ToastItem[] = notifications
    .slice(0, 5)
    .map(n => ({
      id: n.id,
      type: n.type,
      message: n.message,
    }));

  const handleDismiss = (id: string) => {
    dismissNotification(id);
  };

  if (visibleToasts.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {visibleToasts.map((toast, index) => (
        <div 
          key={toast.id} 
          className="pointer-events-auto"
          style={{ 
            animationDelay: `${index * 0.1}s`,
            // Stack animation - each toast appears slightly offset
            marginTop: index > 0 ? '-8px' : '0',
          }}
        >
          <Toast toast={toast} onDismiss={handleDismiss} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
