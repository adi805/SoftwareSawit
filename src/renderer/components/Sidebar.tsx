import React, { useState } from 'react';

interface UserInfo {
  username: string;
  full_name: string;
  role: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface SidebarProps {
  socketStatus: { running: boolean; port: number };
  onToggleSocket: () => void;
  onNavigateToUserManagement?: () => void;
  onNavigateToCOA?: () => void;
  onNavigateToAspekKerja?: () => void;
  onNavigateToBlok?: () => void;
  onNavigateToKas?: () => void;
  onNavigateToBank?: () => void;
  onNavigateToGudang?: () => void;
  onNavigateToSync?: () => void;
  onNavigateToApprovalDashboard?: () => void;
  onNavigateToRevisionApproval?: () => void;
  user?: UserInfo | null;
  isGuest?: boolean;
  onLogout?: () => void;
  currentPage: string;
  onNavigateToDashboard: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  logs: LogEntry[];
  onCopyLog: (entry: LogEntry) => void;
  onClearLogs: () => void;
}

// Sub-menu item data interface
interface SubMenuItemData {
  id: string;
  label: string;
  onClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  socketStatus,
  onToggleSocket,
  onNavigateToUserManagement,
  onNavigateToCOA,
  onNavigateToAspekKerja,
  onNavigateToBlok,
  onNavigateToKas,
  onNavigateToBank,
  onNavigateToGudang,
  onNavigateToSync,
  onNavigateToApprovalDashboard,
  onNavigateToRevisionApproval,
  user,
  isGuest,
  onLogout,
  currentPage,
  onNavigateToDashboard,
  isCollapsed,
  onToggleCollapse,
  logs,
  onCopyLog,
  onClearLogs,
}) => {
  const [expandedMenu, setExpandedMenu] = useState<string | null>('masterData');
  const [isLogExpanded, setIsLogExpanded] = useState(false);

  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const getLevelColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'text-red-400';
      case 'WARN':
      case 'WARNING': return 'text-amber-400';
      case 'INFO': return 'text-blue-400';
      case 'DEBUG': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const getLevelBgColor = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'bg-red-900/30';
      case 'WARN':
      case 'WARNING': return 'bg-amber-900/30';
      case 'INFO': return 'bg-blue-900/30';
      case 'DEBUG': return 'bg-purple-900/30';
      default: return 'bg-gray-900/30';
    }
  };

  const errorCount = logs.filter(l => l.level.toUpperCase() === 'ERROR').length;
  const warnCount = logs.filter(l => ['WARN', 'WARNING'].includes(l.level.toUpperCase())).length;
  const recentLogs = logs.slice(-20).reverse();

  const isAdministrator = user?.role === 'Administrator';

  // Toggle sub-menu expansion
  const toggleSubMenu = (menuId: string) => {
    if (expandedMenu === menuId) {
      setExpandedMenu(null);
    } else {
      setExpandedMenu(menuId);
    }
  };

  // Check if a menu item is active
  const isActive = (pageId: string) => currentPage === pageId;

  // Dashboard icon
  const DashboardIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );

  // Master Data icon
  const MasterDataIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );

  // Kas icon
  const KasIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  // Bank icon
  const BankIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );

  // Gudang icon
  const GudangIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );

  // Sync icon
  const SyncIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );

  // User Management icon
  const UserIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );

  // Sub-menu items for Master Data
  const masterDataSubMenus: SubMenuItemData[] = [
    { id: 'coa', label: 'COA', onClick: onNavigateToCOA || (() => {}) },
    { id: 'aspekKerja', label: 'Aspek Kerja', onClick: onNavigateToAspekKerja || (() => {}) },
    { id: 'blok', label: 'Blok', onClick: onNavigateToBlok || (() => {}) },
  ];

  return (
    <aside
      data-testid="sidebar-collapse"
      className={`bg-primary-700 text-white flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-16 mr-2' : 'w-64'
      }`}
      style={{ height: '100%' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-primary-600">
        <div className={`flex items-center gap-2 ${isCollapsed ? 'mx-auto' : ''}`}>
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-lg">S</span>
          </div>
          {!isCollapsed && (
            <span className="font-bold text-lg whitespace-nowrap">SoftwareSawit</span>
          )}
        </div>
        {/* Collapse Toggle Button - in header */}
        <button
          onClick={onToggleCollapse}
          data-testid="sidebar-toggle"
          className="w-6 h-6 bg-primary-600 hover:bg-primary-500 rounded-full flex items-center justify-center shadow-sm flex-shrink-0"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation Menu - Scrollable */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-primary-500 scrollbar-track-primary-800">
        {/* Dashboard */}
        <MenuItem
          id="dashboard"
          label="Dashboard"
          icon={<DashboardIcon />}
          onClick={onNavigateToDashboard}
          isActive={isActive('dashboard')}
          isCollapsed={isCollapsed}
        />

        {/* Approval Dashboard */}
        <MenuItem
          id="approvalDashboard"
          label="Dashboard Approval"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
          onClick={onNavigateToApprovalDashboard || (() => {})}
          isActive={isActive('approvalDashboard')}
          isCollapsed={isCollapsed}
        />

        {/* Revision Approval Dashboard */}
        <MenuItem
          id="revisionApproval"
          label="Dashboard Revisi"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          }
          onClick={onNavigateToRevisionApproval || (() => {})}
          isActive={isActive('revisionApproval')}
          isCollapsed={isCollapsed}
        />

        {/* Master Data - Expandable */}
        <div className="relative">
          <MenuItem
            id="masterData"
            label="Master Data"
            icon={<MasterDataIcon />}
            onClick={() => toggleSubMenu('masterData')}
            isActive={['coa', 'aspekKerja', 'blok'].includes(currentPage)}
            isCollapsed={isCollapsed}
            hasSubMenu
            isExpanded={expandedMenu === 'masterData'}
            data-testid="nav-master"
          />

          {/* Sub-menu */}
          {expandedMenu === 'masterData' && !isCollapsed && (
            <div className="ml-8 py-1 border-l border-primary-500">
              {masterDataSubMenus.map((subItem) => (
                <SubMenuItem
                  key={subItem.id}
                  label={subItem.label}
                  onClick={subItem.onClick}
                  isActive={isActive(subItem.id)}
                  data-testid={subItem.id === 'coa' ? 'nav-coa' : subItem.id === 'aspekKerja' ? 'nav-aspek-kerja' : subItem.id === 'blok' ? 'nav-blok' : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Kas Module */}
        <MenuItem
          id="kas"
          label="Kas Module"
          icon={<KasIcon />}
          onClick={onNavigateToKas || (() => {})}
          isActive={isActive('kas')}
          isCollapsed={isCollapsed}
          data-testid="nav-kas"
        />

        {/* Bank Module */}
        <MenuItem
          id="bank"
          label="Bank Module"
          icon={<BankIcon />}
          onClick={onNavigateToBank || (() => {})}
          isActive={isActive('bank')}
          isCollapsed={isCollapsed}
          data-testid="nav-bank"
        />

        {/* Gudang Module */}
        <MenuItem
          id="gudang"
          label="Gudang Module"
          icon={<GudangIcon />}
          onClick={onNavigateToGudang || (() => {})}
          isActive={isActive('gudang')}
          isCollapsed={isCollapsed}
          data-testid="nav-gudang"
        />

        {/* Sync - Admin Only */}
        {isAdministrator && !isGuest && (
          <MenuItem
            id="syncSettings"
            label="Sync"
            icon={<SyncIcon />}
            onClick={onNavigateToSync || (() => {})}
            isActive={isActive('syncSettings')}
            isCollapsed={isCollapsed}
            data-testid="nav-sync"
          />
        )}

        {/* User Management - Admin Only */}
        {isAdministrator && !isGuest && (
          <MenuItem
            id="userManagement"
            label="User Management"
            icon={<UserIcon />}
            onClick={onNavigateToUserManagement || (() => {})}
            isActive={isActive('userManagement')}
            isCollapsed={isCollapsed}
            data-testid="nav-users"
          />
        )}
      </nav>

      {/* Footer Controls */}
      <div className={`border-t border-primary-600 p-3 space-y-2 ${isCollapsed ? 'px-2' : ''}`}>
        {/* Socket Server Toggle */}
        <button
          onClick={onToggleSocket}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded transition-colors ${
            socketStatus.running
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-gray-500 hover:bg-gray-400'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title={socketStatus.running ? `Socket server running on port ${socketStatus.port}` : 'Start socket server'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          {!isCollapsed && <span>Socket: {socketStatus.running ? `ON (${socketStatus.port})` : 'OFF'}</span>}
        </button>

        {/* Log Console Toggle */}
        <button
          onClick={() => setIsLogExpanded(!isLogExpanded)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded transition-colors ${
            isLogExpanded
              ? 'bg-gray-600 hover:bg-gray-500'
              : 'bg-primary-600 hover:bg-primary-500'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title="Toggle Log Console"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {!isCollapsed && (
            <span className="flex-1 text-left">Logs</span>
          )}
          {(errorCount > 0 || warnCount > 0) && !isCollapsed && (
            <div className="flex gap-1">
              {errorCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{errorCount}</span>
              )}
              {warnCount > 0 && (
                <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{warnCount}</span>
              )}
            </div>
          )}
          {!isCollapsed && (
            <svg className={`w-3 h-3 transition-transform ${isLogExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {/* Expanded Log Panel */}
        {isLogExpanded && !isCollapsed && (
          <div className="border-t border-primary-500 pt-2 mt-2">
            <div className="bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
              {recentLogs.length === 0 ? (
                <p className="text-gray-500 text-xs">No logs yet</p>
              ) : (
                <div className="space-y-1">
                  {recentLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 text-xs p-1.5 rounded ${getLevelBgColor(log.level)} cursor-pointer hover:bg-gray-800`}
                      onClick={() => onCopyLog(log)}
                      title="Click to copy"
                    >
                      <span className="text-gray-500 flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                      <span className={`flex-shrink-0 font-medium ${getLevelColor(log.level)}`}>[{log.level}]</span>
                      <span className="text-gray-300 truncate flex-1">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  const allText = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
                  navigator.clipboard.writeText(allText);
                }}
                className="flex-1 text-xs text-gray-300 hover:text-white py-1 px-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Copy All
              </button>
              <button
                onClick={onClearLogs}
                className="flex-1 text-xs text-gray-400 hover:text-white py-1 px-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* User Info */}
        <div className={`flex items-center gap-2 pt-2 border-t border-primary-600 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium">{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.full_name || user?.username || 'Guest User'}</p>
              <p className="text-xs text-primary-200 truncate">{user?.role || 'Not logged in'}</p>
            </div>
          )}
          {isGuest && onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 text-white hover:bg-primary-600 rounded transition-colors"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

// Menu Item Component
interface MenuItemProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  isCollapsed?: boolean;
  hasSubMenu?: boolean;
  isExpanded?: boolean;
  'data-testid'?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({
  label,
  icon,
  onClick,
  isActive = false,
  isCollapsed = false,
  hasSubMenu = false,
  isExpanded = false,
  'data-testid': dataTestId,
}) => {
  return (
    <button
      onClick={onClick}
      data-testid={dataTestId}
      className={`w-full flex items-center gap-3 px-3 py-2 mx-1 text-sm font-medium rounded transition-colors ${
        isActive
          ? 'bg-white text-primary-700'
          : 'text-white hover:bg-primary-600'
      } ${isCollapsed ? 'justify-center' : ''}`}
      title={isCollapsed ? label : undefined}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!isCollapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {hasSubMenu && (
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </>
      )}
    </button>
  );
};

// Sub Menu Item Component
interface SubMenuItemProps {
  label: string;
  onClick: () => void;
  isActive?: boolean;
  'data-testid'?: string;
}

const SubMenuItem: React.FC<SubMenuItemProps> = ({ label, onClick, isActive = false, 'data-testid': dataTestId }) => {
  return (
    <button
      onClick={onClick}
      data-testid={dataTestId}
      className={`w-full flex items-center px-3 py-2 text-sm rounded transition-colors ${
        isActive
          ? 'bg-white text-primary-700'
          : 'text-white hover:bg-primary-600'
      }`}
    >
      <span className="w-2 h-2 bg-primary-300 rounded-full mr-3"></span>
      {label}
    </button>
  );
};

export default Sidebar;
