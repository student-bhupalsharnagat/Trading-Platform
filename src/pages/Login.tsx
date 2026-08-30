import React, { useState } from 'react';
import { AuthCard } from '../components/AuthCard.tsx';
import { AuthInput } from '../components/AuthInput.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { LoadingButton } from '../components/LoadingButton.tsx';
import { useAuth } from '../hooks/useAuth.ts';

interface LoginProps {
  onNavigate: (route: string, state?: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const { login, loginDemo, showToast } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your User ID or registered mobile number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(identifier, password);
      onNavigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.requiresVerification && err.userId) {
        showToast({
          type: 'info',
          title: 'Verification Required',
          description: 'Please verify your mobile number before logging in.',
        });
        onNavigate('/verify-otp', { userId: err.userId });
      } else {
        setError(err.message || 'Invalid User ID or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      await loginDemo();
      onNavigate('/dashboard');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Demo Access Failed',
        description: err.message || 'Could not start demo trading session.',
      });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthCard
      footer={
        <div className="flex flex-col items-center space-y-2 text-xs">
          <p className="text-slate-400">
            Forgot password?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/forgot-password')}
              className="text-[#FF7A00] font-semibold hover:text-orange-300 transition-colors ml-1 cursor-pointer"
            >
              Reset here
            </button>
          </p>
          <p className="text-slate-400">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/register')}
              className="text-[#FF7A00] font-semibold hover:text-orange-300 transition-colors ml-1 cursor-pointer"
            >
              Create account
            </button>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* User ID / Mobile No. */}
        <AuthInput
          id="login-identifier"
          label="User ID / Mobile No."
          placeholder="e.g. VTX123 or 9876543210"
          helperText="Enter your User ID or registered mobile number"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (error) setError('');
          }}
          disabled={loading || demoLoading}
          autoComplete="username"
        />

        {/* Password */}
        <PasswordInput
          id="login-password"
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError('');
          }}
          disabled={loading || demoLoading}
          autoComplete="current-password"
        />

        {/* General Error Banner */}
        {error && (
          <div className="mb-4 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        {/* Login Button */}
        <div className="mt-2">
          <LoadingButton
            id="login-submit-btn"
            type="submit"
            loading={loading}
            loadingText="Signing in..."
          >
            Login
          </LoadingButton>
        </div>

        {/* OR Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 h-px bg-[#1E293B]" />
          <span className="px-3 text-[11px] font-semibold text-slate-500 tracking-wider">
            or
          </span>
          <div className="flex-1 h-px bg-[#1E293B]" />
        </div>

        {/* Try Demo Account Button */}
        <LoadingButton
          id="login-demo-btn"
          type="button"
          variant="secondary"
          loading={demoLoading}
          loadingText="Starting Demo..."
          onClick={handleDemoLogin}
          className="border-slate-700/60 text-orange-400 hover:text-orange-300"
        >
          Try Demo Account
        </LoadingButton>
      </form>
    </AuthCard>
  );
};
