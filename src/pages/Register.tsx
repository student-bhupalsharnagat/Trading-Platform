import React, { useState } from 'react';
import { AuthCard } from '../components/AuthCard.tsx';
import { AuthInput } from '../components/AuthInput.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { LoadingButton } from '../components/LoadingButton.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useTenant } from '../context/TenantContext.tsx';
import { ShieldAlert, AlertCircle } from 'lucide-react';

interface RegisterProps {
  onNavigate: (route: string, state?: any) => void;
}

export const Register: React.FC<RegisterProps> = ({ onNavigate }) => {
  const { register, loginDemo, showToast } = useAuth();
  const { branding, isRegistrationEnabled, status } = useTenant();

  const [formData, setFormData] = useState({
    fullName: '',
    userId: '',
    countryCode: '+91',
    mobile: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const validateFrontend = (): boolean => {
    const errs: Record<string, string> = {};

    // 1. Full Name
    if (!formData.fullName.trim()) {
      errs.fullName = 'Please enter your full name.';
    } else if (formData.fullName.trim().length < 2) {
      errs.fullName = 'Full name must be at least 2 characters.';
    }

    // 2. User ID
    const cleanUserId = formData.userId.trim();
    if (!cleanUserId) {
      errs.userId = 'User ID is required.';
    } else if (cleanUserId.length < 4 || cleanUserId.length > 20) {
      errs.userId = 'User ID must be 4 to 20 characters.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(cleanUserId)) {
      errs.userId = 'User ID can only contain letters, numbers, and underscores.';
    }

    // 3. Mobile Number
    const cleanMobile = formData.mobile.replace(/\D/g, '');
    if (!cleanMobile) {
      errs.mobile = 'Mobile number is required.';
    } else if (cleanMobile.length !== 10 || !/^[6-9]\d{9}$/.test(cleanMobile)) {
      errs.mobile = 'Please enter a valid 10-digit Indian mobile number.';
    }

    // 4. Password
    if (!formData.password) {
      errs.password = 'Password is required.';
    } else if (formData.password.length < 8) {
      errs.password = 'Password must contain at least 8 characters.';
    } else if (!/[A-Z]/.test(formData.password)) {
      errs.password = 'Password must contain at least one uppercase letter.';
    } else if (!/[a-z]/.test(formData.password)) {
      errs.password = 'Password must contain at least one lowercase letter.';
    } else if (!/[0-9]/.test(formData.password)) {
      errs.password = 'Password must contain at least one number.';
    } else if (!/[^A-Za-z0-9]/.test(formData.password)) {
      errs.password = 'Password must contain at least one special character.';
    }

    // 5. Confirm Password
    if (!formData.confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateFrontend()) return;

    setLoading(true);
    setErrors({});

    try {
      const res = await register(formData);
      // Navigate to OTP Verification page with user state
      onNavigate('/verify-otp', {
        userId: res.userId || formData.userId.toLowerCase().trim(),
        mobile: formData.mobile,
        countryCode: formData.countryCode,
      });
    } catch (err: any) {
      console.error('Registration failed:', err);
      if (err.errors) {
        setErrors(err.errors);
      } else if (err.field) {
        setErrors({ [err.field]: err.message });
      } else {
        showToast({
          type: 'error',
          title: 'Registration Error',
          description: err.message || 'Could not complete registration. Please try again.',
        });
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
        description: err.message || 'Failed to activate demo trading.',
      });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle={`Join ${branding.brandName || 'VERTEX'} and trade Multi-Asset Markets in real-time`}
      footer={
        <div className="flex flex-col items-center space-y-2 text-xs">
          <p className="text-slate-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="text-[#FF7A00] font-bold hover:text-orange-300 transition-colors ml-1 cursor-pointer"
            >
              Sign In here →
            </button>
          </p>
        </div>
      }
    >
      {/* Registration Disabled Banner if central policy restricts it */}
      {!isRegistrationEnabled && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Public Registration Suspended</div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              New client sign-ups are temporarily disabled for {branding.brandName} by Central Risk Policy. Please use existing credentials to sign in, or launch Demo Access.
            </div>
          </div>
        </div>
      )}

      {/* Auth Mode Switcher */}
      <div className="grid grid-cols-2 p-1 bg-[#080E18] rounded-xl border border-[#1A2638] mb-5">
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
        >
          Sign In
        </button>
        <button
          type="button"
          className="py-2 text-xs font-bold rounded-lg bg-orange-500 text-slate-950 shadow-sm transition-all cursor-pointer"
        >
          Create Account
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* 1. Full Name */}
        <AuthInput
          id="register-full-name"
          label="Full Name"
          placeholder="e.g. Ravi Kumar"
          value={formData.fullName}
          onChange={(e) => {
            setFormData({ ...formData, fullName: e.target.value });
            if (errors.fullName) setErrors({ ...errors, fullName: '' });
          }}
          error={errors.fullName}
          disabled={loading || demoLoading}
          autoComplete="name"
        />

        {/* 2. User ID */}
        <AuthInput
          id="register-user-id"
          label="User ID"
          placeholder="e.g. VTX123"
          helperText="This will be your unique login ID"
          value={formData.userId}
          onChange={(e) => {
            setFormData({ ...formData, userId: e.target.value });
            if (errors.userId) setErrors({ ...errors, userId: '' });
          }}
          error={errors.userId}
          disabled={loading || demoLoading}
          autoComplete="username"
        />

        {/* 3. Mobile Number */}
        <AuthInput
          id="register-mobile"
          label="Mobile No."
          placeholder="e.g. 9876543210"
          helperText="We'll send an OTP to verify this number"
          isMobileField
          countryCode={formData.countryCode}
          value={formData.mobile}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
            setFormData({ ...formData, mobile: digits });
            if (errors.mobile) setErrors({ ...errors, mobile: '' });
          }}
          error={errors.mobile}
          disabled={loading || demoLoading}
          autoComplete="tel"
          maxLength={10}
        />

        {/* 4. Password */}
        <PasswordInput
          id="register-password"
          label="Password"
          placeholder="Create a password"
          showStrengthMeter
          value={formData.password}
          onChange={(e) => {
            setFormData({ ...formData, password: e.target.value });
            if (errors.password) setErrors({ ...errors, password: '' });
          }}
          error={errors.password}
          disabled={loading || demoLoading}
          autoComplete="new-password"
        />

        {/* 5. Confirm Password */}
        <PasswordInput
          id="register-confirm-password"
          label="Confirm Password"
          placeholder="Re-enter your password"
          value={formData.confirmPassword}
          onChange={(e) => {
            setFormData({ ...formData, confirmPassword: e.target.value });
            if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
          }}
          error={errors.confirmPassword}
          disabled={loading || demoLoading}
          autoComplete="new-password"
        />

        {/* 6. Referral Code (optional) */}
        <AuthInput
          id="register-referral"
          label="Referral Code (optional)"
          placeholder="Enter referral code"
          value={formData.referralCode}
          onChange={(e) => {
            setFormData({ ...formData, referralCode: e.target.value.toUpperCase() });
            if (errors.referralCode) setErrors({ ...errors, referralCode: '' });
          }}
          error={errors.referralCode}
          disabled={loading || demoLoading}
          helperText="Optional promo code (e.g. VERTEXPRO, ALPHA2026)"
        />

        {/* Submit Button */}
        <div className="mt-6">
          <LoadingButton
            id="register-submit-btn"
            type="submit"
            loading={loading}
            loadingText="Creating account..."
          >
            Create Account
          </LoadingButton>
        </div>

        {/* OR Divider */}
        <div className="flex items-center my-5">
          <div className="flex-1 h-px bg-[#1E293B]" />
          <span className="px-3 text-[11px] font-semibold text-slate-500 tracking-wider">
            OR
          </span>
          <div className="flex-1 h-px bg-[#1E293B]" />
        </div>

        {/* Try Demo Account Button */}
        <LoadingButton
          id="register-demo-btn"
          type="button"
          variant="secondary"
          loading={demoLoading}
          loadingText="Loading Demo..."
          onClick={handleDemoLogin}
          className="border-slate-700/60 text-orange-400 hover:text-orange-300"
        >
          Try Demo Account
        </LoadingButton>
      </form>
    </AuthCard>
  );
};
