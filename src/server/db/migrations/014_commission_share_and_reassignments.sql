-- Migration 014: Ensure commission_share and hierarchy reassignment columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_share NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_broker_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_master_id_014 ON users(master_id);
CREATE INDEX IF NOT EXISTS idx_users_broker_id_014 ON users(broker_id);
CREATE INDEX IF NOT EXISTS idx_users_sub_broker_id_014 ON users(sub_broker_id);

ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS commission_share NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS master_id VARCHAR(64);
ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
ALTER TABLE client_mappings ADD COLUMN IF NOT EXISTS sub_broker_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_client_mappings_master_id ON client_mappings(master_id);
CREATE INDEX IF NOT EXISTS idx_client_mappings_broker_id ON client_mappings(broker_id);
CREATE INDEX IF NOT EXISTS idx_client_mappings_sub_broker_id ON client_mappings(sub_broker_id);

ALTER TABLE trading_platform_accounts ADD COLUMN IF NOT EXISTS commission_share NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE trading_platform_accounts ADD COLUMN IF NOT EXISTS master_id VARCHAR(64);
ALTER TABLE trading_platform_accounts ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
ALTER TABLE trading_platform_accounts ADD COLUMN IF NOT EXISTS sub_broker_id VARCHAR(64);
