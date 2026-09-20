import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { TenantProvider } from './context/TenantContext.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { TenantStatusBar } from './components/TenantStatusBar.tsx';
import { Register } from './pages/Register.tsx';
import { VerifyOTP } from './pages/VerifyOTP.tsx';
import { Login } from './pages/Login.tsx';
import { ForgotPassword } from './pages/ForgotPassword.tsx';
import { ResetPassword } from './pages/ResetPassword.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ProtectedRoute } from './routes/ProtectedRoute.tsx';

// Commercial Admin Domain
import { AdminLayout } from './admin/components/AdminLayout.tsx';
import { AdminProtectedRoute } from './admin/components/AdminProtectedRoute.tsx';
import { AdminDashboard } from './admin/pages/AdminDashboard.tsx';
import { MastersList } from './admin/pages/MastersList.tsx';
import { MasterDetails } from './admin/pages/MasterDetails.tsx';
import { BrokersList } from './admin/pages/BrokersList.tsx';
import { BrokerDetails } from './admin/pages/BrokerDetails.tsx';
import { SubBrokersList } from './admin/pages/SubBrokersList.tsx';
import { ClientsList } from './admin/pages/ClientsList.tsx';
import { AuditLogsPage } from './admin/pages/AuditLogsPage.tsx';

