import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import UserManagement from './components/UserManagement';
import SyncStatusBar from './components/SyncStatusBar';
import SyncSettingsPage from './pages/SyncSettingsPage';
import LoginPage from './pages/LoginPage';
import RevisionRequestForm, { RevisionTransactionData } from './components/RevisionRequestForm';
import COAListPage from './pages/COAListPage';
import COAFormPage from './pages/COAFormPage';
import AspekKerjaListPage from './pages/AspekKerjaListPage';
import AspekKerjaFormPage from './pages/AspekKerjaFormPage';
import BlokListPage from './pages/BlokListPage';
import BlokFormPage from './pages/BlokFormPage';
import KasListPage from './pages/KasListPage';
import KasFormPage from './pages/KasFormPage';
import BankListPage from './pages/BankListPage';
import BankFormPage from './pages/BankFormPage';
import GudangListPage from './pages/GudangListPage';
import GudangFormPage from './pages/GudangFormPage';
import DashboardApprovalPage from './pages/DashboardApprovalPage';
import RevisionApprovalPage from './pages/RevisionApprovalPage';
import { useAuth } from './context/AuthContext';
import { SyncProvider } from './context/SyncContext';

interface AppInfo {
  version: string;
  electron: string;
  node: string;
  platform: string;
  socketPort: number;
}

interface COA {
  id: string;
  kode: string;
  nama: string;
  tipe: string;
  parent_id: string | null;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface AspekKerja {
  id: string;
  kode: string;
  nama: string;
  coa_id: string | null;
  jenis: string;
  status_aktif: number;
  created_at: string;
  updated_at: string;
}

interface Blok {
  id: string;
  kode_blok: string;
  nama: string;
  tahun_tanam: number;
  luas: number;
  status: string;
  keterangan: string | null;
  pokok: number | null;       // NEW
  sph: number | null;         // NEW
  bulan_tanam: string | null;  // NEW
  status_tanaman_2025: string | null; // Status for year 2025
  status_tanaman_2026: string | null; // Status for year 2026
  status_tanaman_2027: string | null; // Status for year 2027
  created_at: string;
  updated_at: string;
}

interface KasTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Kas Masuk' | 'Kas Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface BankTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Bank Masuk' | 'Bank Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  bank_account: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

interface GudangTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: 'Gudang Masuk' | 'Gudang Keluar';
  amount: number;
  description: string;
  coa_id: string | null;
  aspek_kerja_id: string | null;
  blok_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  status: 'Pending Approval 1' | 'Pending Approval 2' | 'Fully Approved' | 'Rejected';
  created_by: string;
  created_at: string;
  updated_at: string;
  coa_kode?: string;
  coa_nama?: string;
  aspek_kerja_kode?: string;
  aspek_kerja_nama?: string;
  blok_kode?: string;
  blok_nama?: string;
  created_by_name?: string;
}

type Page = 'dashboard' | 'approvalDashboard' | 'revisionApproval' | 'userManagement' | 'coa' | 'aspekKerja' | 'blok' | 'kas' | 'bank' | 'gudang' | 'syncSettings' | 'revision';

