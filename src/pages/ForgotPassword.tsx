import React, { useState } from 'react';
import { AuthCard } from '../components/AuthCard.tsx';
import { AuthInput } from '../components/AuthInput.tsx';
import { LoadingButton } from '../components/LoadingButton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { ArrowLeft } from 'lucide-react';

interface ForgotPasswordProps {
  onNavigate: (route: string, state?: any) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onNavigate }) => {
  const { forgotPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your User ID or registered mobile number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await forgotPassword(identifier);
      onNavigate('/reset-password', {
        userId: res.userId,
        maskedMobile: res.maskedMobile,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch reset code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your User ID or registered mobile number to receive a verification OTP."
      footer={
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-xs font-medium cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
        </button>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <AuthInput
          id="forgot-password-identifier"
          label="User ID / Mobile No."
          placeholder="e.g. VTX123 or 9876543210"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (error) setError('');
          }}
          disabled={loading}
          autoComplete="username"
        />

        {error && (
          <div className="mb-4 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <div className="mt-4">
          <LoadingButton
            id="forgot-password-submit-btn"
            type="submit"
            loading={loading}
            loadingText="Sending OTP..."
          >
            Send OTP
          </LoadingButton>
        </div>
      </form>
    </AuthCard>
  );
};
