-- ==============================================================================
-- VERTEX PHASE 5H: Broker Webhook Events and State Reconciliation Audits
-- ==============================================================================

CREATE TABLE IF NOT EXISTS broker_webhook_events (
    id VARCHAR(128) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    broker_order_id VARCHAR(128),
    client_order_id VARCHAR(128),
    normalized_status VARCHAR(64),
    raw_payload TEXT NOT NULL,
    signature VARCHAR(256),
    processed_successfully BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bkr_wh_tenant_event ON broker_webhook_events (tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_bkr_wh_broker_order ON broker_webhook_events (tenant_id, broker_order_id);

CREATE TABLE IF NOT EXISTS broker_reconciliation_audits (
    id VARCHAR(128) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) NOT NULL,
    reconciliation_type VARCHAR(32) NOT NULL DEFAULT 'FULL',
    mismatches_detected INT NOT NULL DEFAULT 0,
    mismatches JSONB NOT NULL DEFAULT '{"orders":[], "positions":[]}',
    actions_taken JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    execution_duration_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bkr_recon_tenant ON broker_reconciliation_audits (tenant_id, created_at DESC);