const App: React.FC = () => {
  const { user, isGuest, isLoading, isAuthenticated, logout } = useAuth();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [socketStatus, setSocketStatus] = useState({ running: false, port: 9222 });
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  // Load initial sidebar collapse state from localStorage
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });

  // isAdmin is derived from user role - NOT a toggleable state
  const isAdmin = user?.role === 'Administrator';

  // Persist sidebar collapse state to localStorage on change
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);
  const [selectedCOA, setSelectedCOA] = useState<COA | null | undefined>(undefined);
  const [selectedAspekKerja, setSelectedAspekKerja] = useState<AspekKerja | null | undefined>(undefined);
  const [selectedBlok, setSelectedBlok] = useState<Blok | null | undefined>(undefined);
  const [selectedKas, setSelectedKas] = useState<KasTransaction | null | undefined>(undefined);
  const [selectedBank, setSelectedBank] = useState<BankTransaction | null | undefined>(undefined);
  const [selectedGudang, setSelectedGudang] = useState<GudangTransaction | null | undefined>(undefined);
  const [revisionData, setRevisionData] = useState<RevisionTransactionData | null>(null);
  const [revisionModule, setRevisionModule] = useState<'kas' | 'bank' | 'gudang'>('kas');

  useEffect(() => {
    // Load app info
    const loadAppInfo = async () => {
      try {
        if (window.electronAPI) {
          const info = await window.electronAPI.getAppInfo();
          setAppInfo(info);

          const status = await window.electronAPI.getSocketStatus();
          setSocketStatus(status);

          console.log('[App] App info loaded:', info);
        } else {
          // Fallback for browser testing
          setAppInfo({
            version: '1.0.0',
            electron: 'N/A',
            node: 'N/A',
            platform: 'browser',
            socketPort: 9222,
          });
        }
      } catch (error) {
        console.error('[App] Failed to load app info:', error);
      }
    };

    loadAppInfo();

    // Add startup log entries
    const startupLogs = [
      { timestamp: new Date().toISOString(), level: 'INFO', message: 'Aplikasi SoftwareSawit dimulai' },
      { timestamp: new Date().toISOString(), level: 'INFO', message: 'Renderer process loaded' },
      { timestamp: new Date().toISOString(), level: 'DEBUG', message: 'React application mounted successfully' },
    ];
    setLogs(startupLogs);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // F12 opens DevTools (admin only - based on user role, not toggle)
      if (e.key === 'F12' && isAdmin) {
        e.preventDefault();
        if (window.electronAPI) {
          await window.electronAPI.toggleDevTools();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  const handleToggleSocket = async () => {
    if (window.electronAPI) {
      const running = await window.electronAPI.toggleSocketServer();
      const status = await window.electronAPI.getSocketStatus();
      setSocketStatus(status);
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: `Socket server ${running ? 'started' : 'stopped'} on port ${status.port}`,
        },
      ]);
    }
  };

  const handleCopyLog = (logEntry: { timestamp: string; level: string; message: string }) => {
    const text = `[${logEntry.timestamp}] [${logEntry.level}] ${logEntry.message}`;
    navigator.clipboard.writeText(text);
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message: 'Log entry copied to clipboard',
      },
    ]);
  };

  const handleClearLogs = () => {
    setLogs([]);
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Log buffer cleared',
      },
    ]);
  };

  // COA Navigation handlers
  const handleNavigateToCOA = () => {
    setCurrentPage('coa');
    setSelectedCOA(undefined);
  };

  const handleNavigateToCOAForm = (coa?: COA) => {
    setSelectedCOA(coa === null ? null : (coa || null));
  };

  const handleCOASave = () => {
    setSelectedCOA(undefined);
  };

  const handleCOABack = () => {
    setSelectedCOA(undefined);
  };

  // Aspek Kerja Navigation handlers
  const handleNavigateToAspekKerja = () => {
    setCurrentPage('aspekKerja');
    setSelectedAspekKerja(undefined);
  };

  const handleNavigateToAspekKerjaForm = (aspekKerja?: AspekKerja) => {
    setSelectedAspekKerja(aspekKerja === null ? null : (aspekKerja || null));
  };

  const handleAspekKerjaSave = () => {
    setSelectedAspekKerja(undefined);
  };

  const handleAspekKerjaBack = () => {
    setSelectedAspekKerja(undefined);
  };

  // Blok Navigation handlers
  const handleNavigateToBlok = () => {
    setCurrentPage('blok');
    setSelectedBlok(undefined);
  };

  const handleNavigateToBlokForm = (blok?: Blok) => {
    setSelectedBlok(blok === null ? null : (blok || null));
  };

  const handleBlokSave = () => {
    setSelectedBlok(undefined);
  };

  const handleBlokBack = () => {
    setSelectedBlok(undefined);
  };

  // Kas Navigation handlers
  const handleNavigateToKas = () => {
    setCurrentPage('kas');
    setSelectedKas(undefined);
  };

  const handleNavigateToKasForm = (kas?: KasTransaction) => {
    // null = new form, object = edit form
    setSelectedKas(kas === null ? null : (kas || null));
  };

  const handleKasSave = () => {
    setSelectedKas(undefined);
  };

  const handleKasBack = () => {
    setSelectedKas(undefined);
  };

  // Bank Navigation handlers
  const handleNavigateToBank = () => {
    setCurrentPage('bank');
    setSelectedBank(undefined);
  };

  const handleNavigateToBankForm = (bank?: BankTransaction) => {
    setSelectedBank(bank === null ? null : (bank || null));
  };

  const handleBankSave = () => {
    setSelectedBank(undefined);
  };

  const handleBankBack = () => {
    setSelectedBank(undefined);
  };

  // Gudang Navigation handlers
  const handleNavigateToGudang = () => {
    setCurrentPage('gudang');
    setSelectedGudang(undefined);
  };

  const handleNavigateToGudangForm = (gudang?: GudangTransaction) => {
    setSelectedGudang(gudang === null ? null : (gudang || null));
  };

  const handleGudangSave = () => {
    setSelectedGudang(undefined);
  };

  const handleGudangBack = () => {
    setSelectedGudang(undefined);
  };

  // Revision Navigation handlers
  const handleNavigateToRevisionForm = (module: 'kas' | 'bank' | 'gudang', transaction: KasTransaction | BankTransaction | GudangTransaction) => {
    // Convert transaction to RevisionTransactionData format
    const revisionTx: RevisionTransactionData = {
      id: transaction.id,
      transaction_number: transaction.transaction_number,
      transaction_date: transaction.transaction_date,
      transaction_type: transaction.transaction_type,
      amount: transaction.amount,
      description: transaction.description,
      coa_id: transaction.coa_id,
      aspek_kerja_id: transaction.aspek_kerja_id,
      blok_id: transaction.blok_id,
      coa_kode: transaction.coa_kode,
      coa_nama: transaction.coa_nama,
      aspek_kerja_kode: transaction.aspek_kerja_kode,
      aspek_kerja_nama: transaction.aspek_kerja_nama,
      blok_kode: transaction.blok_kode,
      blok_nama: transaction.blok_nama,
    };

    // Add module-specific fields
    if (module === 'bank' && 'bank_account' in transaction) {
      revisionTx.bank_account = transaction.bank_account || null;
    }
    if (module === 'gudang') {
      if ('item_name' in transaction) {
        revisionTx.item_name = transaction.item_name || null;
      }
      if ('item_unit' in transaction) {
        revisionTx.item_unit = transaction.item_unit || null;
      }
    }

    setRevisionModule(module);
    setRevisionData(revisionTx);
    setCurrentPage('revision');
  };

  const handleRevisionBack = () => {
    setRevisionData(null);
    setCurrentPage('dashboard');
  };

  // Sync Settings Navigation handlers
  const handleNavigateToSyncSettings = () => {
    setCurrentPage('syncSettings');
  };

  // Render page content
  const renderPageContent = () => {
    switch (currentPage) {
      case 'coa':
        if (selectedCOA !== undefined) {
          // Show form (null = new, COA = edit)
          return (
            <COAFormPage
              coa={selectedCOA}
              onSave={handleCOASave}
              onCancel={handleCOABack}
            />
          );
        }
        return (
          <COAListPage
            onNavigateToCOAForm={handleNavigateToCOAForm}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'aspekKerja':
        if (selectedAspekKerja !== undefined) {
          // Show form (null = new, AspekKerja = edit)
          return (
            <AspekKerjaFormPage
              aspekKerja={selectedAspekKerja}
              onSave={handleAspekKerjaSave}
              onCancel={handleAspekKerjaBack}
              isGuest={isGuest}
            />
          );
        }
        return (
          <AspekKerjaListPage
            onNavigateToAspekKerjaForm={handleNavigateToAspekKerjaForm}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'blok':
        if (selectedBlok !== undefined) {
          // Show form (null = new, Blok = edit)
          return (
            <BlokFormPage
              blok={selectedBlok}
              onSave={handleBlokSave}
              onCancel={handleBlokBack}
              isGuest={isGuest}
            />
          );
        }
        return (
          <BlokListPage
            onNavigateToBlokForm={handleNavigateToBlokForm}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'kas':
        if (selectedKas !== undefined) {
          // Show form (null = new, Kas = edit)
          return (
            <KasFormPage
              transaction={selectedKas}
              onSave={handleKasSave}
              onCancel={handleKasBack}
              isGuest={isGuest}
            />
          );
        }
        return (
          <KasListPage
            onNavigateToKasForm={handleNavigateToKasForm}
            onNavigateToRevisionForm={(tx) => handleNavigateToRevisionForm('kas', tx)}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'bank':
        if (selectedBank !== undefined) {
          // Show form (null = new, Bank = edit)
          return (
            <BankFormPage
              transaction={selectedBank}
              onSave={handleBankSave}
              onCancel={handleBankBack}
              isGuest={isGuest}
            />
          );
        }
        return (
          <BankListPage
            onNavigateToBankForm={handleNavigateToBankForm}
            onNavigateToRevisionForm={(tx) => handleNavigateToRevisionForm('bank', tx)}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'gudang':
        if (selectedGudang !== undefined) {
          // Show form (null = new, Gudang = edit)
          return (
            <GudangFormPage
              transaction={selectedGudang}
              onSave={handleGudangSave}
              onCancel={handleGudangBack}
              isGuest={isGuest}
            />
          );
        }
        return (
          <GudangListPage
            onNavigateToGudangForm={handleNavigateToGudangForm}
            onNavigateToRevisionForm={(tx) => handleNavigateToRevisionForm('gudang', tx)}
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'userManagement':
        return <UserManagement />;
      case 'syncSettings':
        return (
          <SyncSettingsPage
            onBack={() => setCurrentPage('dashboard')}
          />
        );
      case 'approvalDashboard':
        return (
          <DashboardApprovalPage
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
            onNavigateToKas={handleNavigateToKas}
            onNavigateToBank={handleNavigateToBank}
            onNavigateToGudang={handleNavigateToGudang}
          />
        );
      case 'revisionApproval':
        return (
          <RevisionApprovalPage
            onBack={() => setCurrentPage('dashboard')}
            isGuest={isGuest}
          />
        );
      case 'revision':
        if (revisionData) {
          return (
            <RevisionRequestForm
              module={revisionModule}
              transaction={revisionData}
              onSubmit={async (revisionReason, proposedChanges) => {
                if (!window.electronAPI) {
                  return { success: false, message: 'API not available' };
                }
                // Call the revision IPC (will be implemented by F006-BE backend)
                try {
                  const result = await window.electronAPI.createRevisionRequest(revisionModule, {
                    transaction_id: revisionData.id,
                    revision_reason: revisionReason,
                    proposed_transaction_date: proposedChanges.transaction_date,
                    proposed_amount: proposedChanges.amount,
                    proposed_description: proposedChanges.description,
                    proposed_coa_id: proposedChanges.coa_id,
                    proposed_aspek_kerja_id: proposedChanges.aspek_kerja_id,
                    proposed_blok_id: proposedChanges.blok_id,
                    proposed_bank_account: proposedChanges.bank_account,
                    proposed_item_name: proposedChanges.item_name,
                    proposed_item_unit: proposedChanges.item_unit,
                  });
                  return result;
                } catch (error) {
                  console.error('[App] Revision error:', error);
                  return { success: false, message: 'Terjadi kesalahan saat mengajukan revisi' };
                }
              }}
              onCancel={handleRevisionBack}
              isGuest={isGuest}
            />
          );
        }
        // Fallback when revisionData is null - redirect to dashboard
        setRevisionData(null);
        setCurrentPage('dashboard');
        return null;
      default:
        return (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Selamat Datang di SoftwareSawit</h1>
            <p className="text-gray-600 mb-4">
              Aplikasi desktop untuk manajemen data keuangan dan inventori perkebunan kelapa sawit.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h2 className="font-semibold text-gray-700 mb-2">Fitur Utama</h2>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>Multi-modul (Kas, Bank, Gudang)</li>
                  <li>Dual Approval Workflow</li>
                  <li>Master Data (COA, Aspek Kerja, Blok)</li>
                  <li>Sinkronisasi Multi-Lokasi</li>
                  <li>Manajemen User</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h2 className="font-semibold text-gray-700 mb-2">Informasi Sistem</h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-medium">Versi:</span> {appInfo?.version || 'Loading...'}</p>
                  <p><span className="font-medium">Platform:</span> {appInfo?.platform || 'Loading...'}</p>
                  <p><span className="font-medium">Socket Port:</span> {socketStatus.port}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-800 mb-2">Navigasi</h3>
              <p className="text-sm text-blue-600">
                Gunakan menu di atas untuk mengakses berbagai modul aplikasi.
                Tekan <kbd className="px-2 py-1 bg-blue-100 rounded text-xs">F12</kbd> untuk membuka DevTools (mode admin).
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                onClick={handleNavigateToCOA}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Buka Master Data COA
              </button>
              <button
                onClick={handleNavigateToAspekKerja}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Buka Master Data Aspek Kerja
              </button>
              <button
                onClick={handleNavigateToBlok}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Buka Master Data Blok
              </button>
              <button
                onClick={handleNavigateToKas}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Buka Modul Kas
              </button>
              <button
                onClick={handleNavigateToBank}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Buka Modul Bank
              </button>
              <button
                onClick={handleNavigateToGudang}
                className="px-4 py-3 bg-primary-700 hover:bg-primary-800 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Buka Modul Gudang
              </button>
            </div>
          </div>
        );
    }
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary-700 rounded-lg flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <p className="text-gray-500">Memuat...</p>
        </div>
      </div>
    );
  }

  // Show LoginPage if not authenticated
  if (!user || !isAuthenticated) {
    return <LoginPage />;
  }

  // Guest Banner Component
  const GuestBanner = () => (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-amber-700">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="font-medium">Mode View Only - Guest Mode</span>
      </div>
      <button
        onClick={logout}
        className="px-3 py-1 text-sm bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-lg font-medium transition-colors"
      >
        Kembali ke Login
      </button>
    </div>
  );

  return (
    <SyncProvider>
      {/* Guest Banner */}
      {isGuest && <GuestBanner />}
      
      {currentPage !== 'dashboard' && currentPage !== 'approvalDashboard' && currentPage !== 'userManagement' && currentPage !== 'syncSettings' ? (
        <div className="flex flex-col h-full">
          {renderPageContent()}
        </div>
        ) : currentPage === 'userManagement' ? (
          <div className="flex flex-col h-full">
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Kembali ke Dashboard
              </button>
            </div>
            <UserManagement />
          </div>
        ) : currentPage === 'syncSettings' ? (
          <div className="flex flex-col h-full">
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Kembali ke Dashboard
              </button>
            </div>
            <SyncSettingsPage onBack={() => setCurrentPage('dashboard')} />
          </div>
        ) : currentPage === 'approvalDashboard' ? (
          <div className="flex flex-col h-full bg-gray-100">
            <main className="flex-1 flex overflow-hidden">
              {/* Sidebar */}
              <Sidebar
                socketStatus={socketStatus}
                onToggleSocket={handleToggleSocket}
                onNavigateToUserManagement={() => setCurrentPage('userManagement')}
                onNavigateToCOA={handleNavigateToCOA}
                onNavigateToAspekKerja={handleNavigateToAspekKerja}
                onNavigateToBlok={handleNavigateToBlok}
                onNavigateToKas={handleNavigateToKas}
                onNavigateToBank={handleNavigateToBank}
                onNavigateToGudang={handleNavigateToGudang}
                onNavigateToSync={handleNavigateToSyncSettings}
                onNavigateToApprovalDashboard={() => setCurrentPage('approvalDashboard')}
                onNavigateToRevisionApproval={() => setCurrentPage('revisionApproval')}
                user={user}
                isGuest={isGuest}
                onLogout={logout}
                currentPage={currentPage}
                onNavigateToDashboard={() => setCurrentPage('dashboard')}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                logs={logs}
                onCopyLog={handleCopyLog}
                onClearLogs={handleClearLogs}
              />

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <SyncStatusBar onOpenSettings={handleNavigateToSyncSettings} user={user} />
                <div className="flex-1 p-4 overflow-auto">
                  <DashboardApprovalPage
                    onBack={() => setCurrentPage('dashboard')}
                    isGuest={isGuest}
                    onNavigateToKas={handleNavigateToKas}
                    onNavigateToBank={handleNavigateToBank}
                    onNavigateToGudang={handleNavigateToGudang}
                  />
                </div>
              </div>
            </main>
          </div>
        ) : (
          <div className="flex flex-col h-full bg-gray-100">
            <main className="flex-1 flex overflow-hidden">
              {/* Sidebar */}
              <Sidebar
                socketStatus={socketStatus}
                onToggleSocket={handleToggleSocket}
                onNavigateToUserManagement={() => setCurrentPage('userManagement')}
                onNavigateToCOA={handleNavigateToCOA}
                onNavigateToAspekKerja={handleNavigateToAspekKerja}
                onNavigateToBlok={handleNavigateToBlok}
                onNavigateToKas={handleNavigateToKas}
                onNavigateToBank={handleNavigateToBank}
                onNavigateToGudang={handleNavigateToGudang}
                onNavigateToSync={handleNavigateToSyncSettings}
                onNavigateToApprovalDashboard={() => setCurrentPage('approvalDashboard')}
                onNavigateToRevisionApproval={() => setCurrentPage('revisionApproval')}
                user={user}
                isGuest={isGuest}
                onLogout={logout}
                currentPage={currentPage}
                onNavigateToDashboard={() => setCurrentPage('dashboard')}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                logs={logs}
                onCopyLog={handleCopyLog}
                onClearLogs={handleClearLogs}
              />

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <SyncStatusBar onOpenSettings={handleNavigateToSyncSettings} user={user} />
                <div className="flex-1 p-4 overflow-auto">
                  {renderPageContent()}
                </div>

                
              </div>
            </main>
          </div>
        )}
      </SyncProvider>
  );
};

export default App;
