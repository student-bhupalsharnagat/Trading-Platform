-- Migration 007: PostgreSQL Users and Client Mappings Persistence

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default',
    full_name VARCHAR(100) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    country_code VARCHAR(10) NOT NULL DEFAULT '+91',
    mobile VARCHAR(30) NOT NULL,
    email VARCHAR(120),
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(30) NOT NULL DEFAULT 'CLIENT',
    parent_id VARCHAR(64),
    hierarchy_path TEXT,
    company VARCHAR(100),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    account_type VARCHAR(20) NOT NULL DEFAULT 'real',
    demo_balance NUMERIC(15, 2) DEFAULT 1000000.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_users_tenant_user_id UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);

CREATE TABLE IF NOT EXISTS client_mappings (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default',
    client_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    master_id VARCHAR(64),
    broker_id VARCHAR(64),
    sub_broker_id VARCHAR(64),
    parent_id VARCHAR(64),
    hierarchy_path TEXT,
    account_type VARCHAR(20) NOT NULL DEFAULT 'real',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_client_mappings_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_mappings_tenant ON client_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_mappings_account_type ON client_mappings(account_type);
