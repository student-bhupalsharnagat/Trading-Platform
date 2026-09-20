/**
 * Lightweight Circuit Breaker for Central Admin Webhook Delivery
 *
 * States:
 * - CLOSED: Normal operations, calls flow through.
 * - OPEN: Failing threshold exceeded, calls fail-fast to prevent resource exhaustion.
 * - HALF_OPEN: Trial period testing if remote service has recovered.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private failureThreshold: number;
  private resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 5000;
  }

  public getState(): CircuitState {
    const now = Date.now();
    if (
      this.state === 'OPEN' &&
      this.lastFailureTime !== null &&
      now - this.lastFailureTime >= this.resetTimeoutMs
    ) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  public canExecute(): boolean {
    const currentState = this.getState();
    return currentState === 'CLOSED' || currentState === 'HALF_OPEN';
  }

  public recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;
    if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
      this.state = 'CLOSED';
    }
  }

  public recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.consecutiveFailures += 1;

    if (this.state === 'HALF_OPEN') {
      // Recovery attempt failed, back to OPEN
      this.state = 'OPEN';
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public forceState(state: CircuitState): void {
    this.state = state;
    if (state === 'OPEN') {
      this.lastFailureTime = Date.now();
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  public getMetrics(): {
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
  } {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }
}
