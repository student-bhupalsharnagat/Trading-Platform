-- ==========================================================
-- VERTEX Manual Deposit & Admin Approval Schema
-- Bank Transfer & QR Code Verification with UTR Tracking
-- ==========================================================

-- 1. manual_deposit_requests
CREATE TABLE IF NOT EXISTS manual_deposit_requests (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default',
    user_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(128),
    user_mobile VARCHAR(30),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    utr_number VARCHAR(128) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
    proof_image_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    approved_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_manual_deposit_utr UNIQUE (utr_number)
);

CREATE INDEX IF NOT EXISTS idx_manual_deposit_tenant ON manual_deposit_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_manual_deposit_user ON manual_deposit_requests(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_manual_deposit_status ON manual_deposit_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_manual_deposit_created_at ON manual_deposit_requests(created_at DESC);

-- 2. payment_settings (Admin-configured Bank Details & QR Code)
CREATE TABLE IF NOT EXISTS payment_settings (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'vertex-default',
    bank_name VARCHAR(128) NOT NULL DEFAULT 'HDFC Bank Ltd',
    account_name VARCHAR(128) NOT NULL DEFAULT 'VERTEX TRADING TECHNOLOGIES PVT LTD',
    account_number VARCHAR(64) NOT NULL DEFAULT '50200084729103',
    ifsc_code VARCHAR(32) NOT NULL DEFAULT 'HDFC0001234',
    upi_id VARCHAR(128) NOT NULL DEFAULT 'vertextrading@hdfcbank',
    qr_code_url TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed default settings row if not present
INSERT INTO payment_settings (id, tenant_id, bank_name, account_name, account_number, ifsc_code, upi_id, qr_code_url, updated_at)
VALUES (
    'default',
    'vertex-default',
    'HDFC Bank Ltd',
    'VERTEX TRADING TECHNOLOGIES PVT LTD',
    '50200084729103',
    'HDFC0001234',
    'vertextrading@hdfcbank',
    '',
    NOW()
)
ON CONFLICT (id) DO NOTHING;
