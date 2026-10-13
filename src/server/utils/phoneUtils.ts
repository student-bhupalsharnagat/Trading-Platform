/**
 * Phone Number Normalization Utility (E.164 Standard)
 * E.164 standard format: +[country code][subscriber number] (up to 15 digits)
 */

export interface NormalizedPhone {
  e164: string; // e.g. +919876543210, +14155552671
  countryCode: string; // e.g. +91, +1
  nationalNumber: string; // e.g. 9876543210, 4155552671
  masked: string; // e.g. +91 ••••• •3210
}

export class PhoneUtils {
  /**
   * Normalizes an international phone number to E.164 format.
   * Accepts combined phone string or split (countryCode + nationalNumber).
   */
  public static normalize(
    rawPhone: string,
    defaultCountryCode = '+91'
  ): NormalizedPhone | null {
    if (!rawPhone || typeof rawPhone !== 'string') return null;

    let trimmed = rawPhone.trim();
    if (!trimmed) return null;

    // Standardize leading zeros or symbols
    let hasPlus = trimmed.startsWith('+');
    let digitsOnly = trimmed.replace(/\D/g, '');

    if (!digitsOnly || digitsOnly.length < 7 || digitsOnly.length > 15) {
      return null;
    }

    let countryCode = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    let nationalNumber = digitsOnly;
    let e164 = '';

    if (hasPlus) {
      // Raw string had explicit '+', so the country code is part of digitsOnly
      e164 = `+${digitsOnly}`;

      // Extract approximate country code
      if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
        countryCode = '+91';
        nationalNumber = digitsOnly.slice(2);
      } else if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
        countryCode = '+1';
        nationalNumber = digitsOnly.slice(1);
      } else if (digitsOnly.startsWith('44') && digitsOnly.length >= 11) {
        countryCode = '+44';
        nationalNumber = digitsOnly.slice(2);
      } else if (digitsOnly.startsWith('971') && digitsOnly.length >= 11) {
        countryCode = '+971';
        nationalNumber = digitsOnly.slice(3);
      } else if (digitsOnly.startsWith('65') && digitsOnly.length >= 10) {
        countryCode = '+65';
        nationalNumber = digitsOnly.slice(2);
      } else {
        countryCode = `+${digitsOnly.slice(0, Math.min(3, digitsOnly.length - 7))}`;
        nationalNumber = digitsOnly.slice(countryCode.length - 1);
      }
    } else {
      const ccDigits = countryCode.replace(/\D/g, '');

      // Check if user already prepended country code digits without '+'
      if (digitsOnly.startsWith(ccDigits) && digitsOnly.length > 10) {
        e164 = `+${digitsOnly}`;
        nationalNumber = digitsOnly.slice(ccDigits.length);
      } else {
        // Strip single leading 0 (trunk prefix) if present
        if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
          digitsOnly = digitsOnly.slice(1);
        }
        nationalNumber = digitsOnly;
        e164 = `${countryCode}${nationalNumber}`;
      }
    }

    // Validate final E.164 length (between 8 and 16 characters including '+')
    const finalDigits = e164.replace(/\D/g, '');
    if (finalDigits.length < 7 || finalDigits.length > 15) {
      return null;
    }

    // Masked format for privacy in responses / notifications
    const last4 = nationalNumber.slice(-4);
    const masked = `${countryCode} ••••• •${last4}`;

    return {
      e164,
      countryCode,
      nationalNumber,
      masked,
    };
  }

  /**
   * Validates if a string is a valid E.164 phone number
   */
  public static isValidE164(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return false;
    return /^\+[1-9]\d{6,14}$/.test(phone.trim());
  }
}
