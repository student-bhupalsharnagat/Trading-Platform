-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - Phase 5F Schema
-- Transactional Outbox for Asynchronous Dispatch & Resilience
-- ==========================================================

CREATE TABLE IF NOT EXISTS trading_outbox (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(128) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_trading_outbox_pending ON trading_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_trading_outbox_tenant ON trading_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trading_outbox_event_id ON trading_outbox(event_id);
CREATE INDEX IF NOT EXISTS idx_trading_outbox_created_at ON trading_outbox(created_at);
