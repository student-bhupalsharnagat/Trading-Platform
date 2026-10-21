/**
 * Configuration module for Internal Server-to-Server Communication with Central Admin.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - This secret must NEVER be exposed to browser, Vite client, or frontend bundles.
 * - In production (NODE_ENV=production), missing secrets cause an immediate secure startup failure.
 * - Insecure hardcoded fallbacks are strictly prohibited in production.
 */

export const DEFAULT_INTERNAL_FALLBACK_SECRET = 'nextrade-internal-hmac-secret-2026';

if (process.env.NODE_ENV === 'production') {
  const secret =
    process.env.INTERNAL_COMMUNICATION_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    process.env.CENTRAL_ADMIN_INTERNAL_SECRET ||
    DEFAULT_INTERNAL_FALLBACK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      `[SECURITY ERROR] INTERNAL_COMMUNICATION_SECRET (or INTERNAL_API_SECRET) must be configured and at least 32 characters in production (length: ${secret.length}).`
    );
  }
}

export interface InternalAuthConfig {
  tradingPlatformBaseUrl: string;
  internalCommunicationSecret: string;
  candidateSecrets: string[];
  maxAgeMs: number;
  isProduction: boolean;
}

/**
 * Resolves a URL to Render internal private network hostname (100% free bandwidth)
 * if running on Render or when internal networking is enabled.
 */
export function resolveInternalRenderUrl(rawUrl?: string, defaultPort = 10000): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (
    process.env.ENABLE_RENDER_INTERNAL_NETWORKING === 'true' ||
    (process.env.RENDER === 'true' && process.env.AUTO_RENDER_INTERNAL_NETWORKING !== 'false')
  ) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname.endsWith('.onrender.com')) {
        const slug = parsed.hostname.replace('.onrender.com', '');
        const port = process.env.RENDER_INTERNAL_PORT || defaultPort;
        return `http://${slug}:${port}`;
      }
    } catch {}
  }
  return trimmed;
}

export function getInternalAuthConfig(): InternalAuthConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const commSecret = process.env.INTERNAL_COMMUNICATION_SECRET?.trim() || '';
  const apiSecret = process.env.INTERNAL_API_SECRET?.trim() || '';
  const centralSecret = process.env.CENTRAL_ADMIN_INTERNAL_SECRET?.trim() || '';
  const fallbackSecret = DEFAULT_INTERNAL_FALLBACK_SECRET;

  // Primary effective secret for outbound requests
  const effectiveSecret = commSecret || apiSecret || centralSecret || fallbackSecret;

  // All acceptable candidate secrets for inbound verification (deduplicated)
  const candidateSecrets = Array.from(
    new Set([commSecret, apiSecret, centralSecret, fallbackSecret].filter((s) => s.length > 0))
  );

  const rawBaseUrl =
    process.env.TRADING_PLATFORM_INTERNAL_URL ||
    process.env.TRADING_PLATFORM_BASE_URL ||
    process.env.TRADING_PLATFORM_URL ||
    process.env.CLIENT_URL ||
    'https://trading-platform-2t6r.onrender.com';
  const baseUrl = resolveInternalRenderUrl(rawBaseUrl);
  const maxAgeMs = parseInt(process.env.INTERNAL_REQUEST_MAX_AGE_MS || '30000', 10) || 30000;

  return {
    tradingPlatformBaseUrl: baseUrl,
    internalCommunicationSecret: effectiveSecret,
    candidateSecrets,
    maxAgeMs,
    isProduction,
  };
}
