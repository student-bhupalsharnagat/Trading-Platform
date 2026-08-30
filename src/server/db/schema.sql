-- ==========================================================
-- VERTEX Trading Platform - PostgreSQL Database Schema
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    user_id VARCHAR(20) NOT NULL UNIQUE,
    country_code VARCHAR(10) NOT NULL DEFAULT '+91',
    mobile VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'demo'
    referral_code VARCHAR(50),
    referred_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Users Table Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_id ON users(LOWER(user_id));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 2. OTP Verifications Table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(50) NOT NULL, -- references users.user_id or mobile
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'registration', -- 'registration', 'login', 'password_reset'
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- OTP Table Indexes
CREATE INDEX IF NOT EXISTS idx_otp_user_id ON otp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);

-- 3. Referral Codes Table
CREATE TABLE IF NOT EXISTS referral_codes (
    code VARCHAR(50) PRIMARY KEY,
    owner_user_id VARCHAR(50),
    bonus_amount NUMERIC(10, 2) DEFAULT 500.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert default promo referral codes
INSERT INTO referral_codes (code, owner_user_id, bonus_amount, is_active)
VALUES 
    ('VERTEXPRO', 'system', 1000.00, TRUE),
    ('ALPHA2026', 'system', 500.00, TRUE),
    ('TRADER99', 'system', 250.00, TRUE)
ON CONFLICT (code) DO NOTHING;
