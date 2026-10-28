-- ==============================================================================
-- VERTEX Multi-Tenant Trading Platform - Rollback for Migration 009
-- Use this file to completely undo the indexes added in migration 009.
-- ==============================================================================

-- Drop added scale indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_users_lower_user_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_mobile;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_lower_email;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_tenant_role_created;

DROP INDEX CONCURRENTLY IF EXISTS idx_client_mappings_lower_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_cim_tenant_lower_tuser;
DROP INDEX CONCURRENTLY IF EXISTS idx_cim_tenant_lower_extid;
DROP INDEX CONCURRENTLY IF EXISTS idx_cim_tenant_lower_extcode;

DROP INDEX CONCURRENTLY IF EXISTS idx_trading_orders_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_trading_orders_tenant_user_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_trading_orders_tenant_status;

DROP INDEX CONCURRENTLY IF EXISTS idx_trading_trades_tenant_executed;
DROP INDEX CONCURRENTLY IF EXISTS idx_trading_trades_tenant_user_executed;

DROP INDEX CONCURRENTLY IF EXISTS idx_trading_positions_tenant_updated;
DROP INDEX CONCURRENTLY IF EXISTS idx_trading_positions_tenant_user_updated;

DROP INDEX CONCURRENTLY IF EXISTS idx_trading_wallets_lower_user;

DROP INDEX CONCURRENTLY IF EXISTS idx_fund_tx_tenant_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_fund_tx_tenant_user_created;

DROP INDEX CONCURRENTLY IF EXISTS idx_ledger_tenant_user_created;

DROP INDEX CONCURRENTLY IF EXISTS idx_trading_outbox_pending_created;

-- Restore dropped duplicate indexes if necessary
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_outbox_event_id ON trading_outbox(event_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_wallets_tenant_user ON trading_wallets(tenant_id, user_id);

-- Remove migration tracking entry
DELETE FROM trading_schema_migrations WHERE version = '009_scale_indexes_and_cleanup.sql';