function AppContent() {
  const { user, loading, toasts, dismissToast } = useAuth();

  // Route & Navigation State
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (
      ['/login', '/verify-otp', '/forgot-password', '/reset-password', '/dashboard', '/register'].includes(path) ||
      path.startsWith('/admin')
    ) {
      return path;
    }
    return '/login';
  });

  const [routeState, setRouteState] = useState<any>({});

  // Sync route with browser history
  const navigate = (route: string, state?: any) => {
    setCurrentRoute(route);
    setRouteState(state || {});
    window.history.pushState(state || {}, '', route);
  };

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const path = window.location.pathname;
      setCurrentRoute(path || '/register');
      setRouteState(e.state || {});
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Automatic redirect if authenticated or unauthenticated
  useEffect(() => {
    if (!loading) {
      if (user && (currentRoute === '/login' || currentRoute === '/register')) {
        navigate('/dashboard');
      } else if (!user && (currentRoute === '/dashboard' || currentRoute.startsWith('/admin'))) {
        navigate('/login');
      }
    }
  }, [user, loading, currentRoute]);

  const handleApplyOtpToInput = (otp: string) => {
    // Fill all digits
    for (let i = 0; i < 6; i++) {
      const input = document.getElementById(`otp-digit-${i}`) as HTMLInputElement;
      if (input && otp[i]) {
        input.value = otp[i];
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };

  const renderCurrentPage = () => {
    switch (currentRoute) {
      case '/register':
        return <Register onNavigate={navigate} />;

      case '/verify-otp':
        return (
          <VerifyOTP
            initialUserId={routeState.userId}
            initialMobile={routeState.mobile}
            initialCountryCode={routeState.countryCode || '+91'}
            purpose={routeState.purpose || 'registration'}
            onNavigate={navigate}
          />
        );

      case '/login':
        return <Login onNavigate={navigate} />;

      case '/forgot-password':
        return <ForgotPassword onNavigate={navigate} />;

      case '/reset-password':
        return (
          <ResetPassword
            initialUserId={routeState.userId}
            initialOtp={routeState.otp}
            maskedMobile={routeState.maskedMobile}
            onNavigate={navigate}
          />
        );

      case '/dashboard':
        return (
          <ProtectedRoute onRedirectToLogin={() => navigate('/login')}>
            <Dashboard onNavigate={navigate} />
          </ProtectedRoute>
        );

      // Commercial Admin Domain Routes
      case '/admin':
      case '/admin/dashboard':
        return (
          <AdminProtectedRoute onBackToTrading={() => navigate('/dashboard')}>
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="Commercial Trading Administration"
            >
              <AdminDashboard onNavigate={navigate} />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      case '/admin/masters':
        return (
          <AdminProtectedRoute
            allowedRoles={['SUPER_ADMIN']}
            onBackToTrading={() => navigate('/dashboard')}
          >
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="Masters Directory"
            >
              <MastersList onNavigate={navigate} />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      case '/admin/brokers':
        return (
          <AdminProtectedRoute
            allowedRoles={['SUPER_ADMIN', 'MASTER']}
            onBackToTrading={() => navigate('/dashboard')}
          >
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="Brokers Directory"
            >
              <BrokersList onNavigate={navigate} />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      case '/admin/sub-brokers':
        return (
          <AdminProtectedRoute
            allowedRoles={['SUPER_ADMIN', 'MASTER', 'BROKER']}
            onBackToTrading={() => navigate('/dashboard')}
          >
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="Sub-Brokers Directory"
            >
              <SubBrokersList onNavigate={navigate} />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      case '/admin/clients':
        return (
          <AdminProtectedRoute
            allowedRoles={['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER']}
            onBackToTrading={() => navigate('/dashboard')}
          >
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="Downstream Clients"
            >
              <ClientsList onNavigate={navigate} />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      case '/admin/audit-logs':
        return (
          <AdminProtectedRoute
            allowedRoles={['SUPER_ADMIN', 'MASTER']}
            onBackToTrading={() => navigate('/dashboard')}
          >
            <AdminLayout
              currentPath={currentRoute}
              onNavigate={navigate}
              title="System Audit Logs"
            >
              <AuditLogsPage />
            </AdminLayout>
          </AdminProtectedRoute>
        );

      default:
        // Handle parameterized routes like /admin/masters/:id or /admin/brokers/:id
        if (currentRoute.startsWith('/admin/masters/')) {
          const masterId = currentRoute.replace('/admin/masters/', '');
          return (
            <AdminProtectedRoute
              allowedRoles={['SUPER_ADMIN', 'MASTER']}
              onBackToTrading={() => navigate('/dashboard')}
            >
              <AdminLayout
                currentPath="/admin/masters"
                onNavigate={navigate}
                title="Master Details"
              >
                <MasterDetails
                  id={masterId}
                  onBack={() => navigate('/admin/masters')}
                  onNavigate={navigate}
                />
              </AdminLayout>
            </AdminProtectedRoute>
          );
        }

        if (currentRoute.startsWith('/admin/brokers/')) {
          const brokerId = currentRoute.replace('/admin/brokers/', '');
          return (
            <AdminProtectedRoute
              allowedRoles={['SUPER_ADMIN', 'MASTER', 'BROKER']}
              onBackToTrading={() => navigate('/dashboard')}
            >
              <AdminLayout
                currentPath="/admin/brokers"
                onNavigate={navigate}
                title="Broker Details"
              >
                <BrokerDetails
                  id={brokerId}
                  onBack={() => navigate('/admin/brokers')}
                  onNavigate={navigate}
                />
              </AdminLayout>
            </AdminProtectedRoute>
          );
        }

        // Fallback for sub-routes under compliance / tools
        if (currentRoute.startsWith('/admin/')) {
          return (
            <AdminProtectedRoute onBackToTrading={() => navigate('/dashboard')}>
              <AdminLayout
                currentPath={currentRoute}
                onNavigate={navigate}
                title="Commercial Administration"
              >
                <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-8 text-center">
                  <h3 className="text-base font-bold text-slate-200 mb-2">Phase 1 Foundation</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                    The foundation for this module is configured in the 5-tier hierarchy schema.
                    Compliance verification, fund ledgers, and reporting are slated for upcoming phases.
                  </p>
                  <button
                    onClick={() => navigate('/admin/dashboard')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </AdminLayout>
            </AdminProtectedRoute>
          );
        }

        return <Register onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#060B13] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-150 flex flex-col">
      <TenantStatusBar />
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onApplyOtp={handleApplyOtpToInput}
      />
      <div className="flex-1">
        {renderCurrentPage()}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TenantProvider>
        <AuthProvider>
          <LanguageProvider>
            <AppContent />
          </LanguageProvider>
        </AuthProvider>
      </TenantProvider>
    </ThemeProvider>
  );
}
