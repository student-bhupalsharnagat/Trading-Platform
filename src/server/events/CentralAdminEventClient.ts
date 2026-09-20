/**
 * Outbound Client for delivering events to Central Admin via HMAC Webhooks.
 *
 * Requirements:
 * - Uses Phase 5B HMAC authentication headers:
 *   X-Internal-Timestamp, X-Internal-Nonce, X-Internal-Signature, X-Tenant-ID
 * - Strict timeout (default 3000ms) with AbortController
 * - Never leaks secrets or private credentials
 * - Never uses browser JWT
 */

import { getInternalAuthConfig } from '../config/internalConfig.ts';
import { generateInternalHeaders } from '../auth/internalAuth.ts';
import { InternalEvent } from './types.ts';

export interface CentralAdminEventClientOptions {
  baseUrl?: string;
  endpointUrl?: string;
  secret?: string;
  hmacSecret?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  data?: any;
  error?: string;
  code?: string;
  retriesAttempted?: number;
}

export class CentralAdminEventClient {
  private baseUrl: string;
  private secret: string;
  private timeoutMs: number;
  private maxRetries: number;
  private baseRetryDelayMs: number;

  constructor(options: CentralAdminEventClientOptions = {}) {
    const config = getInternalAuthConfig();
    this.baseUrl =
      options.baseUrl ||
      options.endpointUrl ||
      process.env.CENTRAL_ADMIN_BASE_URL ||
      config.tradingPlatformBaseUrl ||
      'http://localhost:3000';
    this.secret = options.secret || options.hmacSecret || config.internalCommunicationSecret;
    this.timeoutMs = options.timeoutMs ?? (process.env.INTERNAL_REQUEST_TIMEOUT_MS ? parseInt(process.env.INTERNAL_REQUEST_TIMEOUT_MS, 10) : 3000);
    this.maxRetries = options.maxRetries ?? 2;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 100;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  public setSecret(secret: string): void {
    this.secret = secret;
  }

  public setTimeoutMs(ms: number): void {
    this.timeoutMs = ms;
  }

  public setMaxRetries(retries: number): void {
    this.maxRetries = retries;
  }

  /**
   * Resolves the target endpoint path for a given event type.
   */
  public getEndpointPath(eventType: string): string {
    switch (eventType) {
      case 'trade.executed':
        return '/api/internal/v1/events/trade-executed';
      case 'risk.margin_breach':
        return '/api/internal/v1/events/margin-breach';
      case 'execution.failure':
        return '/api/internal/v1/events/execution-failure';
      case 'emergency.control_activated':
        return '/api/internal/v1/events/emergency-control';
      case 'reconciliation.mismatch':
        return '/api/internal/v1/events/reconciliation-mismatch';
      default:
        return `/api/internal/v1/events/${eventType.replace(/[\._]/g, '-')}`;
    }
  }

  /**
   * Sends an authenticated internal event to Central Admin.
   * Uses exponential backoff retry for idempotent webhook events.
   */
  public async sendEvent(event: InternalEvent, retryCount = 0): Promise<WebhookDeliveryResult> {
    const path = this.getEndpointPath(event.eventType);
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const method = 'POST';

    const headers = generateInternalHeaders({
      secret: this.secret,
      tenantId: event.tenantId,
      method,
      path,
      body: event,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          data,
          retriesAttempted: retryCount,
        };
      }

      // If server error (5xx) and we have retries remaining, retry with exponential backoff
      if (response.status >= 500 && retryCount < this.maxRetries) {
        const backoffMs = Math.min(this.baseRetryDelayMs * Math.pow(2, retryCount), 1000);
        await new Promise((res) => setTimeout(res, backoffMs));
        return this.sendEvent(event, retryCount + 1);
      }

      return {
        success: false,
        statusCode: response.status,
        data,
        error: data?.error || data?.message || `Webhook rejected with status ${response.status}`,
        code: data?.code || 'WEBHOOK_REJECTED',
        retriesAttempted: retryCount,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';

      // If network or timeout error and we have retries remaining, retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const backoffMs = Math.min(this.baseRetryDelayMs * Math.pow(2, retryCount), 1000);
        await new Promise((res) => setTimeout(res, backoffMs));
        return this.sendEvent(event, retryCount + 1);
      }

      return {
        success: false,
        statusCode: isTimeout ? 408 : 503,
        error: isTimeout
          ? `Webhook timed out after ${this.timeoutMs}ms`
          : (err.message || 'Webhook connection error'),
        code: isTimeout ? 'TIMEOUT' : 'CONNECTION_ERROR',
        retriesAttempted: retryCount,
      };
    }
  }
}

export const centralAdminEventClient = new CentralAdminEventClient();
