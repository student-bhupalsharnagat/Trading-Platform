import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, ToastMessage } from '../types.ts';
import { authApi } from '../services/authApi.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  register: (data: any) => Promise<any>;
  verifyOtp: (userId: string, otp: string, purpose?: string) => Promise<any>;
  resendOtp: (userId: string, purpose?: string) => Promise<any>;
  login: (userId: string, password: string) => Promise<any>;
  loginDemo: () => Promise<any>;
  logout: () => Promise<void>;
  forgotPassword: (identifier: string) => Promise<any>;
  resetPassword: (data: any) => Promise<any>;
  refreshUser: () => Promise<void>;
  pendingVerificationUserId: string | null;
  setPendingVerificationUserId: (id: string | null) => void;
  latestDevOtp: string | null;
  setLatestDevOtp: (otp: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pendingVerificationUserId, setPendingVerificationUserId] = useState<string | null>(null);
  const [latestDevOtp, setLatestDevOtp] = useState<string | null>(null);

  const showToast = (toastData: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { ...toastData, id };

    setToasts((prev) => [...prev, newToast]);

    // Auto dismiss standard toasts after duration (default 5s, OTP toasts stay longer)
    const duration = toastData.duration || (toastData.type === 'otp' ? 20000 : 5000);
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const refreshUser = async () => {
    try {
      const res = await authApi.getMe();
      if (res.success && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const register = async (data: any) => {
    const res = await authApi.register(data);
    if (res.devOtp) {
      setLatestDevOtp(res.devOtp);
      showToast({
        type: 'otp',
        title: 'VERTEX Verification Code',
        description: `OTP sent to ${data.countryCode || '+91'} ${data.mobile}. (Dev code provided below)`,
        otpCode: res.devOtp,
        duration: 30000,
      });
    } else {
      showToast({
        type: 'success',
        title: 'Account Created',
        description: res.message || 'Please check your mobile for the verification code.',
      });
    }
    setPendingVerificationUserId(res.userId || data.userId);
    return res;
  };

  const verifyOtp = async (userId: string, otp: string, purpose = 'registration') => {
    const res = await authApi.verifyOtp({ userId, otp, purpose });
    if (res.success && res.user) {
      setUser(res.user);
      setPendingVerificationUserId(null);
      setLatestDevOtp(null);
      showToast({
        type: 'success',
        title: 'Verification Successful',
        description: 'Your mobile number is verified. Welcome to VERTEX!',
      });
    }
    return res;
  };

  const resendOtp = async (userId: string, purpose = 'registration') => {
    const res = await authApi.resendOtp({ userId, purpose });
    if (res.devOtp) {
      setLatestDevOtp(res.devOtp);
      showToast({
        type: 'otp',
        title: 'New Verification Code',
        description: 'New 6-digit code generated. (Dev code provided below)',
        otpCode: res.devOtp,
        duration: 30000,
      });
    } else {
      showToast({
        type: 'info',
        title: 'OTP Resent',
        description: res.message || 'A new verification code has been dispatched.',
      });
    }
    return res;
  };

  const login = async (userId: string, pass: string) => {
    const res = await authApi.login({ userId, password: pass });
    if (res.success && res.user) {
      setUser(res.user);
      showToast({
        type: 'success',
        title: 'Welcome Back',
        description: `Logged in as ${res.user.fullName}`,
      });
    }
    return res;
  };

  const loginDemo = async () => {
    const res = await authApi.demoLogin();
    if (res.success && res.user) {
      setUser(res.user);
      showToast({
        type: 'success',
        title: 'Demo Mode Activated',
        description: 'Logged into VERTEX Virtual Trading with ₹10,00,000 demo balance.',
      });
    }
    return res;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      showToast({
        type: 'info',
        title: 'Logged Out',
        description: 'You have been safely signed out.',
      });
    }
  };

  const forgotPassword = async (identifier: string) => {
    const res = await authApi.forgotPassword({ identifier });
    if (res.devOtp) {
      setLatestDevOtp(res.devOtp);
      showToast({
        type: 'otp',
        title: 'Password Reset Code',
        description: `Reset code dispatched. (Dev code provided below)`,
        otpCode: res.devOtp,
        duration: 30000,
      });
    } else {
      showToast({
        type: 'info',
        title: 'Reset Code Sent',
        description: res.message,
      });
    }
    return res;
  };

  const resetPassword = async (data: any) => {
    const res = await authApi.resetPassword(data);
    showToast({
      type: 'success',
      title: 'Password Updated',
      description: res.message || 'Your password was updated. Please sign in.',
    });
    setLatestDevOtp(null);
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        toasts,
        showToast,
        dismissToast,
        register,
        verifyOtp,
        resendOtp,
        login,
        loginDemo,
        logout,
        forgotPassword,
        resetPassword,
        refreshUser,
        pendingVerificationUserId,
        setPendingVerificationUserId,
        latestDevOtp,
        setLatestDevOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
