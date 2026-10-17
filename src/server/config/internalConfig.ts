/**
 * Configuration module for Internal Server-to-Server Communication with Central Admin.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - This secret must NEVER be exposed to browser, Vite client, or frontend bundles.
 * - In production (NODE_ENV=production), missing secrets cause an immediate secure startup failure.
 * - Insecure hardcoded fallbacks are strictly prohibited in production.
 */

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.INTERNAL_COMMUNICATION_SECRET || process.env.CENTRAL_ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!secret || secret.length < 32) {
    throw new Error(
      `[SECURITY ERROR] INTERNAL_COMMUNICATION_SECRET (or INTERNAL_API_SECRET) must be configured and at least 32 characters in production (length: ${secret.length}).`
    );
  }
}

export interface InternalAuthConfig {
  tradingPlatformBaseUrl: string;
  internalCommunicationSecret: string;
  maxAgeMs: number;
  isProduction: boolean;
}

export function getInternalAuthConfig(): InternalAuthConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.INTERNAL_COMMUNICATION_SECRET || process.env.CENTRAL_ADMIN_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET || '';

  if (isProduction) {
    if (!secret || secret.length < 32) {
      throw new Error(
        `[SECURITY ERROR] INTERNAL_COMMUNICATION_SECRET (or INTERNAL_API_SECRET) must be configured and at least 32 characters in production (length: ${secret ? secret.length : 0}).`
      );
    }
  } else if (!secret) {
    console.warn(
      '[SECURITY WARNING] INTERNAL_COMMUNICATION_SECRET is not configured. Using internal fallback secret. Set INTERNAL_COMMUNICATION_SECRET in environment for production.'
    );
  }

  const effectiveSecret = isProduction ? secret : (secret || 'vtx_dev_internal_shared_secret_do_not_use_in_prod');
  const baseUrl = process.env.TRADING_PLATFORM_BASE_URL || process.env.TRADING_PLATFORM_URL || process.env.CLIENT_URL || 'https://trading-platform-2t6r.onrender.com';
  const maxAgeMs = parseInt(process.env.INTERNAL_REQUEST_MAX_AGE_MS || '30000', 10) || 30000;

  return {
    tradingPlatformBaseUrl: baseUrl,
    internalCommunicationSecret: effectiveSecret,
    maxAgeMs,
    isProduction,
  };
}
