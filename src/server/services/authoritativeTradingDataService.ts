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

export function isDefaultTenant(tenantId?: string | null): boolean {
  if (!tenantId) return true;
  const t = tenantId.trim().toLowerCase();
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
  const norm = (tenantId || '').trim();
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
    const searchTenants = getSearchTenants(tenantId);

    // 1. Direct check in User table
    const directUser = db.findUserByUserId(trimmed) || db.findUserById(trimmed);
    if (directUser) {
      const uTenant = directUser.tenant_id || 'vertex-default';
      if (
        uTenant.toLowerCase() === tenantId.toLowerCase() ||
        isDefaultTenant(tenantId) ||
        isDefaultTenant(uTenant)
      ) {
        return directUser.user_id;
      }
    }

    // 2. Check mapping table across search tenants
    for (const t of searchTenants) {
      const byExtId = await postgresClientMappingRepository.findByExternalClientId(t, trimmed);
      if (byExtId) return byExtId.trading_user_id;

      const byExtCode = await postgresClientMappingRepository.findByExternalClientCode(t, trimmed);
      if (byExtCode) return byExtCode.trading_user_id;

      const byTradeId = await postgresClientMappingRepository.findByTradingUserId(t, trimmed);
      if (byTradeId) return byTradeId.trading_user_id;
    }

    return trimmed;
  }

  /**
   * GET /trading/summary
   */
  public async getTradingSummary(tenantId: string) {
    const ordersRes = await this.getOrders(tenantId);
    const tradesRes = await this.getTrades(tenantId);
    const positionsRes = await this.getPositions(tenantId);

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

    // Get tenant users count across search tenants
    const searchTenants = getSearchTenants(tenantId).map((t) => t.toLowerCase());
    let allUsers = db.getAllUsers().filter((u) => searchTenants.includes((u.tenant_id || 'vertex-default').toLowerCase()) || !u.tenant_id);
    if (allUsers.length === 0 && isDefaultTenant(tenantId)) {
      allUsers = db.getAllUsers();
    }
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u) => u.status === 'active' || u.status === 'ACTIVE').length;

    const emergencyStatus = emergencyStateCache.get(tenantId);

    return {
      tenant_id: tenantId,
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
  public async getOrders(tenantId: string, options: { userId?: string; status?: string } = {}) {
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(tenantId, options.userId) : undefined;
    let orders = await postgresOrderRepository.getOrders(tenantId, resolvedUserId, options.status);

    if (isDefaultTenant(tenantId) || orders.length === 0) {
      const searchTenants = getSearchTenants(tenantId).filter((t) => t.toLowerCase() !== tenantId.toLowerCase());
      const seenIds = new Set(orders.map((o) => o.id));
      for (const st of searchTenants) {
        const fallbackOrders = await postgresOrderRepository.getOrders(st, resolvedUserId, options.status);
        for (const fo of fallbackOrders) {
          if (!seenIds.has(fo.id)) {
            seenIds.add(fo.id);
            orders.push(fo);
          }
        }
      }
    }

    return {
      tenant_id: tenantId,
      count: orders.length,
      data_state: 'authoritative',
      orders: orders.map((o) => ({
        id: o.id,
        order_id: o.id,
        tenant_id: o.tenant_id,
        user_id: o.user_id,
        client_order_id: o.client_order_id,
        symbol: o.instrument_id,
        instrument_id: o.instrument_id,
        side: o.side,
        order_type: o.order_type,
        quantity: o.quantity,
        price: o.price,
        trigger_price: o.trigger_price,
        status: o.status,
        normalized_status: o.normalized_status || o.status,
        filled_quantity: o.filled_quantity,
        remaining_quantity: o.remaining_quantity,
        average_fill_price: o.average_fill_price,
        time_in_force: o.time_in_force,
        broker_order_id: o.broker_order_id,
        created_at: o.created_at,
        updated_at: o.updated_at,
        cancelled_at: o.cancelled_at,
      })),
    };
  }

  /**
   * GET /trading/trades
   */
  public async getTrades(tenantId: string, options: { userId?: string; orderId?: string } = {}) {
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(tenantId, options.userId) : undefined;
    let trades = await postgresTradeRepository.getTrades(tenantId, resolvedUserId);

    if (isDefaultTenant(tenantId) || trades.length === 0) {
      const searchTenants = getSearchTenants(tenantId).filter((t) => t.toLowerCase() !== tenantId.toLowerCase());
      const seenIds = new Set(trades.map((t) => t.id));
      for (const st of searchTenants) {
        const fallbackTrades = await postgresTradeRepository.getTrades(st, resolvedUserId);
        for (const ft of fallbackTrades) {
          if (!seenIds.has(ft.id)) {
            seenIds.add(ft.id);
            trades.push(ft);
          }
        }
      }
    }

    if (options.orderId) {
      trades = trades.filter((t) => t.order_id === options.orderId);
    }

    return {
      tenant_id: tenantId,
      count: trades.length,
      data_state: 'authoritative',
      trades: trades.map((t: any) => ({
        id: t.id,
        trade_id: t.id,
        tenant_id: t.tenant_id,
        user_id: t.user_id,
        order_id: t.order_id,
        symbol: t.symbol || t.instrument_id,
        instrument_id: t.instrument_id,
        exchange: t.exchange || 'NSE',
        side: t.side,
        quantity: t.quantity,
        price: t.execution_price,
        execution_price: t.execution_price,
        total_value: t.execution_value,
        execution_value: t.execution_value,
        fees: Number(t.fees || 0),
        commission: Number(t.commission || 0),
        realized_pnl: t.realized_pnl,
        status: t.status || 'EXECUTED',
        executed_at: t.executed_at,
        created_at: t.created_at,
      })),
    };
  }

  /**
   * GET /trading/positions
   */
  public async getPositions(tenantId: string, options: { userId?: string; status?: string } = {}) {
    const resolvedUserId = options.userId ? await this.resolveTradingUserId(tenantId, options.userId) : undefined;
    let positions = await postgresPositionRepository.getPositions(tenantId, resolvedUserId);

    if (isDefaultTenant(tenantId) || positions.length === 0) {
      const searchTenants = getSearchTenants(tenantId).filter((t) => t.toLowerCase() !== tenantId.toLowerCase());
      const seenKeys = new Set(positions.map((p) => `${p.user_id}_${p.instrument_id}`));
      for (const st of searchTenants) {
        const fallbackPositions = await postgresPositionRepository.getPositions(st, resolvedUserId);
        for (const fp of fallbackPositions) {
          const key = `${fp.user_id}_${fp.instrument_id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            positions.push(fp);
          }
        }
      }
    }

    if (options.status === 'OPEN') {
      positions = positions.filter((p) => Number(p.quantity) !== 0);
    } else if (options.status === 'CLOSED') {
      positions = positions.filter((p) => Number(p.quantity) === 0);
    }

    return {
      tenant_id: tenantId,
      count: positions.length,
      data_state: 'authoritative',
      positions: positions.map((p: any) => {
        const qty = Number(p.quantity);
        const side = qty > 0 ? 'BUY' : qty < 0 ? 'SELL' : 'CLOSED';
        const absQty = Math.abs(qty);
        const avgPrice = Number(p.average_price);
        const unrealizedPnl = Number(p.unrealized_pnl || 0);
        const totalInvested = avgPrice * absQty;
        const unrealizedPnlPct = totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;
        const currentPrice = absQty > 0 ? avgPrice + unrealizedPnl / absQty : avgPrice;

        return {
          id: p.id,
          position_id: p.id,
          tenant_id: p.tenant_id,
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
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_percentage: Number(unrealizedPnlPct.toFixed(2)),
          realized_pnl: Number(p.realized_pnl || 0),
          status: qty !== 0 ? 'OPEN' : 'CLOSED',
          updated_at: p.updated_at,
        };
      }),
    };
  }

  /**
   * GET /trading/risk-summary & GET /risk/summary
   */
  public async getRiskSummary(tenantId: string) {
    const positionsRes = await this.getPositions(tenantId);
    const positions = positionsRes.positions;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    const totalUsedMargin = openPositions.reduce((sum: number, p: any) => sum + Number(p.used_margin || 0), 0);
    const totalUnrealizedPnl = openPositions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const totalExposure = openPositions.reduce(
      (sum: number, p: any) => sum + Math.abs(Number(p.quantity)) * Number(p.average_price),
      0
    );

    // Get all wallets for tenant and default fallbacks
    const searchTenants = getSearchTenants(tenantId);
    const walletsRes = await pgDb.query(
      `SELECT available_balance, blocked_balance, used_margin, user_id FROM trading_wallets WHERE tenant_id = ANY($1)`,
      [searchTenants]
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
    const emergencyStatus = emergencyStateCache.get(tenantId);

    return {
      tenant_id: tenantId,
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
    const searchTenants = getSearchTenants(tenantId).map((t) => t.toLowerCase());
    let allUsers = db.getAllUsers().filter((u) => searchTenants.includes((u.tenant_id || 'vertex-default').toLowerCase()) || !u.tenant_id);
    if (allUsers.length === 0 && isDefaultTenant(tenantId)) {
      allUsers = db.getAllUsers();
    }
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u) => u.status === 'active' || u.status === 'ACTIVE').length;

    const positionsRes = await this.getPositions(tenantId);
    const positions = positionsRes.positions;
    const openPositions = positions.filter((p: any) => Number(p.quantity) !== 0);

    const tradesRes = await this.getTrades(tenantId);
    const trades = tradesRes.trades;
    const totalTurnover = trades.reduce((sum: number, t: any) => sum + Number(t.execution_value || 0), 0);
    const commissionEarned = trades.reduce((sum: number, t: any) => sum + Number(t.commission || 0), 0);
    const feesEarned = trades.reduce((sum: number, t: any) => sum + Number(t.fees || 0), 0);

    const realizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.realized_pnl || 0), 0);
    const unrealizedPnl = positions.reduce((sum: number, p: any) => sum + Number(p.unrealized_pnl || 0), 0);
    const netPnl = realizedPnl + unrealizedPnl;

    const walletsRes = await pgDb.query(
      `SELECT available_balance, blocked_balance, used_margin, user_id FROM trading_wallets WHERE tenant_id = ANY($1)`,
      [getSearchTenants(tenantId)]
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
    const pendingDeposits = await postgresFundTransactionRepository.getByTenant(tenantId, undefined, 'DEPOSIT', 'PENDING');
    const pendingWithdrawals = await postgresFundTransactionRepository.getByTenant(tenantId, undefined, 'WITHDRAWAL', 'PENDING');

    const pendingDepositAmount = pendingDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);

    return {
      tenant_id: tenantId,
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
    // 1. Automatically ensure client mappings and wallets are backfilled
    try {
      const { postgresClientMappingRepository: mappingRepo } = await import('../repositories/PostgresClientMappingRepository.ts');
      await mappingRepo.backfillClientMappingsAndWallets(tenantId);
    } catch (e: any) {
      console.warn('[AuthoritativeTradingDataService] Backfill notice in getClientsPaged:', e.message);
    }

    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const offset = (page - 1) * limit;

    const searchTenants = getSearchTenants(tenantId).map((t) => t.toLowerCase());

    // Gather from db
    const allDbUsers = db.getAllUsers();
    let clients = allDbUsers.filter((u) => {
      const uTenant = (u.tenant_id || 'vertex-default').toLowerCase();
      const tenantMatch = searchTenants.includes(uTenant) || !u.tenant_id || isDefaultTenant(tenantId);
      return tenantMatch && (u.role === 'CLIENT' || !u.role);
    });

    // Also gather from PostgreSQL users table
    try {
      const pgRes = await pgDb.query(
        `SELECT id, user_id, full_name, email, mobile, country_code, role, status, is_verified, tenant_id, created_at
         FROM users
         WHERE (UPPER(role) = 'CLIENT' OR role IS NULL);`
      );
      const existingUserIds = new Set(clients.map((c) => c.user_id.toLowerCase()));
      for (const row of pgRes.rows || []) {
        const norm = row.user_id.toLowerCase();
        if (!existingUserIds.has(norm)) {
          const rowTenant = (row.tenant_id || 'vertex-default').toLowerCase();
          if (searchTenants.includes(rowTenant) || isDefaultTenant(tenantId)) {
            existingUserIds.add(norm);
            clients.push({
              id: row.id,
              user_id: row.user_id,
              full_name: row.full_name,
              country_code: row.country_code || '+91',
              mobile: row.mobile || '',
              phone_e164: row.mobile,
              email: row.email || '',
              password_hash: '',
              role: 'CLIENT',
              is_verified: row.is_verified !== false,
              status: row.status || 'active',
              tenant_id: row.tenant_id || tenantId,
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Non-blocking
    }

    // Fallback: If 0 clients found, return ALL clients
    if (clients.length === 0) {
      clients = allDbUsers.filter((u) => u.role === 'CLIENT' || !u.role);
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
    const pagedClients = clients.slice(offset, offset + limit).map((c) => ({
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
      tenantId: c.tenant_id || tenantId,
      createdAt: c.created_at,
    }));

    return {
      tenant_id: tenantId,
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
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const offset = (page - 1) * limit;

    let entries: any[] = [];
    if (options.userId) {
      const resolvedUserId = await this.resolveTradingUserId(tenantId, options.userId);
      entries = await postgresLedgerRepository.getByUserId(resolvedUserId, tenantId);
      if (entries.length === 0 && isDefaultTenant(tenantId)) {
        for (const st of getSearchTenants(tenantId)) {
          const fbEntries = await postgresLedgerRepository.getByUserId(resolvedUserId, st);
          if (fbEntries.length > 0) {
            entries = fbEntries;
            break;
          }
        }
      }
    } else {
      entries = await postgresLedgerRepository.getAll(tenantId);
      if (entries.length === 0 && isDefaultTenant(tenantId)) {
        entries = await postgresLedgerRepository.getAll();
      }
    }

    const total = entries.length;
    const paged = entries.slice(offset, offset + limit);

    return {
      tenant_id: tenantId,
      data_state: 'authoritative',
      page,
      limit,
      total,
      ledger: paged,
      items: paged,
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
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const offset = (page - 1) * limit;

    let resolvedUserId: string | undefined = undefined;
    if (options.userId) {
      resolvedUserId = await this.resolveTradingUserId(tenantId, options.userId);
    }

    let transactions = await postgresFundTransactionRepository.getByTenant(
      tenantId,
      resolvedUserId,
      options.type,
      options.status
    );

    if (transactions.length === 0 && isDefaultTenant(tenantId)) {
      const seenIds = new Set<string>();
      for (const st of getSearchTenants(tenantId)) {
        const fbTx = await postgresFundTransactionRepository.getByTenant(
          st,
          resolvedUserId,
          options.type,
          options.status
        );
        for (const tx of fbTx) {
          if (!seenIds.has(tx.id)) {
            seenIds.add(tx.id);
            transactions.push(tx);
          }
        }
      }
    }

    const total = transactions.length;
    const paged = transactions.slice(offset, offset + limit).map((tx) => ({
      id: tx.id,
      transactionId: tx.id,
      clientCode: tx.user_id.toUpperCase(),
      userId: tx.user_id,
      tenantId: tx.tenant_id,
      amount: tx.amount,
      type: tx.transaction_type,
      method: tx.payment_method,
      paymentMethod: tx.payment_method,
      reference: tx.reference_id || tx.id,
      referenceId: tx.reference_id,
      status: tx.status,
      approvedBy: tx.approved_by,
      approvedAt: tx.approved_at,
      rejectedBy: tx.rejected_by,
      rejectedAt: tx.rejected_at,
      failureReason: tx.failure_reason,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
    }));

    return {
      tenant_id: tenantId,
      data_state: 'authoritative',
      page,
      limit,
      total,
      funds: paged,
      transactions: paged,
      items: paged,
    };
  }
}

export const authoritativeTradingDataService = new AuthoritativeTradingDataService();
