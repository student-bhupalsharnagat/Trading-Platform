-- ==========================================================
-- VERTEX Multi-Tenant Trading Platform - Phase 5E Schema
-- Durable PostgreSQL Trading Persistence
-- ==========================================================

-- A) trading_orders
CREATE TABLE IF NOT EXISTS trading_orders (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    client_order_id VARCHAR(128),
    instrument_id VARCHAR(64) NOT NULL,
    side VARCHAR(10) NOT NULL, -- 'BUY', 'SELL'
    order_type VARCHAR(20) NOT NULL, -- 'MARKET', 'LIMIT', etc.
    quantity NUMERIC(18, 4) NOT NULL,
    price NUMERIC(18, 4) NOT NULL,
    trigger_price NUMERIC(18, 4),
    status VARCHAR(30) NOT NULL, -- 'PENDING', 'EXECUTED', 'CANCELLED', 'REJECTED'
    filled_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
    remaining_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
    average_fill_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
    time_in_force VARCHAR(20) NOT NULL DEFAULT 'DAY',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_trading_orders_tenant_id ON trading_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_id ON trading_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_status ON trading_orders(status);
CREATE INDEX IF NOT EXISTS idx_trading_orders_instrument_id ON trading_orders(instrument_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_created_at ON trading_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_trading_orders_client_order_id ON trading_orders(client_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_user_client_order_id 
    ON trading_orders(tenant_id, user_id, client_order_id) 
    WHERE client_order_id IS NOT NULL;

-- B) trading_trades
CREATE TABLE IF NOT EXISTS trading_trades (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    instrument_id VARCHAR(64) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL,
    execution_price NUMERIC(18, 4) NOT NULL,
    execution_value NUMERIC(18, 4) NOT NULL,
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_trades_tenant_id ON trading_trades(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trading_trades_user_id ON trading_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_trades_order_id ON trading_trades(order_id);
CREATE INDEX IF NOT EXISTS idx_trading_trades_instrument_id ON trading_trades(instrument_id);
CREATE INDEX IF NOT EXISTS idx_trading_trades_executed_at ON trading_trades(executed_at);

-- C) trading_positions
CREATE TABLE IF NOT EXISTS trading_positions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    instrument_id VARCHAR(64) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL,
    average_price NUMERIC(18, 4) NOT NULL,
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    unrealized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    margin_used NUMERIC(18, 4) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_positions_tenant_user_instrument UNIQUE (tenant_id, user_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_trading_positions_tenant_user ON trading_positions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_trading_positions_instrument ON trading_positions(instrument_id);

-- D) trading_wallets
CREATE TABLE IF NOT EXISTS trading_wallets (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    available_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
    blocked_balance NUMERIC(18, 4) NOT NULL DEFAULT 0,
    used_margin NUMERIC(18, 4) NOT NULL DEFAULT 0,
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wallets_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trading_wallets_tenant_user ON trading_wallets(tenant_id, user_id);

-- E) trading_order_events
CREATE TABLE IF NOT EXISTS trading_order_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_order_events_tenant_order ON trading_order_events(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_trading_order_events_type ON trading_order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_trading_order_events_created_at ON trading_order_events(created_at);

-- F) trading_margin_snapshots
CREATE TABLE IF NOT EXISTS trading_margin_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    equity NUMERIC(18, 4) NOT NULL,
    available_margin NUMERIC(18, 4) NOT NULL,
    used_margin NUMERIC(18, 4) NOT NULL,
    margin_level NUMERIC(18, 4) NOT NULL,
    unrealized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_margin_snapshots_tenant_user ON trading_margin_snapshots(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_trading_margin_snapshots_created_at ON trading_margin_snapshots(created_at);
