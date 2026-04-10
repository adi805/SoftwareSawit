import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginPage from '../pages/LoginPage';
import UserListPage from '../pages/UserListPage';
import UserFormPage from '../pages/UserFormPage';
import ActivityLogPage from '../pages/ActivityLogPage';
import SessionManagementPage from '../pages/SessionManagementPage';
import ChangePasswordPage from '../pages/ChangePasswordPage';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
}

type Page = 'list' | 'form' | 'activity' | 'sessions' | 'changePassword';

interface UserManagementProps {
  onShowList?: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ onShowList }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Navigate to list when user logs in
  useEffect(() => {
    if (isAuthenticated) {
      setCurrentPage('list');
    }
  }, [isAuthenticated]);

  // Handle external navigation
  useEffect(() => {
    if (onShowList) {
      setCurrentPage('list');
    }
  }, [onShowList]);

  const handleNavigateToUserForm = (user?: User) => {
    setSelectedUser(user || null);
    setCurrentPage('form');
  };

  const handleNavigateToActivityLog = () => {
    setCurrentPage('activity');
  };

  const handleNavigateToSessions = () => {
    setCurrentPage('sessions');
  };

  const handleNavigateToChangePassword = () => {
    setCurrentPage('changePassword');
  };

  const handleBack = () => {
    setSelectedUser(null);
    setCurrentPage('list');
  };

  const handleSaveUser = () => {
    setSelectedUser(null);
    setCurrentPage('list');
  };

  // Show loading while checking session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-primary-700 mx-auto" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-4 text-gray-600">Memuat...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setCurrentPage('list')} />;
  }

  // Render current page
  switch (currentPage) {
    case 'form':
      return (
        <UserFormPage
          user={selectedUser}
          onSave={handleSaveUser}
          onCancel={handleBack}
        />
      );
    case 'activity':
      return <ActivityLogPage onBack={handleBack} />;
    case 'sessions':
      return <SessionManagementPage onBack={handleBack} />;
    case 'changePassword':
      return <ChangePasswordPage onBack={handleBack} />;
    case 'list':
    default:
      return (
        <UserListPage
          onNavigateToUserForm={handleNavigateToUserForm}
          onNavigateToActivityLog={handleNavigateToActivityLog}
          onNavigateToSessions={handleNavigateToSessions}
          onNavigateToChangePassword={handleNavigateToChangePassword}
        />
      );
  }
};

export default UserManagement;
