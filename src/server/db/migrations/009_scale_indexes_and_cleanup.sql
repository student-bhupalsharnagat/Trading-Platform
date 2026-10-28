-- ==============================================================================
-- VERTEX Multi-Tenant Trading Platform - Migration 009
-- High-Scale Indexing & Write Overhead Optimization
--
-- STRICT ZERO-REGRESSION RULES:
-- 1. Uses CREATE INDEX CONCURRENTLY to prevent blocking live trading & inserts.
-- 2. Targets columns strictly used in WHERE, JOIN, and ORDER BY across main screens.
-- 3. Drops redundant duplicate indexes to eliminate wasted write I/O.
-- ==============================================================================

-- 1. Users & Authentication Lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_lower_user_id ON users (LOWER(user_id));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_mobile ON users (mobile);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_role_created ON users (tenant_id, role, created_at DESC);

-- 2. Client Mapping Lateral Joins & Identity Resolution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_mappings_lower_user ON client_mappings (LOWER(user_id));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cim_tenant_lower_tuser ON client_identity_mappings (tenant_id, LOWER(trading_user_id));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cim_tenant_lower_extid ON client_identity_mappings (tenant_id, LOWER(external_client_id));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cim_tenant_lower_extcode ON client_identity_mappings (tenant_id, LOWER(external_client_code));

-- 3. Trading Orders (Tenant filtering, user order history, reconciliation status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_orders_tenant_created ON trading_orders (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_orders_tenant_user_created ON trading_orders (tenant_id, user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_orders_tenant_status ON trading_orders (tenant_id, status);

-- 4. Trading Trades (Tenant trades view, user trade history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_trades_tenant_executed ON trading_trades (tenant_id, executed_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_trades_tenant_user_executed ON trading_trades (tenant_id, user_id, executed_at DESC);

-- 5. Trading Positions (Tenant positions view, user open positions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_positions_tenant_updated ON trading_positions (tenant_id, updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_positions_tenant_user_updated ON trading_positions (tenant_id, user_id, updated_at DESC);

-- 6. Trading Wallets (Fast Hash/Merge Joins on normalized user_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_wallets_lower_user ON trading_wallets (LOWER(user_id), tenant_id);

-- 7. Fund Transactions (Deposits / Withdrawals)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fund_tx_tenant_created ON trading_fund_transactions (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fund_tx_tenant_user_created ON trading_fund_transactions (tenant_id, user_id, created_at DESC);

-- 8. Immutable Financial Ledger
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_tenant_user_created ON trading_ledger_entries (tenant_id, user_id, created_at DESC);

-- 9. Transactional Outbox (Continuous polling worker: pending status + scheduled attempt + created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_outbox_pending_created ON trading_outbox (status, next_attempt_at, created_at ASC);

-- 10. Clean up redundant duplicate indexes that add write overhead without providing query benefits
DROP INDEX IF EXISTS idx_trading_outbox_event_id;
DROP INDEX IF EXISTS idx_trading_wallets_tenant_user;
