/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Normalized Broker & Execution Gateway Errors
 */

export class BrokerError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly correlationId?: string;

  constructor(message: string, code = 'BROKER_ERROR', statusCode = 502, isRetryable = false, correlationId?: string) {
    super(message);
    this.name = 'BrokerError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.correlationId = correlationId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BrokerTimeoutError extends BrokerError {
  constructor(message = 'Broker provider request timed out.', correlationId?: string) {
    super(message, 'BROKER_TIMEOUT', 504, true, correlationId);
    this.name = 'BrokerTimeoutError';
  }
}

export class BrokerRejectedError extends BrokerError {
  constructor(message: string, correlationId?: string) {
    super(message, 'BROKER_ORDER_REJECTED', 400, false, correlationId);
    this.name = 'BrokerRejectedError';
  }
}

export class BrokerNetworkError extends BrokerError {
  constructor(message = 'Failed to connect to broker/exchange network.', correlationId?: string) {
    super(message, 'BROKER_NETWORK_ERROR', 503, true, correlationId);
    this.name = 'BrokerNetworkError';
  }
}

export class BrokerRateLimitError extends BrokerError {
  constructor(message = 'Broker API rate limit exceeded.', correlationId?: string) {
    super(message, 'BROKER_RATE_LIMIT_EXCEEDED', 429, true, correlationId);
    this.name = 'BrokerRateLimitError';
  }
}

export class BrokerCircuitOpenError extends BrokerError {
  constructor(message = 'Broker execution circuit breaker is OPEN. Orders temporarily blocked.', correlationId?: string) {
    super(message, 'BROKER_CIRCUIT_OPEN', 503, false, correlationId);
    this.name = 'BrokerCircuitOpenError';
  }
}

export class BrokerAuthError extends BrokerError {
  constructor(message = 'Broker authentication failed or credentials invalid.', correlationId?: string) {
    super(message, 'BROKER_AUTH_ERROR', 401, false, correlationId);
    this.name = 'BrokerAuthError';
  }
}

export class BrokerSecurityError extends BrokerError {
  constructor(message = 'Broker security violation: action prohibited.', correlationId?: string) {
    super(message, 'BROKER_SECURITY_VIOLATION', 403, false, correlationId);
    this.name = 'BrokerSecurityError';
  }
}

export function normalizeBrokerError(err: any, correlationId?: string): BrokerError {
  if (err instanceof BrokerError) {
    return err;
  }

  const msg = err?.message || 'Unknown broker execution failure.';
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new BrokerTimeoutError(msg, correlationId);
  }
  if (lower.includes('circuit') && lower.includes('open')) {
    return new BrokerCircuitOpenError(msg, correlationId);
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return new BrokerRateLimitError(msg, correlationId);
  }
  if (lower.includes('unauthorized') || lower.includes('auth') || lower.includes('credential')) {
    return new BrokerAuthError('Broker authentication failed.', correlationId);
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return new BrokerNetworkError(msg, correlationId);
  }
  if (lower.includes('reject') || lower.includes('invalid price') || lower.includes('lot')) {
    return new BrokerRejectedError(msg, correlationId);
  }

  return new BrokerError(msg, 'BROKER_ERROR', 502, false, correlationId);
}
