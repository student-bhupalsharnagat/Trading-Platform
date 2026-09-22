/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5I
 * Production Security Headers, CSRF Mitigation, and Request Sanitization
 */

import { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Baseline Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  // HSTS in production
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content Security Policy - Configured for TradingView charts, Google Fonts, and AI Studio iframe preview
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com https://tradingview.com https://*.tradingview-widget.com",
      "frame-src 'self' https://s.tradingview.com https://*.tradingview.com https://tradingview.com https://*.tradingview-widget.com https://*.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.tradingview.com https://*.tradingview-widget.com",
      "img-src 'self' data: blob: https: https://*.tradingview.com",
      "font-src 'self' data: https: https://fonts.gstatic.com",
      "connect-src 'self' ws: wss: http: https: https://*.tradingview.com wss://*.tradingview.com",
      "frame-ancestors 'self' https: http:",
    ].join('; ')
  );

  next();
}

/**
 * CSRF Protection for state-changing browser API requests.
 * Exempts HMAC-authenticated internal routes and webhook endpoints.
 */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!mutatingMethods.includes(method)) {
    return next();
  }

  // Exempt routes with independent cryptographic authentication (HMAC-SHA256)
  if (
    req.path.startsWith('/api/internal/') ||
    req.path.includes('/gateways/webhook') ||
    req.path.startsWith('/api/health') ||
    req.path === '/health' ||
    req.path === '/live' ||
    req.path === '/ready'
  ) {
    return next();
  }

  // Check custom request headers commonly used by SPAs
  const hasCustomAuthHeader = Boolean(req.headers['authorization'] || req.headers['x-requested-with']);
  const cookieAuth = Boolean(req.cookies?.['vertex_auth_token']);

  // If using Cookie authentication without custom header, verify Origin / Referer
  if (cookieAuth && !hasCustomAuthHeader) {
    const origin = req.headers['origin'] || req.headers['referer'];
    const host = req.headers['host'];

    if (origin && host) {
      try {
        const originUrl = new URL(typeof origin === 'string' ? origin : origin[0]);
        if (originUrl.host !== host) {
          res.status(403).json({
            success: false,
            code: 'CSRF_ORIGIN_MISMATCH',
            message: 'Cross-site request blocked: Origin does not match Host.',
          });
          return;
        }
      } catch {
        // Invalid origin format
        res.status(403).json({
          success: false,
          code: 'CSRF_INVALID_ORIGIN',
          message: 'Cross-site request blocked: Invalid origin header.',
        });
        return;
      }
    }
  }

  next();
}

/**
 * HTTP Parameter Pollution (HPP) sanitizer
 * Prevents attackers from supplying duplicate query parameters as arrays.
 */
export function sanitizeQueryParams(req: Request, _res: Response, next: NextFunction): void {
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        // Take the first scalar value
        req.query[key] = (req.query[key] as any[])[0];
      }
    }
  }
  next();
}
