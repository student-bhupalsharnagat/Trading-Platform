-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - PostgreSQL Schema
-- Prepared for Central Admin Panel & Multi-Tenant Migration
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'vertex-default', 'apex-capital'
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    custom_domain VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'frozen', 'maintenance', 'suspended'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. Tenant Domains Table (Multi-domain mapping per tenant)
CREATE TABLE IF NOT EXISTS tenant_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL UNIQUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_domain ON tenant_domains(LOWER(domain));
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);

-- 3. Tenant Branding Table (White-label metadata)
CREATE TABLE IF NOT EXISTS tenant_branding (
    tenant_id VARCHAR(64) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    brand_name VARCHAR(120) NOT NULL,
    short_name VARCHAR(20) NOT NULL,
    logo_url TEXT,
    favicon_url TEXT,
    tagline VARCHAR(255) DEFAULT 'Institutional Multi-Asset Platform',
    primary_color VARCHAR(30) DEFAULT '#F59E0B',
    secondary_color VARCHAR(30) DEFAULT '#10B981',
    accent_color VARCHAR(30) DEFAULT '#3B82F6',
    background_color VARCHAR(30) DEFAULT '#060B13',
    surface_color VARCHAR(30) DEFAULT '#0B111C',
    login_branding JSONB NOT NULL DEFAULT '{"title": "Institutional Trading Desk", "subtitle": "Ultra-low latency execution across NSE, MCX, FOREX & Crypto", "badgeText": "Direct Market Access", "heroHighlight": "Professional Execution"}'::jsonb,
    header_branding JSONB NOT NULL DEFAULT '{"showTagline": true, "badgeText": "Live Market Feed"}'::jsonb,
    sidebar_branding JSONB NOT NULL DEFAULT '{"brandText": "Trading Platform"}'::jsonb,
    support_email VARCHAR(120) DEFAULT 'support@vertex-trading.com',
    support_phone VARCHAR(50) DEFAULT '+91 1800 234 5678',
    footer_links JSONB NOT NULL DEFAULT '{"termsUrl": "/terms", "privacyUrl": "/privacy", "riskDisclosureUrl": "/risk", "helpCenterUrl": "/help"}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Tenant Platform Configuration Table (Feature flags & limits)
CREATE TABLE IF NOT EXISTS tenant_platform_config (
    tenant_id VARCHAR(64) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    trading_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    api_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    support_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    deposit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    withdrawal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    options_trading_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    max_leverage NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_message TEXT DEFAULT 'Scheduled platform maintenance in progress. Orders are temporarily held.',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Tenant Security & Emergency Status Table
CREATE TABLE IF NOT EXISTS tenant_status (
    tenant_id VARCHAR(64) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    trading_killswitch_active BOOLEAN NOT NULL DEFAULT FALSE,
    registration_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    api_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_active BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Users Table (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default' REFERENCES tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    country_code VARCHAR(10) NOT NULL DEFAULT '+91',
    mobile VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'CLIENT', -- 'SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER', 'CLIENT'
    parent_id UUID REFERENCES users(id),
    hierarchy_path TEXT,
    company VARCHAR(100),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'demo', 'deactivated'
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE, -- Individual user freeze control
    referral_code VARCHAR(50),
    referred_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    demo_balance NUMERIC(15, 2) DEFAULT 200000.00,
    CONSTRAINT uq_tenant_user_id UNIQUE (tenant_id, user_id),
    CONSTRAINT uq_tenant_mobile UNIQUE (tenant_id, mobile)
);

-- Users Table Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_hierarchy ON users(hierarchy_path);

-- 7. OTP Verifications Table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default' REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'registration',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_tenant_user ON otp_verifications(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);

-- 8. Referral Codes Table
CREATE TABLE IF NOT EXISTS referral_codes (
    code VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default' REFERENCES tenants(id) ON DELETE CASCADE,
    owner_user_id VARCHAR(50),
    bonus_amount NUMERIC(10, 2) DEFAULT 500.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 9. Tenant-Scoped Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    type VARCHAR(10) NOT NULL, -- 'BUY', 'SELL'
    order_type VARCHAR(20) NOT NULL DEFAULT 'MARKET',
    product VARCHAR(20) NOT NULL DEFAULT 'INTRADAY',
    lots INTEGER NOT NULL,
    qty NUMERIC(15, 4) NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'EXECUTED',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_user ON orders(tenant_id, user_id);

-- 10. Seed Default Tenants
INSERT INTO tenants (id, name, slug, custom_domain, status)
VALUES 
    ('vertex-default', 'VERTEX Trading', 'vertex', 'localhost', 'active'),
    ('apex-capital', 'Apex Capital Markets', 'apex', 'apex.local', 'active'),
    ('zenith-fx', 'Zenith Global Markets', 'zenith', 'zenith.local', 'active')
ON CONFLICT (id) DO NOTHING;
