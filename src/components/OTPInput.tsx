import React, { useRef, useEffect } from 'react';

interface OTPInputProps {
  value: string;
  onChange: (otp: string) => void;
  disabled?: boolean;
  onComplete?: (otp: string) => void;
}

export const OTPInput: React.FC<OTPInputProps> = ({
  value,
  onChange,
  disabled = false,
  onComplete,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const otpDigits = (value || '').split('');

  useEffect(() => {
    // Focus first input on mount if empty
    if (!value && inputsRef.current[0]) {
      inputsRef.current[0]?.focus();
    }
  }, []);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const digitsOnly = rawVal.replace(/\D/g, '');

    if (!digitsOnly) {
      // Clear current digit
      const newDigits = [...otpDigits];
      newDigits[index] = '';
      const updated = newDigits.join('').slice(0, 6);
      onChange(updated);
      return;
    }

    // Single digit entry
    const char = digitsOnly.slice(-1);
    const newDigits = [...otpDigits];
    while (newDigits.length < index) newDigits.push('');
    newDigits[index] = char;
    const updated = newDigits.join('').slice(0, 6);
    onChange(updated);

    // Auto advance to next box
    if (index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1]?.focus();
    }

    if (updated.length === 6 && onComplete) {
      onComplete(updated);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0 && inputsRef.current[index - 1]) {
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      if (pasted.length === 6 && onComplete) {
        onComplete(pasted);
      }
      const targetIndex = Math.min(pasted.length, 5);
      inputsRef.current[targetIndex]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-2.5 my-4">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          id={`otp-digit-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          value={otpDigits[index] || ''}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="w-11 h-13 sm:w-12 sm:h-14 bg-[#080E18] border border-[#1B273A] focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25 rounded-xl text-center text-xl font-bold font-mono text-orange-400 placeholder-slate-600 outline-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-inner"
        />
      ))}
    </div>
  );
};
