-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - Phase 5K Migration
-- Authoritative Client Mapping, Persistent Funds & Immutable Ledger
-- ==========================================================

-- 1. Client Identity Mapping (Admin Client <-> Trading User)
CREATE TABLE IF NOT EXISTS client_identity_mappings (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    trading_user_id VARCHAR(64) NOT NULL,
    external_client_id VARCHAR(128),
    external_client_code VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_client_mapping_tenant_user UNIQUE (tenant_id, trading_user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_mapping_tenant_external_id ON client_identity_mappings(tenant_id, external_client_id);
CREATE INDEX IF NOT EXISTS idx_client_mapping_tenant_external_code ON client_identity_mappings(tenant_id, external_client_code);

-- 2. Authoritative Persistent Fund Transactions (Deposits & Withdrawals)
CREATE TABLE IF NOT EXISTS trading_fund_transactions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL'
    amount NUMERIC(18, 4) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
    payment_method VARCHAR(50) DEFAULT 'BANK_TRANSFER',
    reference_id VARCHAR(128),
    approved_by VARCHAR(64),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_by VARCHAR(64),
    rejected_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fund_tx_tenant_user ON trading_fund_transactions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_fund_tx_tenant_status ON trading_fund_transactions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fund_tx_tenant_type ON trading_fund_transactions(tenant_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_fund_tx_created_at ON trading_fund_transactions(created_at);

-- 3. Immutable Financial Ledger
CREATE TABLE IF NOT EXISTS trading_ledger_entries (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    transaction_id VARCHAR(128) NOT NULL,
    type VARCHAR(10) NOT NULL, -- 'CREDIT', 'DEBIT'
    category VARCHAR(50) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL', 'TRADE_PNL', 'COMMISSION', 'FEE', 'ADMIN_ADJUSTMENT'
    amount NUMERIC(18, 4) NOT NULL,
    balance_before NUMERIC(18, 4) NOT NULL,
    balance_after NUMERIC(18, 4) NOT NULL,
    reference TEXT,
    created_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tenant_user ON trading_ledger_entries(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_category ON trading_ledger_entries(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_created_at ON trading_ledger_entries(tenant_id, created_at);

-- 4. Extend trading_trades with fees, commission, status, symbol, exchange if not present
ALTER TABLE trading_trades ADD COLUMN IF NOT EXISTS fees NUMERIC(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE trading_trades ADD COLUMN IF NOT EXISTS commission NUMERIC(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE trading_trades ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'EXECUTED';
ALTER TABLE trading_trades ADD COLUMN IF NOT EXISTS symbol VARCHAR(64);
ALTER TABLE trading_trades ADD COLUMN IF NOT EXISTS exchange VARCHAR(32) DEFAULT 'NSE';

-- 5. Extend trading_positions with symbol, exchange, status if not present
ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS symbol VARCHAR(64);
ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS exchange VARCHAR(32) DEFAULT 'NSE';
ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'OPEN';
