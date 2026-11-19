-- Migration 013: Ensure broker_id exists on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_users_broker_id ON users(broker_id);
