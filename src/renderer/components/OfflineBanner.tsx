import React, { useState } from 'react';
import { useSync } from '../context/SyncContext';

/**
 * OfflineBanner Component
 * 
 * Displays a warning banner at the top of forms when the network is offline.
 * Shows a clear message that data will be saved locally and synced later.
 * Dismissible via X button.
 * 
 * Used in: KasFormPage, BankFormPage, GudangFormPage
 */
const OfflineBanner: React.FC = () => {
  const { isOnline } = useSync();
  const [dismissed, setDismissed] = useState(false);

  // Don't render anything when online or dismissed
  if (isOnline || dismissed) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center justify-center gap-3">
      <svg 
        className="w-5 h-5 text-yellow-600 flex-shrink-0" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" 
        />
      </svg>
      <span className="text-yellow-800 text-sm">
        Offline — Perubahan akan diqueue dan disinkronkan saat koneksi pulih
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 p-1 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 rounded transition-colors"
        aria-label="Tutup banner offline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default OfflineBanner;
