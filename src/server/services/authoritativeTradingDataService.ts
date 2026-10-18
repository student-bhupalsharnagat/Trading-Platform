import { pgDb } from '../db/postgres.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresMarginRepository } from '../repositories/trading/PostgresMarginRepository.ts';
import { postgresClientMappingRepository } from '../repositories/trading/PostgresClientMappingRepository.ts';
import { postgresFundTransactionRepository } from '../repositories/trading/PostgresFundTransactionRepository.ts';
import type { TradingFundTransaction } from '../repositories/trading/ITradingFundTransactionRepository.ts';
import { postgresLedgerRepository } from '../repositories/trading/PostgresLedgerRepository.ts';
import { db } from '../db/database.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';
import { transactionalOutboxService } from './TransactionalOutboxService.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { auditService } from './auditService.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import crypto from 'crypto';

export const DEFAULT_TENANTS = ['TNT-001', 'TNT-002', 'TNT-003', 'vertex-default', 'default'];

export function sanitizeTenant(raw?: string | string[] | null | unknown): string {
  if (!raw) return '';
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  return str.split(',')[0].trim();
}

export function isDefaultTenant(tenantId?: string | null): boolean {
  if (!tenantId) return true;
  const t = sanitizeTenant(tenantId).toLowerCase();
  return (
    t === 'tnt-001' ||
    t === 'tnt-002' ||
    t === 'tnt-003' ||
    t === 'vertex-default' ||
    t === 'default' ||
    t === ''
  );
}

export function getSearchTenants(tenantId?: string | null): string[] {
  const norm = sanitizeTenant(tenantId);
  const list = [norm, ...DEFAULT_TENANTS].filter(Boolean);
  return Array.from(new Set(list));
}

export class AuthoritativeTradingDataService {
  /**
   * Resolves a clientId (could be trading_user_id, external_client_id, or external_client_code)
   * to the canonical trading_user_id across the tenant or default tenant fallbacks.
   */
  public async resolveTradingUserId(tenantId: string, clientIdOrCode: string): Promise<string> {
    if (!clientIdOrCode) return '';
    const trimmed = clientIdOrCode.trim();
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = getSearchTenants(cleanTenant);

    // 1. Direct check in User table
    const directUser = db.findUserByUserId(trimmed) || db.findUserById(trimmed);
    if (directUser) {
      const uTenant = directUser.tenant_id || 'vertex-default';
      if (
        uTenant.toLowerCase() === cleanTenant.toLowerCase() ||
        isDefault ||
        isDefaultTenant(uTenant)
      ) {
        return directUser.user_id;
      }
    }

    // 2. Direct single fast SQL query against client_identity_mappings
    try {
      const res = await pgDb.query(
        `SELECT trading_user_id FROM client_identity_mappings
         WHERE (tenant_id = ANY($1) OR $2 = true)
           AND (LOWER(trading_user_id) = LOWER($3) OR LOWER(external_client_id) = LOWER($3) OR LOWER(external_client_code) = LOWER($3))
         LIMIT 1;`,
        [searchTenants, isDefault, trimmed]
      );
      if (res.rows && res.rows[0]?.trading_user_id) {
        return res.rows[0].trading_user_id;
      }
    } catch {
      // Degraded fallback
    }

    return trimmed;
  }

