/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Tenant-Scoped Provider Configuration & Credential Metadata Service
 * Strictly prevents credential leaks: actual secrets reside ONLY in server-side environment variables.
 */

import { pgDb } from '../../db/postgres.ts';
import { ProviderContext } from '../types.ts';

export interface ProviderConfigRecord {
  id: string;
  tenantId: string;
  providerId: string;
  providerType: 'BROKER' | 'MARKET_DATA' | 'EXCHANGE';
  isActive: boolean;
  isDefault: boolean;
  environment: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
  settings: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCredentialMeta {
  id: string;
  tenantId: string;
  providerId: string;
  keyIdentifier: string;
  authScheme: string;
  secretEnvVar?: string;
  status: string;
  lastValidatedAt?: string;
}

export class ProviderConfigService {
  // In-memory fallback / cache for high-throughput gateway routing
  private configCache = new Map<string, ProviderConfigRecord>();
  private credMetaCache = new Map<string, ProviderCredentialMeta>();

  private getCacheKey(tenantId: string, providerId: string): string {
    return `${tenantId}:${providerId}`;
  }

  public normalizeProviderId(providerId?: string): string {
    if (!providerId) return 'mock-broker';
    const p = providerId.trim().toUpperCase();
    if (p === 'REAL_SANDBOX' || p === 'SANDBOX' || p === 'ALPACA_SANDBOX' || p === 'REAL-SANDBOX') {
      return 'real-sandbox';
    }
    if (p === 'MOCK' || p === 'SIMULATION' || p === 'MOCK-BROKER' || p === 'MOCK_BROKER') {
      return 'mock-broker';
    }
    return providerId;
  }

  public async getProviderConfig(tenantId: string, providerId?: string): Promise<ProviderContext> {
    const rawTarget = providerId || 'mock-broker';
    const targetProviderId = this.normalizeProviderId(rawTarget);
    const cacheKey = this.getCacheKey(tenantId, targetProviderId);

    let config = this.configCache.get(cacheKey);

    if (!config) {
      try {
        const res = await pgDb.query(
          `SELECT id, tenant_id AS "tenantId", provider_id AS "providerId", provider_type AS "providerType",
                  is_active AS "isActive", is_default AS "isDefault", environment, settings,
                  created_at AS "createdAt", updated_at AS "updatedAt"
           FROM provider_configs 
           WHERE tenant_id = $1 AND (provider_id = $2 OR provider_id = $3 OR is_default = TRUE)
           ORDER BY is_default DESC LIMIT 1`,
          [tenantId, targetProviderId, rawTarget]
        );

        if (res && res.rows.length > 0) {
          config = res.rows[0];
          this.configCache.set(cacheKey, config!);
        }
      } catch {
        // Fallback to default simulation config
      }
    }

    let resolvedProviderId = config?.providerId ? this.normalizeProviderId(config.providerId) : targetProviderId;
    const environment = config?.environment || (resolvedProviderId === 'real-sandbox' ? 'SANDBOX' : 'SIMULATION');
    const settings = config?.settings || { timeoutMs: 5000, maxRetries: 3 };

    // Resolve server-side credentials without exposing secrets
    const credMeta = await this.getCredentialsMetadata(tenantId, resolvedProviderId) ||
                     await this.getCredentialsMetadata(tenantId, rawTarget);
    let resolvedSecret: string | undefined;

    if (credMeta?.secretEnvVar) {
      resolvedSecret = process.env[credMeta.secretEnvVar];
    } else if (resolvedProviderId === 'real-sandbox') {
      resolvedSecret = process.env.BROKER_SANDBOX_API_SECRET;
    }

    // Fallback to MockBrokerAdapter in development if requested or if credentials unconfigured
    if (
      resolvedProviderId === 'real-sandbox' &&
      settings.allowMockFallback &&
      !resolvedSecret &&
      !process.env.BROKER_SANDBOX_API_KEY
    ) {
      resolvedProviderId = 'mock-broker';
    }

    return {
      tenantId,
      providerId: resolvedProviderId,
      environment,
      settings,
      credentials: credMeta
        ? {
            keyIdentifier: credMeta.keyIdentifier,
            authScheme: credMeta.authScheme,
            secret: resolvedSecret,
          }
        : (process.env.BROKER_SANDBOX_API_KEY ? {
            keyIdentifier: process.env.BROKER_SANDBOX_API_KEY,
            authScheme: 'API_KEY',
            secret: process.env.BROKER_SANDBOX_API_SECRET,
          } : undefined),
    };
  }

