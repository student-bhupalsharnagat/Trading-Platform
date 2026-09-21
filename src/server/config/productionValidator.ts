/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5I
 * Production Configuration & Secret Hardening Validator
 */

export interface ConfigValidationResult {
  isValid: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ProductionValidator {
  private static readonly INSECURE_DEV_SECRETS = new Set([
    'vertex_jwt_secret_dev_key_2026_super_secure',
    'default_jwt_secret_dev_only',
    'vertex-dev-secret-central-admin-hmac-2026-fallback-only',
    'default_secret',
    'secret',
    'password',
    'changeme',
  ]);

  /**
   * Validate configuration for production readiness.
   */
  public static validateConfig(env: NodeJS.ProcessEnv = process.env): ConfigValidationResult {
    const isProd = env.NODE_ENV === 'production';
    return this.validateEnv(isProd, env);
  }

  /**
   * Helper that explicitly accepts isProd and custom environment dictionary.
   */
  public static validateEnv(
    isProd = process.env.NODE_ENV === 'production',
    customEnv?: NodeJS.ProcessEnv
  ): ConfigValidationResult {
    const env = customEnv || { ...process.env, NODE_ENV: isProd ? 'production' : 'development' };
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. JWT_SECRET Validation
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      if (isProd) {
        errors.push('JWT_SECRET environment variable is missing in production.');
      } else {
        warnings.push('JWT_SECRET is unset; using development fallback secret.');
      }
    } else if (jwtSecret.length < 32) {
      if (isProd) {
        errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Production requires >= 32 chars.`);
      } else {
        warnings.push(`JWT_SECRET is short (${jwtSecret.length} chars). Recommended >= 32 chars.`);
      }
    } else if (this.INSECURE_DEV_SECRETS.has(jwtSecret.toLowerCase())) {
      if (isProd) {
        errors.push('JWT_SECRET is set to an insecure default placeholder.');
      } else {
        warnings.push('JWT_SECRET uses an insecure development placeholder.');
      }
    }

    // 2. INTERNAL_COMMUNICATION_SECRET Validation
    const internalSecret = env.INTERNAL_COMMUNICATION_SECRET;
    if (!internalSecret) {
      if (isProd) {
        errors.push('INTERNAL_COMMUNICATION_SECRET environment variable is missing in production.');
      } else {
        warnings.push('INTERNAL_COMMUNICATION_SECRET is unset; using development testing secret.');
      }
    } else if (internalSecret.length < 32) {
      if (isProd) {
        errors.push(`INTERNAL_COMMUNICATION_SECRET is too short (${internalSecret.length} chars). Production requires >= 32 chars.`);
      } else {
        warnings.push(`INTERNAL_COMMUNICATION_SECRET is short (${internalSecret.length} chars). Recommended >= 32 chars.`);
      }
    } else if (this.INSECURE_DEV_SECRETS.has(internalSecret.toLowerCase())) {
      if (isProd) {
        errors.push('INTERNAL_COMMUNICATION_SECRET is set to a known development fallback.');
      } else {
        warnings.push('INTERNAL_COMMUNICATION_SECRET uses an insecure development placeholder.');
      }
    }

    // 3. Database URL validation (if external postgres specified)
    const databaseUrl = env.DATABASE_URL;
    if (isProd && databaseUrl && databaseUrl.includes('localhost')) {
      warnings.push('DATABASE_URL points to localhost in production mode.');
    }

    // 4. Redis URL validation
    const redisUrl = env.REDIS_URL;
    if (isProd && redisUrl && !redisUrl.includes('@') && !redisUrl.includes('rediss://')) {
      warnings.push('REDIS_URL in production appears unauthenticated (no credentials in URI).');
    }

    // 5. Broker secrets check (must not be hardcoded default values)
    const brokerSecret = env.BROKER_SANDBOX_API_SECRET;
    if (brokerSecret && this.INSECURE_DEV_SECRETS.has(brokerSecret.toLowerCase())) {
      warnings.push('BROKER_SANDBOX_API_SECRET uses an insecure placeholder.');
    }

    // 6. S2S Base URLs check
    const centralAdminBaseUrl = env.CENTRAL_ADMIN_BASE_URL;
    if (isProd && !centralAdminBaseUrl) {
      warnings.push('CENTRAL_ADMIN_BASE_URL is unset in production. Defaulting to internal service discovery.');
    }
    const tradingPlatformBaseUrl = env.TRADING_PLATFORM_BASE_URL;
    if (isProd && !tradingPlatformBaseUrl) {
      warnings.push('TRADING_PLATFORM_BASE_URL is unset in production.');
    }

    // 7. CORS & WebSocket origins check
    const corsOrigins = env.CORS_ALLOWED_ORIGINS;
    if (isProd && corsOrigins === '*') {
      errors.push('CORS_ALLOWED_ORIGINS must not be wildcard (*) in production mode.');
    }

    return {
      isValid: errors.length === 0,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Return a completely sanitized summary of loaded configuration with secrets redacted.
   */
  public static getSanitizedConfigSummary(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const redact = (val?: string) => {
      if (!val) return '[UNSET]';
      if (val.length <= 6) return '***';
      return `${val.substring(0, 3)}...${val.substring(val.length - 3)} (${val.length} chars)`;
    };

    return {
      NODE_ENV: env.NODE_ENV || 'development',
      PORT: env.PORT || '3000',
      JWT_SECRET: redact(env.JWT_SECRET),
      INTERNAL_COMMUNICATION_SECRET: redact(env.INTERNAL_COMMUNICATION_SECRET),
      DATABASE_URL: env.DATABASE_URL ? '[CONFIGURED]' : '[PGlite Embedded]',
      REDIS_URL: env.REDIS_URL ? '[CONFIGURED]' : '[In-Memory Coordinator]',
      CENTRAL_ADMIN_BASE_URL: env.CENTRAL_ADMIN_BASE_URL || '[UNSET - Default Localhost]',
      TRADING_PLATFORM_BASE_URL: env.TRADING_PLATFORM_BASE_URL || '[UNSET - Default Localhost]',
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS || '[CONFIGURED DEFAULT]',
      WEBSOCKET_ALLOWED_ORIGINS: env.WEBSOCKET_ALLOWED_ORIGINS || '[CONFIGURED DEFAULT]',
      BROKER_SANDBOX_API_KEY: redact(env.BROKER_SANDBOX_API_KEY),
      BROKER_SANDBOX_API_SECRET: redact(env.BROKER_SANDBOX_API_SECRET),
      BROKER_WEBHOOK_SECRET: redact(env.BROKER_WEBHOOK_SECRET),
      SMTP_HOST: env.SMTP_HOST || '[UNSET - Dev Log Delivery]',
    };
  }
}
