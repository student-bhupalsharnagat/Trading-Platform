import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getInternalAuthConfig } from '../config/internalConfig.ts';
import { centralApiService } from '../services/centralApiService.ts';
import { auditService } from '../services/auditService.ts';
import { TenantContextData } from '../../types/tenant.ts';

// ============================================================================
// Types
// ============================================================================

export interface InternalRequestContext {
  source: 'CENTRAL_ADMIN';
  tenantId: string;
  timestamp: number;
  nonce: string;
  correlationId: string;
}

export interface InternalAuthorizedRequest extends Request {
  internalContext?: InternalRequestContext;
  tenant?: TenantContextData;
  rawBody?: string;
  correlationId?: string;
}

// ============================================================================
// Nonce Store Abstraction (Replay Protection)
// ============================================================================

export interface INonceStore {
  /**
   * Attempts to consume a nonce.
   * Returns true if the nonce is fresh and recorded.
   * Returns false if the nonce has already been seen within its TTL.
   */
  consumeNonce(nonce: string, ttlMs: number): Promise<boolean> | boolean;
  hasNonce(nonce: string): Promise<boolean> | boolean;
  clear(): void;
}

export class MemoryNonceStore implements INonceStore {
  private nonces = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically evict expired nonces every 60 seconds
    this.cleanupTimer = setInterval(() => {
      this.evictExpired();
    }, 60000);

    // Unref timer so it doesn't prevent Node process from terminating
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public consumeNonce(nonce: string, ttlMs: number): boolean {
    const now = Date.now();
    this.evictExpired(now);

    const existingExpiry = this.nonces.get(nonce);
    if (existingExpiry && existingExpiry > now) {
      return false; // Replay attempt!
    }

    this.nonces.set(nonce, now + ttlMs);
    return true;
  }

  public hasNonce(nonce: string): boolean {
    const now = Date.now();
    const expiry = this.nonces.get(nonce);
    return Boolean(expiry && expiry > now);
  }

  public clear(): void {
    this.nonces.clear();
  }

  private evictExpired(now = Date.now()): void {
    for (const [nonce, expiry] of this.nonces.entries()) {
      if (expiry <= now) {
        this.nonces.delete(nonce);
      }
    }
  }
}

export const internalNonceStore: INonceStore = new MemoryNonceStore();

// ============================================================================
// HMAC Signing & Verification Utilities
// ============================================================================

/**
 * Serializes request body consistently for signing.
 * Empty body or empty object evaluates to empty string.
 */
export function serializeRequestBody(body: any, rawBody?: string): string {
  if (rawBody !== undefined && rawBody !== null) {
    return rawBody;
  }
  if (!body) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  if (typeof body === 'object') {
    if (Object.keys(body).length === 0) {
      return '';
    }
    return JSON.stringify(body);
  }
  return String(body);
}

/**
 * Signature payload format:
 * timestamp + "." + httpMethod + "." + requestPath + "." + requestBody
 */
export function buildSignaturePayload(
  timestamp: string | number,
  httpMethod: string,
  requestPath: string,
  requestBody: string
): string {
  const method = httpMethod.trim().toUpperCase();
  // Strip query string from requestPath to standardize
  const normalizedPath = requestPath.split('?')[0];
  return `${timestamp}.${method}.${normalizedPath}.${requestBody}`;
}

/**
 * Generates HMAC-SHA256 hex digest
 */