  public async setProviderConfig(
    tenantId: string,
    providerId: string,
    params: {
      providerType?: 'BROKER' | 'MARKET_DATA' | 'EXCHANGE';
      environment?: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
      settings?: Record<string, any>;
      isActive?: boolean;
      isDefault?: boolean;
    }
  ): Promise<ProviderConfigRecord> {
    const id = `pcfg-${tenantId}-${providerId}`;
    const providerType = params.providerType || 'BROKER';
    const environment = params.environment || 'SANDBOX';
    const settings = params.settings || {};
    const isActive = params.isActive !== undefined ? params.isActive : true;
    const isDefault = params.isDefault !== undefined ? params.isDefault : false;
    const now = new Date().toISOString();

    const record: ProviderConfigRecord = {
      id,
      tenantId,
      providerId,
      providerType,
      isActive,
      isDefault,
      environment,
      settings,
      createdAt: now,
      updatedAt: now,
    };

    this.configCache.set(this.getCacheKey(tenantId, providerId), record);

    try {
      await pgDb.query(
        `INSERT INTO provider_configs (id, tenant_id, provider_id, provider_type, is_active, is_default, environment, settings, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (tenant_id, provider_id) DO UPDATE SET
           provider_type = EXCLUDED.provider_type,
           is_active = EXCLUDED.is_active,
           is_default = EXCLUDED.is_default,
           environment = EXCLUDED.environment,
           settings = EXCLUDED.settings,
           updated_at = NOW()`,
        [id, tenantId, providerId, providerType, isActive, isDefault, environment, JSON.stringify(settings)]
      );
    } catch (err: any) {
      console.warn('[ProviderConfig] DB save warning:', err.message);
    }

    return record;
  }

  public async setCredentialsMetadata(
    tenantId: string,
    providerId: string,
    params: {
      keyIdentifier: string; // e.g., "key_sandbox_***992"
      authScheme?: string;
      secretEnvVar?: string; // e.g., "BROKER_SECRET_VERTEX"
      status?: string;
    }
  ): Promise<ProviderCredentialMeta> {
    const id = `pcred-${tenantId}-${providerId}`;
    const authScheme = params.authScheme || 'API_KEY';
    const status = params.status || 'ACTIVE';

    const meta: ProviderCredentialMeta = {
      id,
      tenantId,
      providerId,
      keyIdentifier: params.keyIdentifier,
      authScheme,
      secretEnvVar: params.secretEnvVar,
      status,
      lastValidatedAt: new Date().toISOString(),
    };

    this.credMetaCache.set(this.getCacheKey(tenantId, providerId), meta);

    try {
      await pgDb.query(
        `INSERT INTO provider_credentials_metadata (id, tenant_id, provider_id, key_identifier, auth_scheme, secret_env_var, status, last_validated_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (tenant_id, provider_id) DO UPDATE SET
           key_identifier = EXCLUDED.key_identifier,
           auth_scheme = EXCLUDED.auth_scheme,
           secret_env_var = EXCLUDED.secret_env_var,
           status = EXCLUDED.status,
           last_validated_at = NOW(),
           updated_at = NOW()`,
        [id, tenantId, providerId, params.keyIdentifier, authScheme, params.secretEnvVar || null, status]
      );
    } catch (err: any) {
      console.warn('[ProviderCred] DB save warning:', err.message);
    }

    return meta;
  }

  public async getCredentialsMetadata(tenantId: string, providerId: string): Promise<ProviderCredentialMeta | null> {
    const cacheKey = this.getCacheKey(tenantId, providerId);
    let meta = this.credMetaCache.get(cacheKey);

    if (!meta) {
      try {
        const res = await pgDb.query(
          `SELECT id, tenant_id AS "tenantId", provider_id AS "providerId", key_identifier AS "keyIdentifier",
                  auth_scheme AS "authScheme", secret_env_var AS "secretEnvVar", status, last_validated_at AS "lastValidatedAt"
           FROM provider_credentials_metadata 
           WHERE tenant_id = $1 AND provider_id = $2`,
          [tenantId, providerId]
        );
        if (res && res.rows.length > 0) {
          meta = res.rows[0];
          this.credMetaCache.set(cacheKey, meta!);
        }
      } catch {
        // Fallback
      }
    }

    return meta || null;
  }

  /**
   * Safe public endpoint serializer - strictly strips internal env vars and secret pointers
   */
  public sanitizeMetadataForClient(meta: ProviderCredentialMeta | null): {
    providerId: string;
    keyIdentifier: string;
    authScheme: string;
    status: string;
    hasConfiguredSecret: boolean;
  } | null {
    if (!meta) return null;
    return {
      providerId: meta.providerId,
      keyIdentifier: meta.keyIdentifier,
      authScheme: meta.authScheme,
      status: meta.status,
      hasConfiguredSecret: !!meta.secretEnvVar && !!process.env[meta.secretEnvVar],
    };
  }

  public clearCache(): void {
    this.configCache.clear();
    this.credMetaCache.clear();
  }
}

export const providerConfigService = new ProviderConfigService();