  /**
   * GET /trading/summary
   */
  public async getTradingSummary(tenantId: string) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];

    // Single parallel batch with Promise.all
    const [ordersRes, tradesRes, positionsRes, userCountsRes] = await Promise.all([
      this.getOrders(cleanTenant, { limit: 1000 }),
      this.getTrades(cleanTenant, { limit: 1000 }),
      this.getPositions(cleanTenant, { limit: 1000 }),
      pgDb
        .query(
          `SELECT count(*) as count, count(*) FILTER (WHERE status = 'active' OR status = 'ACTIVE') as active_count
           FROM users WHERE tenant_id = ANY($1) OR $2 = true;`,
          [searchTenants, isDefault]
        )
        .catch(() => ({ rows: [] })),
    ]);

    const orders = ordersRes.orders;
    const trades = tradesRes.trades;
    const positions = positionsRes.positions;

    const pendingOrdersCount = orders.filter(
      (o: any) => o.status === 'PENDING' || (o.status as string) === 'SUBMITTED' || (o.status as string) === 'OPEN'
    ).length;
    const executedTradesCount = trades.length;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayTrades = trades.filter((t: any) => (t.executed_at || '').startsWith(todayStr));

    const todayTurnover = todayTrades.reduce((sum: number, t: any) => sum + Number(t.execution_value || 0), 0);
    const totalTurnover = trades.reduce((sum: number, t: any) => sum + Number(t.execution_value || 0), 0);

    const totalRealizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.realized_pnl || 0), 0);
    const totalUnrealizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const totalUsedMargin = positions.reduce((sum: number, p: any) => sum + Number(p.used_margin || 0), 0);

    let allUsers = db.getAllUsers();
    if (!isDefault) {
      const searchTenantsLower = searchTenants.map((t) => t.toLowerCase());
      allUsers = allUsers.filter((u) => searchTenantsLower.includes((u.tenant_id || 'vertex-default').toLowerCase()) || !u.tenant_id);
    }
    let totalUsers = allUsers.length;
    let activeUsers = allUsers.filter((u) => u.status === 'active' || u.status === 'ACTIVE').length;

    const pgCount = parseInt(userCountsRes.rows?.[0]?.count, 10);
    const pgActive = parseInt(userCountsRes.rows?.[0]?.active_count, 10);
    if (!isNaN(pgCount) && pgCount > totalUsers) {
      totalUsers = pgCount;
      activeUsers = !isNaN(pgActive) ? pgActive : pgCount;
    }

    const emergencyStatus = emergencyStateCache.get(cleanTenant);

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      timestamp: new Date().toISOString(),
      trading_enabled: !emergencyStatus.tradingHalted,
      tenant_frozen: emergencyStatus.tenantFrozen,
      metrics: {
        total_users: totalUsers,
        active_users: activeUsers,
        pending_orders_count: pendingOrdersCount,
        executed_trades_count: executedTradesCount,
        open_positions_count: openPositions.length,
        today_turnover: todayTurnover,
        total_turnover: totalTurnover,
        realized_pnl: totalRealizedPnl,
        unrealized_pnl: totalUnrealizedPnl,
        total_pnl: totalRealizedPnl + totalUnrealizedPnl,
        total_used_margin: totalUsedMargin,
      },
    };
  }

  /**
   * GET /trading/orders
   */
  public async getOrders(tenantId: string, options: { userId?: string; status?: string; limit?: number } = {}) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(cleanTenant, options.userId) : undefined;
    const limit = options.limit ? Math.min(1000, Math.max(1, options.limit)) : 500;

    let orders: any[] = [];
    try {
      let sql = `SELECT * FROM trading_orders WHERE (tenant_id = ANY($1) OR $2 = true)`;
      const params: any[] = [searchTenants, isDefault];

      if (resolvedUserId) {
        params.push(resolvedUserId);
        sql += ` AND user_id = $${params.length}`;
      }
      if (options.status) {
        params.push(options.status);
        sql += ` AND status = $${params.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1};`;
      params.push(limit);

      const res = await pgDb.query(sql, params);
      for (const row of res.rows || []) {
        orders.push({
          id: row.id,
          order_id: row.id,
          tenant_id: row.tenant_id || cleanTenant,
          user_id: row.user_id,
          client_order_id: row.client_order_id,
          symbol: row.instrument_id,
          instrument_id: row.instrument_id,
          side: row.side,
          order_type: row.order_type,
          quantity: Number(row.quantity),
          price: Number(row.price),
          trigger_price: row.trigger_price != null ? Number(row.trigger_price) : null,
          status: row.status,
          broker_order_id: row.broker_order_id || null,
          normalized_status: row.normalized_status || row.status,
          filled_quantity: Number(row.filled_quantity || 0),
          remaining_quantity: Number(row.remaining_quantity || 0),
          average_fill_price: Number(row.average_fill_price || 0),
          time_in_force: row.time_in_force || 'DAY',
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
          cancelled_at: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
        });
      }
    } catch {
      // Degraded fallback
    }

    return {
      tenant_id: cleanTenant,
      count: orders.length,
      total: orders.length,
      data_state: 'authoritative',
      orders,
    };
  }

  /**
   * GET /trading/trades
   */
  public async getTrades(tenantId: string, options: { userId?: string; orderId?: string; limit?: number } = {}) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(cleanTenant, options.userId) : undefined;
    const limit = options.limit ? Math.min(1000, Math.max(1, options.limit)) : 500;

    let trades: any[] = [];
    try {
      let sql = `SELECT * FROM trading_trades WHERE (tenant_id = ANY($1) OR $2 = true)`;
      const params: any[] = [searchTenants, isDefault];

      if (resolvedUserId) {
        params.push(resolvedUserId);
        sql += ` AND user_id = $${params.length}`;
      }
      if (options.orderId) {
        params.push(options.orderId);
        sql += ` AND order_id = $${params.length}`;
      }

      sql += ` ORDER BY executed_at DESC LIMIT $${params.length + 1};`;
      params.push(limit);

      const res = await pgDb.query(sql, params);
      for (const t of res.rows || []) {
        trades.push({
          id: t.id,
          trade_id: t.id,
          tenant_id: t.tenant_id || cleanTenant,
          user_id: t.user_id,
          order_id: t.order_id,
          symbol: t.symbol || t.instrument_id,
          instrument_id: t.instrument_id,
          exchange: t.exchange || 'NSE',
          side: t.side,
          quantity: Number(t.quantity),
          price: Number(t.execution_price),
          execution_price: Number(t.execution_price),
          total_value: Number(t.execution_value),
          execution_value: Number(t.execution_value),
          fees: Number(t.fees || 0),
          commission: Number(t.commission || 0),
          realized_pnl: Number(t.realized_pnl || 0),
          status: t.status || 'EXECUTED',
          executed_at: t.executed_at ? new Date(t.executed_at).toISOString() : new Date().toISOString(),
          created_at: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
        });
      }
    } catch {
      // Degraded fallback
    }

    return {
      tenant_id: cleanTenant,
      count: trades.length,
      total: trades.length,
      data_state: 'authoritative',
      trades,
    };
  }

  /**
   * GET /trading/positions
   */
  public async getPositions(tenantId: string, options: { userId?: string; status?: string; limit?: number } = {}) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(cleanTenant, options.userId) : undefined;
    const limit = options.limit ? Math.min(1000, Math.max(1, options.limit)) : 500;

    let positions: any[] = [];
    try {
      let sql = `SELECT * FROM trading_positions WHERE (tenant_id = ANY($1) OR $2 = true)`;
      const params: any[] = [searchTenants, isDefault];

      if (resolvedUserId) {
        params.push(resolvedUserId);
        sql += ` AND user_id = $${params.length}`;
      }
      if (options.status === 'OPEN') {
        sql += ` AND quantity != 0`;
      } else if (options.status === 'CLOSED') {
        sql += ` AND quantity = 0`;
      }

      sql += ` ORDER BY updated_at DESC LIMIT $${params.length + 1};`;
      params.push(limit);

      const res = await pgDb.query(sql, params);
      for (const p of res.rows || []) {
        const qty = Number(p.quantity);
        const side = qty > 0 ? 'BUY' : qty < 0 ? 'SELL' : 'CLOSED';
        const absQty = Math.abs(qty);
        const avgPrice = Number(p.average_price);
        const unrealizedPnl = Number(p.unrealized_pnl || 0);
        const totalInvested = avgPrice * absQty;
        const unrealizedPnlPct = totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;
        const currentPrice = absQty > 0 ? avgPrice + unrealizedPnl / absQty : avgPrice;

        positions.push({
          id: p.id,
          position_id: p.id,
          tenant_id: p.tenant_id || cleanTenant,
          user_id: p.user_id,
          symbol: p.symbol || p.instrument_id,
          instrument_id: p.instrument_id,
          exchange: p.exchange || 'NSE',
          side,
          quantity: absQty,
          raw_quantity: qty,
          average_price: avgPrice,
          current_price: currentPrice,
          used_margin: Number(p.margin_used || 0),
          margin_used: Number(p.margin_used || 0),
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_percentage: Number(unrealizedPnlPct.toFixed(2)),
          realized_pnl: Number(p.realized_pnl || 0),
          status: qty !== 0 ? 'OPEN' : 'CLOSED',
          updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : new Date().toISOString(),
        });
      }
    } catch {
      // Degraded fallback
    }

    return {
      tenant_id: cleanTenant,
      count: positions.length,
      total: positions.length,
      data_state: 'authoritative',
      positions,
    };
  }

  /**
   * GET /trading/risk-summary & GET /risk/summary
   */
  public async getRiskSummary(tenantId: string) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const positionsRes = await this.getPositions(cleanTenant);
    const positions = positionsRes.positions;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    const totalUsedMargin = openPositions.reduce((sum: number, p: any) => sum + Number(p.used_margin || 0), 0);
    const totalUnrealizedPnl = openPositions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const totalExposure = openPositions.reduce(
      (sum: number, p: any) => sum + Math.abs(Number(p.quantity)) * Number(p.average_price),
      0
    );

    // Get all wallets for tenant and default fallbacks
    const searchTenants = getSearchTenants(cleanTenant);
    const walletsRes = await pgDb.query(
      `SELECT available_balance, blocked_balance, used_margin, user_id FROM trading_wallets WHERE tenant_id = ANY($1) OR $2 = true`,
      [searchTenants, isDefault]
    );

    const seenWallets = new Set<string>();
    let totalAvailableBalance = 0;
    let totalBlockedBalance = 0;
    for (const r of walletsRes.rows) {
      if (!seenWallets.has(r.user_id)) {
        seenWallets.add(r.user_id);
        totalAvailableBalance += Number(r.available_balance || 0);
        totalBlockedBalance += Number(r.blocked_balance || 0);
      }
    }

    const totalEquity = totalAvailableBalance + totalBlockedBalance + totalUsedMargin + totalUnrealizedPnl;
    const marginUtilization = totalEquity > 0 ? (totalUsedMargin / totalEquity) * 100 : 0;
    const emergencyStatus = emergencyStateCache.get(cleanTenant);

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      timestamp: new Date().toISOString(),
      trading_halted: emergencyStatus.tradingHalted,
      tenant_frozen: emergencyStatus.tenantFrozen,
      total_equity: totalEquity,
      total_available_margin: totalAvailableBalance,
      total_used_margin: totalUsedMargin,
      total_blocked_balance: totalBlockedBalance,
      unrealized_pnl: totalUnrealizedPnl,
      total_exposure: totalExposure,
      margin_utilization: Number(marginUtilization.toFixed(2)),
      open_positions_count: openPositions.length,
      margin_breaches_count: marginUtilization > 100 ? 1 : 0,
      risk_level: marginUtilization > 90 ? 'CRITICAL' : marginUtilization > 75 ? 'WARNING' : 'NORMAL',
    };
  }

  /**
   * GET /trading/clients/:clientId/account
   */
  public async getClientAccount(tenantId: string, clientId: string) {
    const resolvedUserId = await this.resolveTradingUserId(tenantId, clientId);
    const user = db.findUserByUserId(resolvedUserId) || db.findUserById(resolvedUserId);

    if (!user) {
      const err = new Error(`Trading client '${clientId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const userTenant = user.tenant_id || 'vertex-default';
    if (
      userTenant.toLowerCase() !== tenantId.toLowerCase() &&
      !isDefaultTenant(tenantId) &&
      !isDefaultTenant(userTenant)
    ) {
      const err = new Error(`Tenant mismatch: Client belongs to '${user.tenant_id}', not '${tenantId}'.`);
      (err as any).statusCode = 403;
      (err as any).code = 'TENANT_MISMATCH';
      throw err;
    }

    // Get mapping across search tenants
    let mapping = await postgresClientMappingRepository.findByTradingUserId(tenantId, resolvedUserId);
    if (!mapping && isDefaultTenant(tenantId)) {
      for (const st of getSearchTenants(tenantId)) {
        mapping = await postgresClientMappingRepository.findByTradingUserId(st, resolvedUserId);
        if (mapping) break;
      }
    }

    // Get wallet across search tenants
    let wallet = await postgresWalletRepository.getWallet(tenantId, resolvedUserId);
    if (!wallet && isDefaultTenant(tenantId)) {
      for (const st of getSearchTenants(tenantId)) {
        wallet = await postgresWalletRepository.getWallet(st, resolvedUserId);
        if (wallet) break;
      }
    }
    if (!wallet) {
      wallet = await postgresWalletRepository.getOrCreateWallet(
        tenantId,
        resolvedUserId,
        user.demo_balance || 1000000.0
      );
    }

    // Get positions across search tenants
    const posRes = await this.getPositions(tenantId, { userId: resolvedUserId });
    const positions = posRes.positions;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    // Get orders across search tenants
    const ordersRes = await this.getOrders(tenantId, { userId: resolvedUserId });
    const orders = ordersRes.orders;
    const pendingOrders = orders.filter((o: any) => o.status === 'PENDING' || (o.status as string) === 'SUBMITTED' || (o.status as string) === 'OPEN');

    // Get trades across search tenants
    const tradesRes = await this.getTrades(tenantId, { userId: resolvedUserId });
    const trades = tradesRes.trades;

    const realizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.realized_pnl || 0), 0);
    const unrealizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const usedMargin = openPositions.reduce((sum: number, p: any) => sum + Number(p.margin_used || 0), 0);

    const availableBalance = wallet.available_balance;
    const equity = availableBalance + usedMargin + unrealizedPnl;
    const availableMargin = Math.max(0, equity - usedMargin);
    const freeMargin = availableMargin;

    const totalTurnover = trades.reduce((sum: number, t: any) => sum + Number(t.execution_value || 0), 0);

    return {
      tenant_id: tenantId,
      trading_user_id: user.user_id,
      external_client_id: mapping?.external_client_id || null,
      external_client_code: mapping?.external_client_code || null,
      identity: {
        id: user.id,
        user_id: user.user_id,
        full_name: user.full_name,
        mobile: user.mobile,
        email: user.email || null,
        role: user.role,
        hierarchy_path: user.hierarchy_path,
        company: user.company || null,
        is_frozen: user.is_frozen || false,
        status: user.status,
        created_at: user.created_at,
        last_login_at: user.last_login_at || null,
      },
      account: {
        status: user.status,
        is_frozen: user.is_frozen || false,
        currency: 'INR',
        balance: availableBalance + usedMargin,
        wallet_available_balance: availableBalance,
        wallet_blocked_balance: wallet.blocked_balance,
        equity,
        available_margin: availableMargin,
        used_margin: usedMargin,
        free_margin: freeMargin,
        margin_utilization: equity > 0 ? Number(((usedMargin / equity) * 100).toFixed(2)) : 0,
        realized_pnl: realizedPnl,
        unrealized_pnl: unrealizedPnl,
        net_pnl: realizedPnl + unrealizedPnl,
        total_turnover: totalTurnover,
        open_positions_count: openPositions.length,
        pending_orders_count: pendingOrders.length,
        total_orders_count: orders.length,
        total_trades_count: trades.length,
        risk_status: usedMargin > equity ? 'BREACH' : usedMargin / (equity || 1) > 0.8 ? 'WARNING' : 'NORMAL',
      },
      data_state: 'authoritative',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /trading/clients/:clientId/ledger
   */
  public async getClientLedger(tenantId: string, clientId: string) {
    const resolvedUserId = await this.resolveTradingUserId(tenantId, clientId);
    let entries = await postgresLedgerRepository.getByUserId(resolvedUserId, tenantId);
    if (entries.length === 0 && isDefaultTenant(tenantId)) {
      for (const st of getSearchTenants(tenantId)) {
        const fb = await postgresLedgerRepository.getByUserId(resolvedUserId, st);
        if (fb.length > 0) {
          entries = fb;
          break;
        }
      }
    }

    return {
      tenant_id: tenantId,
      user_id: resolvedUserId,
      count: entries.length,
      data_state: 'authoritative',
      ledger: entries,
    };
  }

  /**
   * GET /trading/clients/:clientId/funds
   */
  public async getClientFunds(tenantId: string, clientId: string) {
    const resolvedUserId = await this.resolveTradingUserId(tenantId, clientId);
    let transactions = await postgresFundTransactionRepository.getByTenant(tenantId, resolvedUserId);
    if (transactions.length === 0 && isDefaultTenant(tenantId)) {
      for (const st of getSearchTenants(tenantId)) {
        const fb = await postgresFundTransactionRepository.getByTenant(st, resolvedUserId);
        if (fb.length > 0) {
          transactions = fb;
          break;
        }
      }
    }

    return {
      tenant_id: tenantId,
      user_id: resolvedUserId,
      count: transactions.length,
      data_state: 'authoritative',
      transactions,
    };
  }

  /**
   * GET /trading/financial-summary
   * Canonical consolidated financial aggregator across the tenant.
   */
  public async getFinancialSummary(tenantId: string) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    let allUsers = db.getAllUsers();
    if (!isDefault) {
      const searchTenants = getSearchTenants(cleanTenant).map((t) => t.toLowerCase());
      allUsers = allUsers.filter((u) => searchTenants.includes((u.tenant_id || 'vertex-default').toLowerCase()) || !u.tenant_id);
    }
    let totalUsers = allUsers.length;
    let activeUsers = allUsers.filter((u) => u.status === 'active' || u.status === 'ACTIVE').length;
    try {
      const pgRes = await pgDb.query(`SELECT count(*) as count, count(*) FILTER (WHERE status = 'active' OR status = 'ACTIVE') as active_count FROM users;`);
      const pgCount = parseInt(pgRes.rows[0]?.count, 10);
      const pgActive = parseInt(pgRes.rows[0]?.active_count, 10);
      if (pgCount > totalUsers) {
        totalUsers = pgCount;
        activeUsers = pgActive || pgCount;
      }
    } catch {}

    const positionsRes = await this.getPositions(cleanTenant);
    const positions = positionsRes.positions;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    const tradesRes = await this.getTrades(cleanTenant);
    const trades = tradesRes.trades;
    const totalTurnover = trades.reduce((sum: number, t: any) => sum + Number(t.execution_value || 0), 0);
    const commissionEarned = trades.reduce((sum: number, t: any) => sum + Number(t.commission || 0), 0);
    const feesEarned = trades.reduce((sum: number, t: any) => sum + Number(t.fees || 0), 0);

    const realizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.realized_pnl || 0), 0);
    const unrealizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const netPnl = realizedPnl + unrealizedPnl;

    const walletsRes = await pgDb.query(
      `SELECT available_balance, blocked_balance, used_margin, user_id FROM trading_wallets WHERE tenant_id = ANY($1) OR $2 = true`,
      [getSearchTenants(cleanTenant), isDefault]
    );

    const seenWallets = new Set<string>();
    let totalAvailableBalance = 0;
    let totalBlockedBalance = 0;
    for (const r of walletsRes.rows) {
      if (!seenWallets.has(r.user_id)) {
        seenWallets.add(r.user_id);
        totalAvailableBalance += Number(r.available_balance || 0);
        totalBlockedBalance += Number(r.blocked_balance || 0);
      }
    }
    const totalUsedMargin = openPositions.reduce((sum: number, p: any) => sum + Number(p.margin_used || 0), 0);
    const totalEquity = totalAvailableBalance + totalBlockedBalance + totalUsedMargin + unrealizedPnl;
    const totalAvailableMargin = Math.max(0, totalEquity - totalUsedMargin);

    // Fund transactions
    const pendingDeposits = await postgresFundTransactionRepository.getByTenant(cleanTenant, undefined, 'DEPOSIT', 'PENDING');
    const pendingWithdrawals = await postgresFundTransactionRepository.getByTenant(cleanTenant, undefined, 'WITHDRAWAL', 'PENDING');

    const pendingDepositAmount = pendingDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      timestamp: new Date().toISOString(),
      total_users: totalUsers,
      active_users: activeUsers,
      total_balance: totalAvailableBalance + totalUsedMargin,
      total_equity: totalEquity,
      total_used_margin: totalUsedMargin,
      total_available_margin: totalAvailableMargin,
      open_positions: openPositions.length,
      total_turnover: totalTurnover,
      realized_pnl: realizedPnl,
      unrealized_pnl: unrealizedPnl,
      net_pnl: netPnl,
      pending_deposit_count: pendingDeposits.length,
      pending_deposit_amount: pendingDepositAmount,
      pending_withdrawal_count: pendingWithdrawals.length,
      pending_withdrawal_amount: pendingWithdrawalAmount,
      commission_earned: commissionEarned,
      fees_earned: feesEarned,
    };
  }

  /**
   * Links or updates an external client identity mapping
   */
  public async linkClientIdentity(
    tenantId: string,
    tradingUserId: string,
    externalClientId?: string | null,
    externalClientCode?: string | null
  ) {
    const user = db.findUserByUserId(tradingUserId) || db.findUserById(tradingUserId);
    if (!user) {
      const err = new Error(`Trading user '${tradingUserId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const mapping = await postgresClientMappingRepository.createOrUpdate(
      tenantId,
      user.user_id,
      externalClientId,
      externalClientCode
    );

    auditService.logEmergencyEvent({
      action: 'CLIENT_IDENTITY_MAPPED',
      source: 'CENTRAL_ADMIN',
      tenantId,
      result: {
        tradingUserId: user.user_id,
        externalClientId,
        externalClientCode,
      },
    });

    return mapping;
  }

  /**
   * Creates a deposit or withdrawal fund request
   */
  public async createFundTransaction(
    tenantId: string,
    userId: string,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    amount: number,
    paymentMethod = 'BANK_TRANSFER',
    referenceId?: string
  ) {
    const resolvedUserId = await this.resolveTradingUserId(tenantId, userId);
    const txId = `tx-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

    const tx = await postgresFundTransactionRepository.create({
      id: txId,
      tenant_id: tenantId,
      user_id: resolvedUserId,
      transaction_type: type,
      amount,
      status: 'PENDING',
      payment_method: paymentMethod,
      reference_id: referenceId,
    });

    const eventType = type === 'DEPOSIT' ? 'deposit.created' : 'withdrawal.created';
    const fundPayload = {
      id: txId,
      transactionId: txId,
      clientCode: resolvedUserId.toUpperCase(),
      tenantId,
      userId: resolvedUserId,
      clientId: resolvedUserId,
      tradingUserId: resolvedUserId,
      amount: Number(amount),
      type,
      status: 'PENDING' as const,
      method: paymentMethod,
      paymentMethod,
      reference: referenceId || txId,
      referenceId,
      createdAt: tx.created_at || new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    // Enqueue outbox event for durable delivery
    await transactionalOutboxService.enqueue({
      eventId: `evt-fund-${txId}`,
      eventType,
      tenantId,
      payload: fundPayload,
    });

    // Dispatch asynchronous internal event for Central Admin
    internalEventDispatcher.dispatchFundTransaction(eventType, fundPayload).catch((e) =>
      console.warn(`[Event] ${eventType} dispatch warning:`, e)
    );

    // Real-time WebSocket delivery to client and broker panel
    tradingWebSocketServer.broadcastToTenant(
      tenantId,
      'fund.created',
      fundPayload,
      (ws) => ws.userId === resolvedUserId || ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(ws.role)
    );

    return tx;
  }

  /**
   * Approves or rejects a fund transaction and adjusts authoritative wallet & immutable ledger
   */
  public async processFundTransaction(
    tenantId: string,
    txId: string,
    action: 'APPROVE' | 'REJECT',
    adminId = 'CENTRAL_ADMIN',
    reason?: string
  ) {
    const tx = await postgresFundTransactionRepository.findById(tenantId, txId);
    if (!tx) {
      const err = new Error(`Fund transaction '${txId}' not found for tenant '${tenantId}'.`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (tx.status !== 'PENDING') {
      const err = new Error(`Fund transaction '${txId}' is already in state '${tx.status}'.`);
      (err as any).statusCode = 400;
      throw err;
    }

    if (action === 'REJECT') {
      const updated = await postgresFundTransactionRepository.updateStatus(tenantId, txId, 'REJECTED', adminId, reason);
      const eventType = tx.transaction_type === 'DEPOSIT' ? 'deposit.rejected' : 'withdrawal.rejected';
      const rejectPayload = {
        id: txId,
        transactionId: txId,
        clientCode: tx.user_id.toUpperCase(),
        tenantId,
        userId: tx.user_id,
        clientId: tx.user_id,
        tradingUserId: tx.user_id,
        amount: Number(tx.amount),
        type: tx.transaction_type,
        status: 'REJECTED' as const,
        method: tx.payment_method || 'BANK_TRANSFER',
        paymentMethod: tx.payment_method || 'BANK_TRANSFER',
        reference: tx.reference_id || txId,
        referenceId: tx.reference_id,
        reason,
        createdAt: tx.created_at || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      await transactionalOutboxService.enqueue({
        eventId: `evt-fund-rej-${txId}`,
        eventType,
        tenantId,
        payload: rejectPayload,
      });

      internalEventDispatcher.dispatchFundTransaction(eventType, rejectPayload).catch((e) =>
        console.warn(`[Event] ${eventType} dispatch warning:`, e)
      );

      // Real-time WebSocket delivery to client and broker panel
      tradingWebSocketServer.broadcastToTenant(
        tenantId,
        'fund.updated',
        rejectPayload,
        (ws) => ws.userId === tx.user_id || ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(ws.role)
      );

      return updated;
    }

    // Process approval with atomic database transaction
    const approvalResult = await pgDb.transaction(async (client) => {
      const lockedWallet = await postgresWalletRepository.lockWalletForUpdate(tenantId, tx.user_id, client);
      const currentBal = Number(lockedWallet.available_balance);

      let newBal = currentBal;
      let ledgerType: 'CREDIT' | 'DEBIT' = 'CREDIT';

      if (tx.transaction_type === 'DEPOSIT') {
        newBal = currentBal + Number(tx.amount);
        ledgerType = 'CREDIT';
      } else if (tx.transaction_type === 'WITHDRAWAL') {
        if (currentBal < Number(tx.amount)) {
          throw new Error(`Insufficient wallet balance for withdrawal. Current balance: ${currentBal}, requested: ${tx.amount}`);
        }
        newBal = currentBal - Number(tx.amount);
        ledgerType = 'DEBIT';
      }

      // Update wallet balance
      const updatedWallet = await postgresWalletRepository.updateWallet(
        tenantId,
        tx.user_id,
        { available_balance: newBal },
        client
      );

      // Create immutable ledger entry
      await postgresLedgerRepository.createEntry(
        {
          tenant_id: tenantId,
          user_id: tx.user_id,
          transaction_id: tx.id,
          type: ledgerType,
          category: tx.transaction_type,
          amount: Number(tx.amount),
          balance_before: currentBal,
          balance_after: newBal,
          reference: `Admin Approved ${tx.transaction_type} [${tx.reference_id || tx.id}]`,
          created_by: adminId,
        },
        client
      );

      // Update transaction status
      const updatedTx = await postgresFundTransactionRepository.updateStatus(
        tenantId,
        txId,
        'APPROVED',
        adminId,
        undefined,
        client
      );

      const eventType = tx.transaction_type === 'DEPOSIT' ? 'deposit.approved' : 'withdrawal.approved';
      const approvePayload = {
        id: txId,
        transactionId: txId,
        clientCode: tx.user_id.toUpperCase(),
        tenantId,
        userId: tx.user_id,
        clientId: tx.user_id,
        tradingUserId: tx.user_id,
        amount: Number(tx.amount),
        type: tx.transaction_type,
        status: 'APPROVED' as const,
        method: tx.payment_method || 'BANK_TRANSFER',
        paymentMethod: tx.payment_method || 'BANK_TRANSFER',
        reference: tx.reference_id || txId,
        referenceId: tx.reference_id,
        balanceBefore: currentBal,
        balanceAfter: newBal,
        approvedBy: adminId,
        createdAt: tx.created_at || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      await transactionalOutboxService.enqueue(
        {
          eventId: `evt-fund-app-${txId}`,
          eventType,
          tenantId,
          payload: approvePayload,
        },
        client
      );

      const walletPayload = {
        tenantId,
        userId: tx.user_id,
        clientId: tx.user_id,
        tradingUserId: tx.user_id,
        balance: Number((updatedWallet.available_balance + (updatedWallet.blocked_balance || 0)).toFixed(2)),
        available: Number(updatedWallet.available_balance),
        availableBalance: Number(updatedWallet.available_balance),
        blocked: Number(updatedWallet.blocked_balance || 0),
        blockedBalance: Number(updatedWallet.blocked_balance || 0),
        usedMargin: Number(updatedWallet.used_margin),
        realizedPnl: Number(updatedWallet.realized_pnl || 0),
        equity: Number((updatedWallet.available_balance + updatedWallet.used_margin).toFixed(2)),
        updatedAt: new Date().toISOString(),
      };

      await transactionalOutboxService.enqueue(
        {
          eventId: `evt-wallet-fund-${txId}`,
          tenantId,
          eventType: 'wallet.updated',
          payload: walletPayload,
        },
        client
      );

      return { updatedTx, approvePayload, walletPayload, eventType };
    });

    // Dispatch post-commit events
    internalEventDispatcher.dispatchFundTransaction(approvalResult.eventType, approvalResult.approvePayload).catch((e) =>
      console.warn(`[Event] ${approvalResult.eventType} dispatch warning:`, e)
    );

    internalEventDispatcher.dispatchWalletUpdated(approvalResult.walletPayload).catch((e) =>
      console.warn('[Event] wallet.updated dispatch warning:', e)
    );

    // Real-time WebSocket delivery to client and broker panel
    tradingWebSocketServer.broadcastToTenant(
      tenantId,
      'wallet.updated',
      approvalResult.walletPayload,
      (ws) => ws.userId === tx.user_id || ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(ws.role)
    );
    tradingWebSocketServer.broadcastToTenant(
      tenantId,
      'fund.updated',
      approvalResult.approvePayload,
      (ws) => ws.userId === tx.user_id || ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(ws.role)
    );

    return approvalResult.updatedTx;
  }

  /**
   * Paged, tenant-scoped, read-only query for clients backfill.
   */
  public async getClientsPaged(
    tenantId: string,
    options: { page?: number; limit?: number; search?: string } = {}
  ) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 250)));
    const offset = (page - 1) * limit;
    const searchTenants = getSearchTenants(cleanTenant);

    // 1. Direct fast single SQL query against PostgreSQL users & trading_wallets
    try {
      const params: any[] = [searchTenants, isDefault];
      let sql = `
        SELECT 
          u.id,
          u.user_id,
          u.full_name,
          u.email,
          u.mobile,
          u.country_code,
          u.role,
          u.status,
          u.is_verified,
          u.tenant_id,
          u.created_at,
          u.demo_balance,
          COALESCE(w.available_balance, u.demo_balance, 1000000.00) as available_balance,
          COALESCE(w.blocked_balance, 0) as blocked_balance,
          COALESCE(w.used_margin, 0) as used_margin,
          COALESCE(w.realized_pnl, 0) as realized_pnl,
          COUNT(*) OVER() as total_count
        FROM users u
        LEFT JOIN trading_wallets w ON (LOWER(w.user_id) = LOWER(u.user_id) AND (w.tenant_id = u.tenant_id OR w.tenant_id = 'TNT-001' OR w.tenant_id = 'vertex-default'))
        WHERE (u.role = 'CLIENT' OR u.role IS NULL OR u.role = 'USER')
          AND (u.tenant_id = ANY($1) OR $2 = true OR u.tenant_id IS NULL)
      `;

      if (options.search && options.search.trim().length > 0) {
        const q = `%${options.search.trim().toLowerCase()}%`;
        params.push(q);
        sql += ` AND (LOWER(u.user_id) LIKE $${params.length} OR LOWER(u.full_name) LIKE $${params.length} OR LOWER(COALESCE(u.email, '')) LIKE $${params.length} OR u.mobile LIKE $${params.length})`;
      }

      sql += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const res = await pgDb.query(sql, params);

      if (res.rows && res.rows.length > 0) {
        const total = parseInt(res.rows[0].total_count, 10) || res.rows.length;
        const pagedClients = res.rows.map((row: any) => {
          const availBal = Number(row.available_balance || 0);
          const blockedBal = Number(row.blocked_balance || 0);
          const usedMargin = Number(row.used_margin || 0);
          const equity = availBal + usedMargin;

          return {
            id: row.id,
            userId: row.user_id,
            clientCode: row.user_id.toUpperCase(),
            name: row.full_name,
            fullName: row.full_name,
            email: row.email || '',
            phone: row.mobile || '',
            kycStatus: row.is_verified ? 'VERIFIED' : 'PENDING',
            accountStatus: row.status,
            status: row.status,
            role: row.role || 'CLIENT',
            tenantId: row.tenant_id || cleanTenant,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            balance: availBal,
            ledgerBalance: availBal,
            available_balance: availBal,
            wallet_balance: availBal,
            blocked_balance: blockedBal,
            used_margin: usedMargin,
            marginUsed: usedMargin,
            marginAvailable: equity,
            equity,
          };
        });

        return {
          tenant_id: cleanTenant,
          data_state: 'authoritative',
          page,
          limit,
          total,
          clients: pagedClients,
          items: pagedClients,
        };
      }
    } catch {
      // Degraded fallback
    }

    // 2. In-memory fallback if PostgreSQL has 0 rows or is in degraded mode
    const searchTenantsLower = searchTenants.map((t) => t.toLowerCase());
    const allDbUsers = db.getAllUsers();
    let clients = allDbUsers.filter((u) => {
      const uTenant = (u.tenant_id || 'vertex-default').toLowerCase();
      const tenantMatch = isDefault || searchTenantsLower.includes(uTenant) || !u.tenant_id;
      return tenantMatch && (u.role === 'CLIENT' || !u.role || (u.role as string) === 'USER');
    });

    if (clients.length === 0) {
      clients = allDbUsers.filter((u) => u.role === 'CLIENT' || !u.role || (u.role as string) === 'USER');
    }

    if (options.search) {
      const q = options.search.toLowerCase();
      clients = clients.filter(
        (c) =>
          c.user_id.toLowerCase().includes(q) ||
          c.full_name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.mobile && c.mobile.includes(q))
      );
    }

    const total = clients.length;
    const pagedClients = clients.slice(offset, offset + limit).map((c) => {
      const availBal = c.demo_balance !== undefined ? c.demo_balance : 1000000;
      const blockedBal = 0;
      const usedMargin = 0;
      const equity = availBal;

      return {
        id: c.id,
        userId: c.user_id,
        clientCode: c.user_id.toUpperCase(),
        name: c.full_name,
        fullName: c.full_name,
        email: c.email || '',
        phone: c.phone_e164 || c.mobile || '',
        kycStatus: c.is_verified ? 'VERIFIED' : 'PENDING',
        accountStatus: c.status,
        status: c.status,
        role: c.role || 'CLIENT',
        tenantId: c.tenant_id || cleanTenant,
        createdAt: c.created_at,
        balance: availBal,
        ledgerBalance: availBal,
        available_balance: availBal,
        wallet_balance: availBal,
        blocked_balance: blockedBal,
        used_margin: usedMargin,
        marginUsed: usedMargin,
        marginAvailable: equity,
        equity,
      };
    });

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      page,
      limit,
      total,
      clients: pagedClients,
      items: pagedClients,
    };
  }

  /**
   * Paged, tenant-scoped, read-only query for immutable ledger entries backfill.
   */
  public async getLedgerPaged(
    tenantId: string,
    options: { page?: number; limit?: number; userId?: string } = {}
  ) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 250)));
    const offset = (page - 1) * limit;

    let resolvedUserId: string | undefined = undefined;
    if (options.userId) {
      resolvedUserId = await this.resolveTradingUserId(cleanTenant, options.userId);
    }

    let total = 0;
    let ledger: any[] = [];
    try {
      let sql = `SELECT *, COUNT(*) OVER() as total_count FROM trading_ledger_entries WHERE (tenant_id = ANY($1) OR $2 = true)`;
      const params: any[] = [searchTenants, isDefault];

      if (resolvedUserId) {
        params.push(resolvedUserId);
        sql += ` AND user_id = $${params.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const res = await pgDb.query(sql, params);
      if (res.rows && res.rows.length > 0) {
        total = parseInt(res.rows[0].total_count, 10) || res.rows.length;
        ledger = res.rows.map((row: any) => ({
          id: row.id,
          tenant_id: row.tenant_id || cleanTenant,
          user_id: row.user_id,
          transaction_id: row.transaction_id,
          type: row.type,
          category: row.category,
          amount: Number(row.amount),
          balance_before: Number(row.balance_before),
          balance_after: Number(row.balance_after),
          reference: row.reference || '',
          created_by: row.created_by || 'SYSTEM',
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch {
      // Degraded fallback
    }

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      page,
      limit,
      total,
      ledger,
      items: ledger,
    };
  }

  /**
   * Paged, tenant-scoped, read-only query for fund transactions backfill.
   */
  public async getFundsPaged(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      userId?: string;
      type?: 'DEPOSIT' | 'WITHDRAWAL';
      status?: string;
    } = {}
  ) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(1000, Math.max(1, Number(options.limit || 250)));
    const offset = (page - 1) * limit;

    let resolvedUserId: string | undefined = undefined;
    if (options.userId) {
      resolvedUserId = await this.resolveTradingUserId(cleanTenant, options.userId);
    }

    let total = 0;
    let transactions: any[] = [];
    try {
      let sql = `SELECT *, COUNT(*) OVER() as total_count FROM trading_fund_transactions WHERE (tenant_id = ANY($1) OR $2 = true)`;
      const params: any[] = [searchTenants, isDefault];

      if (resolvedUserId) {
        params.push(resolvedUserId);
        sql += ` AND user_id = $${params.length}`;
      }
      if (options.type) {
        params.push(options.type);
        sql += ` AND transaction_type = $${params.length}`;
      }
      if (options.status) {
        params.push(options.status);
        sql += ` AND status = $${params.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const res = await pgDb.query(sql, params);
      if (res.rows && res.rows.length > 0) {
        total = parseInt(res.rows[0].total_count, 10) || res.rows.length;
        transactions = res.rows.map((tx: any) => ({
          id: tx.id,
          transactionId: tx.id,
          clientCode: tx.user_id.toUpperCase(),
          userId: tx.user_id,
          tenantId: tx.tenant_id || cleanTenant,
          amount: Number(tx.amount),
          type: tx.transaction_type,
          method: tx.payment_method || 'BANK_TRANSFER',
          paymentMethod: tx.payment_method || 'BANK_TRANSFER',
          reference: tx.reference_id || tx.id,
          referenceId: tx.reference_id,
          status: tx.status,
          approvedBy: tx.approved_by,
          approvedAt: tx.approved_at ? new Date(tx.approved_at).toISOString() : null,
          rejectedBy: tx.rejected_by,
          rejectedAt: tx.rejected_at ? new Date(tx.rejected_at).toISOString() : null,
          failureReason: tx.failure_reason,
          createdAt: tx.created_at ? new Date(tx.created_at).toISOString() : new Date().toISOString(),
          updatedAt: tx.updated_at ? new Date(tx.updated_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch {
      // Degraded fallback
    }

    return {
      tenant_id: cleanTenant,
      data_state: 'authoritative',
      page,
      limit,
      total,
      funds: transactions,
      transactions,
      items: transactions,
    };
  }

  /**
   * Authoritative list of tenant trading wallets.
   */
  public async getWallets(tenantId: string) {
    const cleanTenant = sanitizeTenant(tenantId) || 'TNT-001';
    const isDefault = isDefaultTenant(cleanTenant);
    const searchTenants = isDefault ? getSearchTenants(cleanTenant) : [cleanTenant];

    try {
      const res = await pgDb.query(
        `SELECT id, tenant_id, user_id, available_balance, blocked_balance, used_margin, realized_pnl, updated_at
         FROM trading_wallets
         WHERE tenant_id = ANY($1) OR $2 = true
         ORDER BY updated_at DESC;`,
        [searchTenants, isDefault]
      );
      const seenUsers = new Set<string>();
      const wallets: any[] = [];
      for (const r of res.rows || []) {
        if (!seenUsers.has(r.user_id)) {
          seenUsers.add(r.user_id);
          wallets.push({
            id: r.id,
            tenant_id: r.tenant_id || cleanTenant,
            user_id: r.user_id,
            available_balance: Number(r.available_balance || 0),
            blocked_balance: Number(r.blocked_balance || 0),
            used_margin: Number(r.used_margin || 0),
            realized_pnl: Number(r.realized_pnl || 0),
            updated_at: r.updated_at,
          });
        }
      }
      return {
        tenant_id: cleanTenant,
        count: wallets.length,
        total: wallets.length,
        data_state: 'authoritative',
        wallets,
      };
    } catch {
      return {
        tenant_id: cleanTenant,
        count: 0,
        total: 0,
        data_state: 'authoritative',
        wallets: [],
      };
    }
  }
}

export const authoritativeTradingDataService = new AuthoritativeTradingDataService();
