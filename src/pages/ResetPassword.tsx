import React, { useState } from 'react';
import { AuthCard } from '../components/AuthCard.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { OTPInput } from '../components/OTPInput.tsx';
import { LoadingButton } from '../components/LoadingButton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { ArrowLeft } from 'lucide-react';

interface ResetPasswordProps {
  initialUserId?: string;
  initialOtp?: string;
  maskedMobile?: string;
  onNavigate: (route: string, state?: any) => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({
  initialUserId = '',
  initialOtp = '',
  maskedMobile,
  onNavigate,
}) => {
  const { resetPassword } = useAuth();
  const [userId] = useState(initialUserId);
  const [otp, setOtp] = useState(initialOtp);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!otp || otp.length !== 6) {
      errs.otp = 'Please enter the 6-digit OTP code.';
    }

    if (!newPassword) {
      errs.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errs.newPassword = 'Password must contain at least 8 characters.';
    } else if (!/[A-Z]/.test(newPassword)) {
      errs.newPassword = 'Must contain at least one uppercase letter.';
    } else if (!/[a-z]/.test(newPassword)) {
      errs.newPassword = 'Must contain at least one lowercase letter.';
    } else if (!/[0-9]/.test(newPassword)) {
      errs.newPassword = 'Must contain at least one number.';
    } else if (!/[^A-Za-z0-9]/.test(newPassword)) {
      errs.newPassword = 'Must contain at least one special character.';
    }

    if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setGeneralError('');
    setErrors({});

    try {
      await resetPassword({
        userId,
        otp,
        newPassword,
        confirmPassword,
      });
      onNavigate('/login');
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to update password. Please check your OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create New Password"
      subtitle={maskedMobile ? `Enter the verification code sent to ${maskedMobile}` : 'Enter your OTP and choose a strong new password.'}
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
        {/* OTP Input */}
        <div className="mb-2">
          <label className="text-xs font-semibold text-slate-300 tracking-wide">
            6-Digit Verification Code
          </label>
          <OTPInput
            value={otp}
            onChange={(val) => {
              setOtp(val);
              if (errors.otp) setErrors({ ...errors, otp: '' });
            }}
            disabled={loading}
          />
          {errors.otp && <p className="text-rose-400 text-xs mt-1">{errors.otp}</p>}
        </div>

        {/* New Password */}
        <PasswordInput
          id="reset-new-password"
          label="New Password"
          placeholder="Create new password"
          showStrengthMeter
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (errors.newPassword) setErrors({ ...errors, newPassword: '' });
          }}
          error={errors.newPassword}
          disabled={loading}
          autoComplete="new-password"
        />

        {/* Confirm Password */}
        <PasswordInput
          id="reset-confirm-password"
          label="Confirm New Password"
          placeholder="Re-enter new password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
          }}
          error={errors.confirmPassword}
          disabled={loading}
          autoComplete="new-password"
        />

        {generalError && (
          <div className="mb-4 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-center font-medium">
            {generalError}
          </div>
        )}

        <div className="mt-4">
          <LoadingButton
            id="reset-password-submit-btn"
            type="submit"
            loading={loading}
            loadingText="Updating Password..."
          >
            Update Password
          </LoadingButton>
        </div>
      </form>
    </AuthCard>
  );
};
