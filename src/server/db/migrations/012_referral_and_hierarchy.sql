-- Migration 012: B2B Referral Codes and Extended Hierarchy Columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_broker_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(10, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(UPPER(referral_code));
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(UPPER(referred_by));
CREATE INDEX IF NOT EXISTS idx_users_master_id ON users(master_id);
CREATE INDEX IF NOT EXISTS idx_users_broker_id ON users(broker_id);
CREATE INDEX IF NOT EXISTS idx_users_sub_broker_id ON users(sub_broker_id);

ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS referral_code VARCHAR(64);
ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS referred_by VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_client_mappings_referral ON client_mappings(UPPER(referral_code));
