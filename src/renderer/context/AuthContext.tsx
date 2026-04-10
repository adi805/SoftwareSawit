import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  loginAsGuest: () => void;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'user_session';
const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Load session on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
          const { user: _savedUser, token: savedToken } = JSON.parse(savedSession);
          
          if (window.electronAPI) {
            const result = await window.electronAPI.validateSession(savedToken);
            if (result.valid && result.user) {
              setUser(result.user);
              setToken(savedToken);
            } else if (result.expired) {
              // Session expired server-side
              console.log('[Auth] Session expired server-side');
              localStorage.removeItem(SESSION_KEY);
            } else {
              localStorage.removeItem(SESSION_KEY);
            }
          }
        }
      } catch (error) {
        console.error('[Auth] Failed to load session:', error);
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  // Track user activity for idle timeout
  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(Date.now());
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Check idle timeout
  useEffect(() => {
    const currentAuth = !!user && !!token;
    if (!currentAuth) return;

    const checkIdle = async () => {
      const idleTime = Date.now() - lastActivity;
      if (idleTime >= IDLE_TIMEOUT) {
        console.log('[Auth] Idle timeout - logging out');
        await logout();
      } else if (token) {
        // Refresh session periodically
        try {
          if (window.electronAPI) {
            const refreshResult = await window.electronAPI.refreshSession(token);
            if (refreshResult.expired) {
              // Session expired server-side (max lifetime exceeded)
              console.log('[Auth] Session expired due to max lifetime');
              await logout();
            }
          }
        } catch (error) {
          console.error('[Auth] Failed to refresh session:', error);
        }
      }
    };

    const interval = setInterval(checkIdle, 60 * 1000); // Check every minute
    return () => clearInterval(interval);
  }, [user, token, lastActivity]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      console.log('[Auth] login called with:', username);
      
      if (!window.electronAPI) {
        console.error('[Auth] window.electronAPI is not available');
        return { success: false, message: 'Electron API not available' };
      }
      
      console.log('[Auth] electronAPI available, calling login...');
      const result = await window.electronAPI.login(username, password);
      console.log('[Auth] login result:', result);
      
      if (result.success && result.token && result.user) {
        const userData: User = {
          id: result.user.id,
          username: result.user.username,
          full_name: result.user.full_name,
          role: result.user.role,
          status: result.user.status,
        };
        
        setUser(userData);
        setToken(result.token);
        setIsGuest(false);
        setLastActivity(Date.now());
        
        // Save to localStorage
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          user: userData,
          token: result.token,
        }));
        
        return { success: true, message: result.message };
      }
      
      return { success: false, message: result.message };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return { success: false, message: 'Login failed due to an error' };
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    console.log('[Auth] Logging in as guest');
    setIsGuest(true);
    setUser({ id: 'guest', username: 'guest', full_name: 'Guest User', role: 'Guest', status: 'active' });
    setToken('guest-token');
    setLastActivity(Date.now());
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token && user && !isGuest && window.electronAPI) {
        await window.electronAPI.logout(token, user.id);
      }
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    } finally {
      setUser(null);
      setToken(null);
      setIsGuest(false);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [token, user, isGuest]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!user || !window.electronAPI) {
      return { success: false, message: 'Not authenticated' };
    }

    try {
      const result = await window.electronAPI.changePassword(user.id, oldPassword, newPassword);
      return result;
    } catch (error) {
      console.error('[Auth] Change password error:', error);
      return { success: false, message: 'Failed to change password' };
    }
  }, [user]);

  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        isGuest,
        login,
        loginAsGuest,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
