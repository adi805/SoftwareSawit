import React from 'react';

interface AppInfo {
  version: string;
  electron: string;
  node: string;
  platform: string;
  socketPort: number;
}

interface UserInfo {
  username: string;
  full_name: string;
  role: string;
}

interface NavbarProps {
  appInfo: AppInfo | null;
  isAdmin: boolean;
  onToggleAdmin: () => void;
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
  user?: UserInfo | null;
}

const Navbar: React.FC<NavbarProps> = ({
  appInfo,
  isAdmin,
  onToggleAdmin,
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
  user,
}) => {
  // Check if user is Administrator
  const isAdministrator = user?.role === 'Administrator';
  return (
    <nav className="bg-primary-700 text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span className="text-primary-700 font-bold text-lg">S</span>
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">SoftwareSawit</h1>
                <p className="text-xs text-primary-200">v{appInfo?.version || '1.0.0'}</p>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-1 ml-8">
              <NavItem label="Dashboard" active />
              <NavItem label="Master Data COA" onClick={onNavigateToCOA} />
              <NavItem label="Master Data Aspek Kerja" onClick={onNavigateToAspekKerja} />
              <NavItem label="Master Data Blok" onClick={onNavigateToBlok} />
              <NavItem label="Master Data" />
              <NavItem label="Kas" onClick={onNavigateToKas} />
              <NavItem label="Bank" onClick={onNavigateToBank} />
              <NavItem label="Gudang" onClick={onNavigateToGudang} />
              {isAdministrator && <NavItem label="Sync" onClick={onNavigateToSync} />}
              {isAdministrator && <NavItem label="User Management" onClick={onNavigateToUserManagement} />}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            {/* Admin Toggle */}
            <button
              onClick={onToggleAdmin}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                isAdmin
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-primary-600 hover:bg-primary-500'
              }`}
              title={isAdmin ? 'Admin mode enabled - click to disable' : 'Enable admin mode'}
            >
              {isAdmin ? 'Admin ON' : 'Admin OFF'}
            </button>

            {/* Socket Server Toggle */}
            <button
              onClick={onToggleSocket}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                socketStatus.running
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-gray-500 hover:bg-gray-400'
              }`}
              title={socketStatus.running ? `Socket server running on port ${socketStatus.port}` : 'Start socket server'}
            >
              Socket: {socketStatus.running ? `ON (${socketStatus.port})` : 'OFF'}
            </button>

            {/* User Info */}
            <div className="flex items-center gap-2 pl-3 border-l border-primary-500">
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium">{user?.full_name || user?.username || 'Guest User'}</p>
                <p className="text-xs text-primary-200">{user?.role || 'Not logged in'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

interface NavItemProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
        active
          ? 'bg-white text-primary-700'
          : 'text-white hover:bg-primary-600'
      }`}
    >
      {label}
    </button>
  );
};

export default Navbar;
