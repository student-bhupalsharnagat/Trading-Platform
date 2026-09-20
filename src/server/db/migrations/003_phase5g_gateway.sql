-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - Phase 5G Schema
-- Broker/Exchange Gateway, Provider Configs & Execution Audits
-- ==========================================================

-- 1. Tenant-scoped Provider Configurations
CREATE TABLE IF NOT EXISTS provider_configs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) NOT NULL,
    provider_type VARCHAR(32) NOT NULL DEFAULT 'BROKER', -- 'BROKER', 'MARKET_DATA', 'EXCHANGE'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    environment VARCHAR(32) NOT NULL DEFAULT 'SANDBOX', -- 'SANDBOX', 'SIMULATION', 'PRODUCTION'
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_tenant_provider UNIQUE (tenant_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant ON provider_configs(tenant_id);

-- 2. Provider Credentials Metadata (Secrets remain exclusively in env/secure store)
CREATE TABLE IF NOT EXISTS provider_credentials_metadata (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) NOT NULL,
    key_identifier VARCHAR(128) NOT NULL, -- Masked / public identifier e.g. "key_prod_***492"
    auth_scheme VARCHAR(32) NOT NULL DEFAULT 'API_KEY', -- 'API_KEY', 'HMAC_SECRET', 'OAUTH2'
    secret_env_var VARCHAR(128), -- Name of server-side env variable holding actual secret
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    last_validated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cred_meta_tenant_provider UNIQUE (tenant_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_cred_meta_tenant ON provider_credentials_metadata(tenant_id);

-- 3. Execution Request & Provider Response Audits (Completely sanitized, zero secrets)
CREATE TABLE IF NOT EXISTS provider_execution_audits (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64),
    broker_order_id VARCHAR(128),
    provider_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL, -- 'PLACE_ORDER', 'CANCEL_ORDER', 'MODIFY_ORDER', 'GET_STATUS'
    execution_status VARCHAR(32) NOT NULL, -- 'SUCCESS', 'FAILED', 'TIMEOUT', 'REJECTED', 'CIRCUIT_OPEN'
    request_payload JSONB NOT NULL DEFAULT '{}',
    response_payload JSONB NOT NULL DEFAULT '{}',
    latency_ms NUMERIC(10, 2) NOT NULL DEFAULT 0,
    error_code VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_audits_tenant_created ON provider_execution_audits(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exec_audits_order_id ON provider_execution_audits(order_id);
CREATE INDEX IF NOT EXISTS idx_exec_audits_correlation_id ON provider_execution_audits(correlation_id);

-- 4. Extensibility columns on trading_orders
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS broker_order_id VARCHAR(128);
ALTER TABLE trading_orders ADD COLUMN IF NOT EXISTS normalized_status VARCHAR(30);
