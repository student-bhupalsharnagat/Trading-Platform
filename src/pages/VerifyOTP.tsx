import React, { useState, useEffect } from 'react';
import { AuthCard } from '../components/AuthCard.tsx';
import { OTPInput } from '../components/OTPInput.tsx';
import { LoadingButton } from '../components/LoadingButton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { RotateCw, ShieldCheck, ArrowLeft } from 'lucide-react';

interface VerifyOTPProps {
  initialUserId?: string;
  initialMobile?: string;
  initialCountryCode?: string;
  purpose?: 'registration' | 'password_reset';
  onNavigate: (route: string, state?: any) => void;
}

export const VerifyOTP: React.FC<VerifyOTPProps> = ({
  initialUserId = '',
  initialMobile = '',
  initialCountryCode = '+91',
  purpose = 'registration',
  onNavigate,
}) => {
  const { verifyOtp, resendOtp, showToast, latestDevOtp } = useAuth();

  const [userId] = useState(initialUserId);
  const [mobile] = useState(initialMobile);
  const [countryCode] = useState(initialCountryCode);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // 10:00 Validity Countdown
  const [validitySeconds, setValiditySeconds] = useState(600);
  // 45 seconds Resend Cooldown
  const [resendCooldown, setResendCooldown] = useState(45);

  useEffect(() => {
    // Timer for 10-minute validity
    const validityTimer = setInterval(() => {
      setValiditySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // Timer for 45s resend cooldown
    const cooldownTimer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(validityTimer);
      clearInterval(cooldownTimer);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const maskedMobile = mobile
    ? `${countryCode} XXXXXXX${mobile.slice(-4)}`
    : `${countryCode} registered mobile`;

  const handleVerify = async (codeToVerify?: string) => {
    const targetOtp = codeToVerify || otp;
    if (targetOtp.length !== 6) {
      setError('Please enter the full 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyOtp(userId, targetOtp, purpose);
      // If password reset, navigate to reset password page, else to login / dashboard
      if (purpose === 'password_reset') {
        onNavigate('/reset-password', { userId, otp: targetOtp });
      } else {
        // Successful registration verification
        showToast({
          type: 'success',
          title: 'Account Verified',
          description: 'Your account is ready! Please log in.',
        });
        onNavigate('/login');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setError('');

    try {
      await resendOtp(userId, purpose);
      setResendCooldown(45);
      setValiditySeconds(600);
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthCard
      title="Verify your mobile number"
      subtitle={`We sent a 6-digit verification code to ${maskedMobile}`}
      footer={
        <button
          type="button"
          onClick={() => onNavigate('/register')}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-xs font-medium cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to registration
        </button>
      }
    >
      <div className="space-y-4">
        {/* OTP Input Boxes */}
        <OTPInput
          value={otp}
          onChange={(newVal) => {
            setOtp(newVal);
            if (error) setError('');
          }}
          disabled={loading}
          onComplete={(completedOtp) => handleVerify(completedOtp)}
        />

        {/* Validity countdown indicator */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
            Code expires in:
          </span>
          <span className={`font-mono font-semibold ${validitySeconds < 60 ? 'text-rose-400' : 'text-slate-300'}`}>
            {formatTime(validitySeconds)}
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-center font-medium animate-shake">
            {error}
          </div>
        )}

        {/* Verify Button */}
        <div className="pt-2">
          <LoadingButton
            id="verify-otp-submit-btn"
            type="button"
            loading={loading}
            loadingText="Verifying..."
            disabled={otp.length !== 6}
            onClick={() => handleVerify()}
          >
            Verify OTP
          </LoadingButton>
        </div>

        {/* Resend OTP Cooldown / Button */}
        <div className="text-center pt-2">
          {resendCooldown > 0 ? (
            <p className="text-xs text-slate-400">
              Resend OTP in{' '}
              <span className="font-mono text-orange-400 font-semibold">
                {formatTime(resendCooldown)}
              </span>
            </p>
          ) : (
            <button
              type="button"
              id="resend-otp-btn"
              disabled={resending}
              onClick={handleResend}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              Resend OTP
            </button>
          )}
        </div>
      </div>
    </AuthCard>
  );
};
