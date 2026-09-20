-- Add normalized_status column if not present
ALTER TABLE broker_webhook_events ADD COLUMN IF NOT EXISTS normalized_status VARCHAR(64);