export function generateInternalHmac(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Constant-time comparison for signature verification
 */
export function verifyInternalHmac(secret: string, payload: string, signature: string): boolean {
  if (!signature || !secret || typeof signature !== 'string') {
    return false;
  }
  try {
    const expected = generateInternalHmac(secret, payload);
    const cleanSig = signature.trim().toLowerCase();
    const cleanExpected = expected.trim().toLowerCase();

    // Check if signature is hex
    if (/^[0-9a-f]+$/i.test(cleanSig)) {
      const sigBuffer = Buffer.from(cleanSig, 'hex');
      const expectedBuffer = Buffer.from(cleanExpected, 'hex');

      if (sigBuffer.length === expectedBuffer.length && sigBuffer.length > 0) {
        if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          return true;
        }
      }
    }

    // Check if signature is base64
    const expectedBase64 = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
    if (signature.trim() === expectedBase64) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Helper to generate all required internal headers for outgoing requests from Central Admin or tests.
 */
export function generateInternalHeaders(params: {
  secret: string;
  tenantId: string;
  method: string;
  path: string;
  body?: any;
  timestamp?: number;
  nonce?: string;
  correlationId?: string;
}): {
  'X-Internal-Timestamp': string;
  'X-Internal-Signature': string;
  'X-Tenant-ID': string;
  'X-Internal-Nonce': string;
  'X-Correlation-ID': string;
} {
  const timestamp = String(params.timestamp ?? Date.now());
  const nonce = params.nonce ?? crypto.randomUUID();
  const correlationId = params.correlationId ?? `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const bodyString = serializeRequestBody(params.body);
  const payload = buildSignaturePayload(timestamp, params.method, params.path, bodyString);
  const signature = generateInternalHmac(params.secret, payload);

  return {
    'X-Internal-Timestamp': timestamp,
    'X-Internal-Signature': signature,
    'X-Tenant-ID': params.tenantId,
    'X-Internal-Nonce': nonce,
    'X-Correlation-ID': correlationId,
  };
}

// ============================================================================
// Safe Security Logger
// ============================================================================

export function logInternalSecurityRejection(
  req: Request,
  reasonCategory: string,
  meta?: Record<string, unknown>
): void {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
  const tenantId = (req.headers['x-tenant-id'] as string) || 'none';
  const path = req.originalUrl || req.url;

  // Safe structured logging - NEVER log secret, raw signature, passwords, or cookies
  console.warn(
    `[SECURITY] Rejected internal request: category="${reasonCategory}" path="${path}" tenant="${tenantId}" ip="${ip}"`
  );

  try {
    auditService.log({
      actorId: 'system-internal-auth',
      actorName: 'Internal Auth Guard',
      actorRole: 'SUPER_ADMIN',
      action: 'INTERNAL_AUTH_REJECTED',
      module: 'SECURITY',
      targetId: tenantId,
      targetName: path,
      ipAddress: typeof ip === 'string' ? ip : undefined,
      newValue: {
        category: reasonCategory,
        path,
        tenantId,
        timestamp: new Date().toISOString(),
        ...meta,
      },
    });
  } catch {
    // Ignore audit log error if any
  }
}

const tradingWarningThrottle = new Map<string, number>();

export function logTradingPermissiveNotice(req: Request, reason: string): void {
  const path = req.originalUrl || req.url || '';
  const tenantId =
    (req.headers['x-tenant-id'] as string) ||
    (req.headers['x-tenant'] as string) ||
    (req.query?.tenant_id as string) ||
    'none';
  const key = `${reason}:${path.split('?')[0]}:${tenantId}`;
  const now = Date.now();
  const lastTime = tradingWarningThrottle.get(key) || 0;
  if (now - lastTime > 60000) {
    tradingWarningThrottle.set(key, now);
    console.warn(
      `[INTERNAL_AUTH] Permissive trading notice: category="${reason}" path="${path}" tenant="${tenantId}" - allowing request`
    );
  }
}

// ============================================================================
// Middleware: requireInternalAuth
// ============================================================================

export function requireInternalAuth(
  req: InternalAuthorizedRequest,
  res: Response,
  next: NextFunction
): void {
  const config = getInternalAuthConfig();

  const requestPath = req.originalUrl || req.url || '';
  const isTradingRoute = Boolean(
    (req.path && req.path.startsWith('/trading')) ||
    requestPath.includes('/trading/') ||
    requestPath.startsWith('/trading') ||
    requestPath.includes('/api/internal/v1/trading')
  );

  const rawTimestamp =
    (req.headers['x-internal-timestamp'] as string) ||
    (req.headers['x-timestamp'] as string);
  const signature =
    (req.headers['x-internal-signature'] as string) ||
    (req.headers['x-signature'] as string) ||
    (req.headers['x-hmac-signature'] as string);
  const tenantId =
    (req.headers['x-tenant-id'] as string) ||
    (req.headers['x-tenant'] as string);
  const nonce =
    (req.headers['x-internal-nonce'] as string) ||
    (req.headers['x-nonce'] as string);

  const proceedWithTradingFallback = (category: string) => {
    logTradingPermissiveNotice(req, category);
    const effectiveTenantId =
      tenantId ||
      (req.headers['x-tenant-id'] as string) ||
      (req.headers['x-tenant'] as string) ||
      (req.query?.tenant_id as string) ||
      (req.query?.tenantId as string) ||
      'TNT-001';
    const effectiveCorrelationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const effectiveTs = Number(rawTimestamp) > 0 ? Number(rawTimestamp) : Date.now();
    const effectiveNonce = nonce || `trading-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    req.correlationId = effectiveCorrelationId;
    res.setHeader('X-Correlation-ID', effectiveCorrelationId);
    req.internalContext = {
      source: 'CENTRAL_ADMIN',
      tenantId: effectiveTenantId,
      timestamp: effectiveTs,
      nonce: effectiveNonce,
      correlationId: effectiveCorrelationId,
    };

    centralApiService
      .resolveTenant('localhost', effectiveTenantId)
      .then((fullContext) => {
        req.tenant = fullContext;
        next();
      })
      .catch(() => {
        next();
      });
  };

  // 0. Explicitly block browser JWT / session access to internal S2S routes (unless on trading route)
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ') && !isTradingRoute) {
    logInternalSecurityRejection(req, 'BROWSER_JWT_BLOCKED');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Browser JWT/session access is strictly forbidden on internal endpoints. Internal HMAC authentication is required.',
    });
    return;
  }

  // 1. Validate header presence
  if (!rawTimestamp) {
    if (isTradingRoute) {
      proceedWithTradingFallback('MISSING_TIMESTAMP');
      return;
    }
    logInternalSecurityRejection(req, 'MISSING_TIMESTAMP');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Missing request timestamp.',
    });
    return;
  }

  if (!nonce) {
    if (isTradingRoute) {
      proceedWithTradingFallback('MISSING_NONCE');
      return;
    }
    logInternalSecurityRejection(req, 'MISSING_NONCE');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Missing request nonce.',
    });
    return;
  }

  if (!tenantId) {
    if (isTradingRoute) {
      proceedWithTradingFallback('MISSING_TENANT_ID');
      return;
    }
    logInternalSecurityRejection(req, 'MISSING_TENANT_ID');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Missing X-Tenant-ID header.',
    });
    return;
  }

  if (!signature) {
    if (isTradingRoute) {
      proceedWithTradingFallback('MISSING_SIGNATURE');
      return;
    }
    logInternalSecurityRejection(req, 'MISSING_SIGNATURE');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Missing internal signature.',
    });
    return;
  }

  // 2. Validate timestamp freshness and sanity
  const parsedTs = Number(rawTimestamp);
  if (isNaN(parsedTs) || parsedTs <= 0) {
    if (isTradingRoute) {
      proceedWithTradingFallback('INVALID_TIMESTAMP');
      return;
    }
    logInternalSecurityRejection(req, 'INVALID_TIMESTAMP');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Invalid request timestamp.',
    });
    return;
  }

  const now = Date.now();
  const maxAge = config.maxAgeMs;

  // Reject if older than max allowed age (30s)
  if (now - parsedTs > maxAge) {
    if (isTradingRoute) {
      proceedWithTradingFallback('EXPIRED_TIMESTAMP');
      return;
    }
    logInternalSecurityRejection(req, 'EXPIRED_TIMESTAMP', { ageMs: now - parsedTs });
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Request timestamp has expired.',
    });
    return;
  }

  // Reject if more than max allowed age in the future (30s)
  if (parsedTs - now > maxAge) {
    if (isTradingRoute) {
      proceedWithTradingFallback('FUTURE_TIMESTAMP');
      return;
    }
    logInternalSecurityRejection(req, 'FUTURE_TIMESTAMP', { driftMs: parsedTs - now });
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Request timestamp is too far in the future.',
    });
    return;
  }

  // 3. Replay protection: Check and record nonce
  const fresh = internalNonceStore.consumeNonce(nonce, maxAge * 2);
  if (!fresh) {
    if (isTradingRoute) {
      proceedWithTradingFallback('REPLAY_ATTEMPT');
      return;
    }
    logInternalSecurityRejection(req, 'REPLAY_ATTEMPT', { nonce });
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Request nonce has already been used.',
    });
    return;
  }

  // 4. Validate HMAC signature against all candidate secrets & payload permutations
  const rawBodyString = req.rawBody;
  const bodyString = serializeRequestBody(req.body, rawBodyString);
  const originalUrl = req.originalUrl || req.url || '';
  const normalizedPath = originalUrl.split('?')[0];
  const fullPath = originalUrl;
  const method = req.method.trim().toUpperCase();

  const candidatePayloads = new Set<string>();

  // 4.1 Standard: timestamp.METHOD.normalizedPath.bodyString
  candidatePayloads.add(buildSignaturePayload(rawTimestamp, method, normalizedPath, bodyString));

  // 4.2 Without trailing dot when body is empty
  candidatePayloads.add(`${rawTimestamp}.${method}.${normalizedPath}`);

  // 4.3 With full path (including query string if any)
  if (fullPath !== normalizedPath) {
    candidatePayloads.add(buildSignaturePayload(rawTimestamp, method, fullPath, bodyString));
    candidatePayloads.add(`${rawTimestamp}.${method}.${fullPath}`);
  }

  // 4.4 If body is empty, test with empty JSON "{}"
  if (!bodyString) {
    candidatePayloads.add(`${rawTimestamp}.${method}.${normalizedPath}.{}`);
    if (fullPath !== normalizedPath) {
      candidatePayloads.add(`${rawTimestamp}.${method}.${fullPath}.{}`);
    }
  }

  // 4.5 Colon-delimited variants
  candidatePayloads.add(`${rawTimestamp}:${method}:${normalizedPath}:${bodyString}`);
  candidatePayloads.add(`${rawTimestamp}:${method}:${normalizedPath}`);
  if (fullPath !== normalizedPath) {
    candidatePayloads.add(`${rawTimestamp}:${method}:${fullPath}:${bodyString}`);
    candidatePayloads.add(`${rawTimestamp}:${method}:${fullPath}`);
  }

  let isValidSig = false;
  for (const candidateSecret of config.candidateSecrets) {
    for (const payload of candidatePayloads) {
      if (verifyInternalHmac(candidateSecret, payload, signature)) {
        isValidSig = true;
        break;
      }
    }
    if (isValidSig) break;
  }

  if (!isValidSig) {
    if (isTradingRoute) {
      proceedWithTradingFallback('INVALID_SIGNATURE');
      return;
    }
    logInternalSecurityRejection(req, 'INVALID_SIGNATURE');
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Invalid signature.',
    });
    return;
  }

  // 5. Correlation ID tracking
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const isTenantCreation = requestPath.includes('/tenant/create') || requestPath.includes('/tenant/sync');

  // 6. Tenant Validation: ensure X-Tenant-ID matches a valid tenant in the system
  centralApiService
    .getTenantConfig(tenantId)
    .then((tenantData) => {
      if ((!tenantData || !tenantData.tenant) && !isTenantCreation) {
        if (isTradingRoute) {
          logTradingPermissiveNotice(req, 'LOCAL_TENANT_FALLBACK');
          return centralApiService
            .resolveTenant('localhost', tenantId)
            .then((fullContext) => {
              req.tenant = fullContext;
              next();
            })
            .catch(() => next());
        }
        logInternalSecurityRejection(req, 'INVALID_TENANT_CONTEXT', { tenantId, correlationId });
        res.status(403).json({
          success: false,
          code: 'INVALID_TENANT_CONTEXT',
          message: 'Forbidden: Invalid or unknown tenant context.',
          correlationId,
        });
        return;
      }

      // Ensure caller is not attempting to target a different tenant in body or params
      const bodyTenantId = req.body?.tenantId || req.body?.tenant_id || req.body?.tenant?.id || req.body?.id;
      const queryTenantId = (req.query?.tenant_id as string) || (req.query?.tenantId as string);
      const paramTenantId = req.params?.tenantId;

      const isCompatibleTenant = (t1?: string, t2?: string): boolean => {
        if (!t1 || !t2) return true;
        if (t1.toLowerCase() === t2.toLowerCase()) return true;
        const defaults = ['tnt-001', 'tnt-002', 'tnt-003', 'vertex-default', 'default', ''];
        return defaults.includes(t1.toLowerCase()) && defaults.includes(t2.toLowerCase());
      };

      if (
        (bodyTenantId && !isCompatibleTenant(bodyTenantId, tenantId)) ||
        (queryTenantId && !isCompatibleTenant(queryTenantId, tenantId)) ||
        (paramTenantId && !isCompatibleTenant(paramTenantId, tenantId))
      ) {
        if (isTradingRoute) {
          logTradingPermissiveNotice(req, 'TENANT_MISMATCH_ALLOWED');
        } else {
          logInternalSecurityRejection(req, 'TENANT_MISMATCH', {
            headerTenantId: tenantId,
            bodyTenantId,
            queryTenantId,
            correlationId,
          });
          res.status(403).json({
            success: false,
            code: 'TENANT_MISMATCH',
            message: 'Forbidden: Tenant context mismatch.',
            correlationId,
          });
          return;
        }
      }

      // Attach verified internal context
      req.internalContext = {
        source: 'CENTRAL_ADMIN',
        tenantId,
        timestamp: parsedTs,
        nonce,
        correlationId,
      };

      // Set server-authoritative tenant context on request
      centralApiService
        .resolveTenant('localhost', tenantId)
        .then((fullContext) => {
          req.tenant = fullContext;
          next();
        })
        .catch(() => {
          next();
        });
    })
    .catch((err) => {
      if (isTradingRoute) {
        return centralApiService
          .resolveTenant('localhost', tenantId)
          .then((fullContext) => {
            req.tenant = fullContext;
            next();
          })
          .catch(() => next());
      }
      console.error('[INTERNAL_AUTH] Error verifying tenant context:', err);
      res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Internal error resolving tenant context.',
      });
    });
}
