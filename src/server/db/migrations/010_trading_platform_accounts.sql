-- Migration 010: Persistent Trading Platform Accounts and Credentials Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_code VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64) DEFAULT 'BRK-001';
CREATE INDEX IF NOT EXISTS idx_users_client_code ON users(client_code);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);

CREATE TABLE IF NOT EXISTS trading_platform_accounts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    client_code VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(64),
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(32) NOT NULL DEFAULT 'CLIENT',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default',
    broker_id VARCHAR(64) DEFAULT 'BRK-001',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tpa_tenant_user_id UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tpa_user_id ON trading_platform_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tpa_email ON trading_platform_accounts(email);
CREATE INDEX IF NOT EXISTS idx_tpa_phone ON trading_platform_accounts(phone);
CREATE INDEX IF NOT EXISTS idx_tpa_client_code ON trading_platform_accounts(client_code);
CREATE INDEX IF NOT EXISTS idx_tpa_tenant_id ON trading_platform_accounts(tenant_id);
