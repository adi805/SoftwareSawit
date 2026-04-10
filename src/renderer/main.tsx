import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import UserManagement from './components/UserManagement';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Check if should load User Management app
const urlParams = new URLSearchParams(window.location.search);
const isUserMgmt = urlParams.get('app') === 'user-mgmt';

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Renderer] React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', background: '#fee', margin: '20px' }}>
          <h1>Application Error</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Determine which app to render
const AppToRender = isUserMgmt ? UserManagement : App;
const appName = isUserMgmt ? 'User Management' : 'Main';

// Log renderer start
console.log(`[Renderer] Starting ${appName} application...`);

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <AppToRender />
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log(`[Renderer] ${appName} application mounted`);
} catch (error) {
  console.error('[Renderer] Failed to mount:', error);
}
