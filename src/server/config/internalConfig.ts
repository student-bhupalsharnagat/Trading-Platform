/**
 * Configuration module for Internal Server-to-Server Communication with Central Admin.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - This secret must NEVER be exposed to browser, Vite client, or frontend bundles.
 * - In production (NODE_ENV=production), missing secrets cause an immediate secure startup failure.
 * - Insecure hardcoded fallbacks are strictly prohibited in production.
 */

export interface InternalAuthConfig {
  tradingPlatformBaseUrl: string;
  internalCommunicationSecret: string;
  maxAgeMs: number;
  isProduction: boolean;
}

export function getInternalAuthConfig(): InternalAuthConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.INTERNAL_COMMUNICATION_SECRET || process.env.CENTRAL_ADMIN_INTERNAL_SECRET || '';

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'FATAL SECURITY ERROR: INTERNAL_COMMUNICATION_SECRET environment variable is missing in production mode. System halting securely.'
      );
    }
    console.warn(
      '[SECURITY WARNING] INTERNAL_COMMUNICATION_SECRET is not configured in development environment. Using development testing secret. Do NOT use in production.'
    );
  }

  const effectiveSecret = secret || 'vtx_dev_internal_shared_secret_do_not_use_in_prod';
  const baseUrl = process.env.TRADING_PLATFORM_BASE_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const maxAgeMs = parseInt(process.env.INTERNAL_REQUEST_MAX_AGE_MS || '30000', 10) || 30000;

  return {
    tradingPlatformBaseUrl: baseUrl,
    internalCommunicationSecret: effectiveSecret,
    maxAgeMs,
    isProduction,
  };
}
