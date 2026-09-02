import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { Register } from './pages/Register.tsx';
import { VerifyOTP } from './pages/VerifyOTP.tsx';
import { Login } from './pages/Login.tsx';
import { ForgotPassword } from './pages/ForgotPassword.tsx';
import { ResetPassword } from './pages/ResetPassword.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ProtectedRoute } from './routes/ProtectedRoute.tsx';

function AppContent() {
  const { user, loading, toasts, dismissToast } = useAuth();

  // Route & Navigation State
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (['/login', '/verify-otp', '/forgot-password', '/reset-password', '/dashboard', '/register'].includes(path)) {
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
      } else if (!user && currentRoute === '/dashboard') {
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

      default:
        return <Register onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#060B13] text-slate-100 font-sans">
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onApplyOtp={handleApplyOtpToInput}
      />
      {renderCurrentPage()}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}
