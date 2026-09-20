-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - Phase 5J-A Migration
-- Authoritative PostgreSQL Tenant Config & Emergency Persistence
-- ==========================================================

CREATE TABLE IF NOT EXISTS tenant_configs (
    tenant_id VARCHAR(64) PRIMARY KEY,
    brand_name VARCHAR(128),
    short_name VARCHAR(64),
    logo_url TEXT,
    favicon_url TEXT,
    primary_color VARCHAR(32),
    secondary_color VARCHAR(32),
    accent_color VARCHAR(32),
    support_email VARCHAR(128),
    support_phone VARCHAR(64),
    legal_links JSONB DEFAULT '{}'::jsonb,
    domain_config JSONB DEFAULT '{}'::jsonb,
    feature_flags JSONB DEFAULT '{}'::jsonb,
    trading_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    api_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    support_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_leverage NUMERIC NOT NULL DEFAULT 50,
    config_version INT NOT NULL DEFAULT 1,
    branding_version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_emergency_status (
    tenant_id VARCHAR(64) PRIMARY KEY,
    tenant_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    trading_halted BOOLEAN NOT NULL DEFAULT FALSE,
    registration_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    api_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    killswitch_active BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_configs_updated_at ON tenant_configs(updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_emergency_status_updated_at ON tenant_emergency_status(updated_at);
