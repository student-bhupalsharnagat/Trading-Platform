/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Provider-Level Circuit Breaker
 * Protects downstream broker endpoints and fast-fails upstream requests when provider is unhealthy.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before OPEN
  cooldownMs: number;       // time to stay OPEN before HALF_OPEN probe
  halfOpenTrialLimit: number; // successful probes in HALF_OPEN before CLOSED
}

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

export class ProviderCircuitBreaker {
  private circuits = new Map<string, CircuitEntry>();
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      cooldownMs: config?.cooldownMs ?? 3000,
      halfOpenTrialLimit: config?.halfOpenTrialLimit ?? 2,
    };
  }

  private getKey(tenantId: string, providerId: string): string {
    return `${tenantId}:${providerId}`;
  }

  private getEntry(tenantId: string, providerId: string): CircuitEntry {
    const key = this.getKey(tenantId, providerId);
    let entry = this.circuits.get(key);
    if (!entry) {
      entry = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastStateChange: Date.now(),
      };
      this.circuits.set(key, entry);
    }
    return entry;
  }

  public canExecute(tenantId: string, providerId: string): boolean {
    const entry = this.getEntry(tenantId, providerId);
    const now = Date.now();

    if (entry.state === 'CLOSED') {
      return true;
    }

    if (entry.state === 'OPEN') {
      if (now - entry.lastStateChange >= this.config.cooldownMs) {
        // Transition to HALF_OPEN to attempt trial probes
        entry.state = 'HALF_OPEN';
        entry.successCount = 0;
        entry.lastStateChange = now;
        return true;
      }
      return false; // Still within cooldown, fast-fail
    }

    if (entry.state === 'HALF_OPEN') {
      // In HALF_OPEN, allow limited trial calls
      return entry.successCount < this.config.halfOpenTrialLimit;
    }

    return true;
  }

  public recordSuccess(tenantId: string, providerId: string): void {
    const entry = this.getEntry(tenantId, providerId);

    if (entry.state === 'HALF_OPEN') {
      entry.successCount++;
      if (entry.successCount >= this.config.halfOpenTrialLimit) {
        // Recovery confirmed, close circuit
        entry.state = 'CLOSED';
        entry.failureCount = 0;
        entry.successCount = 0;
        entry.lastStateChange = Date.now();
      }
    } else if (entry.state === 'CLOSED') {
      entry.failureCount = 0;
    }
  }

  public recordFailure(tenantId: string, providerId: string): void {
    const entry = this.getEntry(tenantId, providerId);
    const now = Date.now();
    entry.lastFailureTime = now;

    if (entry.state === 'HALF_OPEN') {
      // Any failure during trial immediately trips back to OPEN
      entry.state = 'OPEN';
      entry.failureCount = this.config.failureThreshold;
      entry.successCount = 0;
      entry.lastStateChange = now;
      return;
    }

    if (entry.state === 'CLOSED') {
      entry.failureCount++;
      if (entry.failureCount >= this.config.failureThreshold) {
        entry.state = 'OPEN';
        entry.lastStateChange = now;
      }
    }
  }

  public trip(tenantId: string, providerId: string): void {
    const entry = this.getEntry(tenantId, providerId);
    entry.state = 'OPEN';
    entry.failureCount = this.config.failureThreshold;
    entry.lastStateChange = Date.now();
    entry.lastFailureTime = Date.now();
  }

  public reset(tenantId: string, providerId: string): void {
    const entry = this.getEntry(tenantId, providerId);
    entry.state = 'CLOSED';
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.lastStateChange = Date.now();
  }

  public getState(tenantId: string, providerId: string): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    const entry = this.getEntry(tenantId, providerId);
    return {
      state: entry.state,
      failureCount: entry.failureCount,
      lastFailureTime: entry.lastFailureTime,
    };
  }

  public clearAll(): void {
    this.circuits.clear();
  }
}

export const providerCircuitBreaker = new ProviderCircuitBreaker();
