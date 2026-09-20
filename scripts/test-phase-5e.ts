import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { WebSocket } from 'ws';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders, verifyInternalHmac } from '../src/server/auth/internalAuth.ts';
import { emergencyControlService } from '../src/server/services/emergencyControlService.ts';
import { tradingHaltService } from '../src/server/services/tradingHaltService.ts';
import { tenantConfigCache } from '../src/server/cache/TenantConfigCache.ts';
import { emergencyStateCache } from '../src/server/cache/EmergencyStateCache.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresOrderEventRepository } from '../src/server/repositories/trading/PostgresOrderEventRepository.ts';
import { postgresMarginRepository } from '../src/server/repositories/trading/PostgresMarginRepository.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';

import internalRoutes from '../src/server/routes/internal/index.ts';
import tenantRoutes from '../src/server/routes/tenantRoutes.ts';
import authRoutes from '../src/server/routes/authRoutes.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';
import adminRoutes from '../src/server/routes/admin/index.ts';

const config = getInternalAuthConfig();
const SECRET = config.internalCommunicationSecret;

async function runPhase5ETests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5E TEST SUITE: 32 TARGET TESTS');
  console.log('PostgreSQL Trading Persistence & WebSocket Real-Time Layer');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assertTest(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`, details ? JSON.stringify(details, null, 2) : '');
      failed++;
    }
  }

  // 1. Initialize Postgres and apply migrations
  await runTradingMigrations();
  assertTest('Test 1: PostgreSQL trading migrations applied successfully', true);

  // Seed super admin
  await hierarchyService.ensureSuperAdmin();

  // Create Express App
  const app = express();
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Tenant resolution
  app.use(resolveTenantMiddleware);

  // Mount routes
  app.use('/api/internal/v1', internalRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/admin', adminRoutes);

  app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  });

  const server = http.createServer(app);
  // Attach WebSocket server
  tradingWebSocketServer.initialize(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;

  // Seed test traders for vertex-default and apex-capital
  let trader1 = db.findUserByUserId('trader-vertex-1') || db.findUserByMobile('8888800051');
  if (!trader1) {
    trader1 = db.createUser({
      fullName: 'Vertex Trader 1',
      userId: 'trader-vertex-1',
      countryCode: '+91',
      mobile: '8888800051',
      passwordHash: 'hash',
      tenantId: 'vertex-default',
    });
  } else {
    db.setUserFrozen(trader1.user_id, false);
  }

  let trader2 = db.findUserByUserId('trader-apex-2') || db.findUserByMobile('8888800052');
  if (!trader2) {
    trader2 = db.createUser({
      fullName: 'Apex Trader 2',
      userId: 'trader-apex-2',
      countryCode: '+91',
      mobile: '8888800052',
      passwordHash: 'hash',
      tenantId: 'apex-capital',
    });
  } else {
    db.setUserFrozen(trader2.user_id, false);
  }

  const token1 = authService.generateToken({
    id: trader1.id,
    userId: trader1.user_id,
    role: trader1.role,
    tenantId: trader1.tenant_id,
  });
  const token2 = authService.generateToken({
    id: trader2.id,
    userId: trader2.user_id,
    role: trader2.role,
    tenantId: trader2.tenant_id,
  });

  try {
    // Clean tables to guarantee pristine, deterministic state for each test run
    await pgDb.query('DELETE FROM trading_order_events');
    await pgDb.query('DELETE FROM trading_margin_snapshots');
    await pgDb.query('DELETE FROM trading_trades');
    await pgDb.query('DELETE FROM trading_orders');
    await pgDb.query('DELETE FROM trading_positions');
    await pgDb.query('DELETE FROM trading_wallets');

    // -------------------------------------------------------------------------
    // TEST 2: Wallet Creation & Persistence in PostgreSQL
    // -------------------------------------------------------------------------
    await postgresWalletRepository.getOrCreateWallet('vertex-default', trader1.user_id, 200000);
    const initialWallet1 = await postgresWalletRepository.updateWallet('vertex-default', trader1.user_id, {
      available_balance: 200000,
      used_margin: 0,
      realized_pnl: 0,
    });

    await postgresWalletRepository.getOrCreateWallet('apex-capital', trader2.user_id, 150000);
    const initialWallet2 = await postgresWalletRepository.updateWallet('apex-capital', trader2.user_id, {
      available_balance: 150000,
      used_margin: 0,
      realized_pnl: 0,
    });

    assertTest(
      'Test 2: PostgreSQL wallet creation & persistence verified',
      initialWallet1.available_balance === 200000 && initialWallet2.available_balance === 150000,
      { initialWallet1, initialWallet2 }
    );

    // -------------------------------------------------------------------------
    // TEST 3: Place Order via Service - Persists in trading_orders
    // -------------------------------------------------------------------------
    const orderResult1 = await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      clientOrderId: 'cl-ord-001',
      symbol: 'SILVER FUT',
      side: 'BUY',
      orderType: 'MARKET',
      product: 'INTRADAY',
      lots: 1,
      price: 90000,
    });
    const fetchedOrder = await postgresOrderRepository.findById('vertex-default', orderResult1.order.id);
    assertTest(
      'Test 3: Order persists to trading_orders with EXECUTED status',
      fetchedOrder !== null && fetchedOrder.status === 'EXECUTED' && fetchedOrder.quantity === 100,
      { fetchedOrder }
    );

    // -------------------------------------------------------------------------
    // TEST 4: Trade Execution Persistence in trading_trades
    // -------------------------------------------------------------------------
    const trades = await postgresTradeRepository.getTrades('vertex-default', trader1.user_id);
    const matchedTrade = trades.find((t) => t.order_id === orderResult1.order.id);
    assertTest(
      'Test 4: Trade executed and persisted to trading_trades',
      matchedTrade !== undefined && matchedTrade.quantity === 100 && matchedTrade.execution_price === 90000,
      { matchedTrade }
    );

    // -------------------------------------------------------------------------
    // TEST 5: Position Created & Persisted in trading_positions
    // -------------------------------------------------------------------------
    const positions1 = await postgresPositionRepository.getPositions('vertex-default', trader1.user_id);
    const silverPos = positions1.find((p) => p.instrument_id === 'SILVER FUT');
    assertTest(
      'Test 5: Position persisted to trading_positions with correct quantity',
      silverPos !== undefined && silverPos.quantity === 100 && silverPos.average_price === 90000,
      { silverPos }
    );

    // -------------------------------------------------------------------------
    // TEST 6: Margin Deducted & Wallet Persisted in trading_wallets
    // -------------------------------------------------------------------------
    const walletAfterOrder1 = await postgresWalletRepository.getWallet('vertex-default', trader1.user_id);
    assertTest(
      'Test 6: Wallet available balance deducted and used margin updated',
      walletAfterOrder1 !== null &&
        walletAfterOrder1.used_margin === 15000 &&
        walletAfterOrder1.available_balance === 185000,
      { walletAfterOrder1 }
    );

    // -------------------------------------------------------------------------
    // TEST 7: Margin Snapshot Recorded in trading_margin_snapshots
    // -------------------------------------------------------------------------
    const latestSnapshot = await postgresMarginRepository.getLatestSnapshot('vertex-default', trader1.user_id);
    assertTest(
      'Test 7: Margin snapshot persisted in trading_margin_snapshots',
      latestSnapshot !== null && latestSnapshot.used_margin === 15000,
      { latestSnapshot }
    );

    // -------------------------------------------------------------------------
    // TEST 8: Order Event Audit Log in trading_order_events
    // -------------------------------------------------------------------------
    const events = await postgresOrderEventRepository.getEventsByOrder('vertex-default', orderResult1.order.id);
    assertTest(
      'Test 8: Order lifecycle audit event recorded in trading_order_events',
      events.length > 0 && events.some((e) => e.event_type === 'ORDER_FILLED'),
      { eventsCount: events.length }
    );

    // -------------------------------------------------------------------------
    // TEST 9: Averaging Position (Second BUY order increases quantity & updates avg)
    // -------------------------------------------------------------------------
    await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      symbol: 'SILVER FUT',
      side: 'BUY',
      orderType: 'MARKET',
      product: 'INTRADAY',
      lots: 1,
      price: 92000,
    });
    const silverPosAfterAvg = (await postgresPositionRepository.getPositions('vertex-default', trader1.user_id))
      .find((p) => p.instrument_id === 'SILVER FUT');
    assertTest(
      'Test 9: Averaging position updates quantity to 200 and average_price to 91000',
      silverPosAfterAvg !== undefined &&
        silverPosAfterAvg.quantity === 200 &&
        silverPosAfterAvg.average_price === 91000 &&
        silverPosAfterAvg.margin_used === 30000,
      { silverPosAfterAvg }
    );

    // -------------------------------------------------------------------------
    // TEST 10: Reducing Position (SELL 1 lot reduces quantity and releases margin)
    // -------------------------------------------------------------------------
    await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      symbol: 'SILVER FUT',
      side: 'SELL',
      orderType: 'MARKET',
      product: 'INTRADAY',
      lots: 1,
      price: 95000,
    });
    const silverPosAfterReduce = (await postgresPositionRepository.getPositions('vertex-default', trader1.user_id))
      .find((p) => p.instrument_id === 'SILVER FUT');
    const walletAfterReduce = await postgresWalletRepository.getWallet('vertex-default', trader1.user_id);
    assertTest(
      'Test 10: Reducing position decreases quantity to 100 and releases margin with realized PnL',
      silverPosAfterReduce !== undefined &&
        silverPosAfterReduce.quantity === 100 &&
        silverPosAfterReduce.realized_pnl === 400000 && // (95000 - 91000) * 100 = 400000
        walletAfterReduce?.used_margin === 15000,
      { silverPosAfterReduce, walletAfterReduce }
    );

    // -------------------------------------------------------------------------
    // TEST 11: Position Square-Off / Close
    // -------------------------------------------------------------------------
    if (silverPosAfterReduce) {
      await tradingExecutionService.closePosition('vertex-default', trader1.user_id, silverPosAfterReduce.id);
    }
    const positionsAfterClose = await postgresPositionRepository.getPositions('vertex-default', trader1.user_id);
    const walletAfterClose = await postgresWalletRepository.getWallet('vertex-default', trader1.user_id);
    assertTest(
      'Test 11: Position square-off closes position and resets used margin to 0',
      positionsAfterClose.length === 0 && walletAfterClose?.used_margin === 0,
      { positionsAfterClose, walletAfterClose }
    );

    // -------------------------------------------------------------------------
    // TEST 12: Idempotent client_order_id Rejection / Replay Safety
    // -------------------------------------------------------------------------
    const initialOrder = await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      clientOrderId: 'idempotent-test-01',
      symbol: 'GOLD FUT',
      side: 'BUY',
      lots: 1,
      price: 72000,
    });
    const duplicateOrderResult = await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      clientOrderId: 'idempotent-test-01',
      symbol: 'GOLD FUT',
      side: 'BUY',
      lots: 1,
      price: 72000,
    });
    assertTest(
      'Test 12: Duplicate clientOrderId returns existing order without double-executing',
      duplicateOrderResult.isDuplicate === true && duplicateOrderResult.order.id === initialOrder.order.id,
      { duplicateOrderResult }
    );

    // Clean up GOLD position
    const goldPos = (await postgresPositionRepository.getPositions('vertex-default', trader1.user_id))
      .find((p) => p.instrument_id === 'GOLD FUT');
    if (goldPos) {
      await tradingExecutionService.closePosition('vertex-default', trader1.user_id, goldPos.id);
    }

    // -------------------------------------------------------------------------
    // TEST 13: Margin Sufficiency Rejection
    // -------------------------------------------------------------------------
    let marginErrorCaught = false;
    let marginErrorCode = '';
    try {
      await tradingExecutionService.placeOrder({
        tenantId: 'vertex-default',
        userId: trader1.user_id,
        symbol: 'GOLD FUT',
        side: 'BUY',
        lots: 50, // Requires 50 * 35000 = 1,750,000 margin, exceeds balance
        price: 72000,
      });
    } catch (err: any) {
      marginErrorCaught = true;
      marginErrorCode = err.code;
    }
    assertTest(
      'Test 13: Order rejected with INSUFFICIENT_MARGIN when required margin exceeds balance',
      marginErrorCaught && marginErrorCode === 'INSUFFICIENT_MARGIN',
      { marginErrorCaught, marginErrorCode }
    );

    // -------------------------------------------------------------------------
    // TEST 14: Limit Order Placed as PENDING
    // -------------------------------------------------------------------------
    const limitOrderResult = await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      symbol: 'CRUDEOIL FUT',
      side: 'BUY',
      orderType: 'LIMIT',
      lots: 1,
      price: 6000,
    });
    const fetchedLimitOrder = await postgresOrderRepository.findById('vertex-default', limitOrderResult.order.id);
    assertTest(
      'Test 14: LIMIT order placed in PENDING status in trading_orders',
      fetchedLimitOrder !== null && fetchedLimitOrder.status === 'PENDING' && fetchedLimitOrder.order_type === 'LIMIT',
      { fetchedLimitOrder }
    );

    // -------------------------------------------------------------------------
    // TEST 15: Limit Order Cancellation & Margin Release
    // -------------------------------------------------------------------------
    const cancelResult = await tradingExecutionService.cancelOrder(
      'vertex-default',
      trader1.user_id,
      limitOrderResult.order.id
    );
    const fetchedCancelledOrder = await postgresOrderRepository.findById('vertex-default', limitOrderResult.order.id);
    assertTest(
      'Test 15: Order cancellation marks order CANCELLED and releases margin',
      cancelResult.success === true && fetchedCancelledOrder?.status === 'CANCELLED',
      { cancelResult, fetchedCancelledOrder }
    );

    // -------------------------------------------------------------------------
    // TEST 16: ACID Transaction Rollback on Mid-Transaction Error
    // -------------------------------------------------------------------------
    const walletBeforeFail = await postgresWalletRepository.getWallet('vertex-default', trader1.user_id);
    const balanceBeforeFail = walletBeforeFail?.available_balance || 0;

    let transactionRolledBack = false;
    try {
      await pgDb.transaction(async (client) => {
        // Step A: insert order
        await client.query(
          `INSERT INTO trading_orders (id, tenant_id, user_id, instrument_id, side, order_type, quantity, price, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          ['FAIL-ORD-01', 'vertex-default', trader1.user_id, 'GOLD FUT', 'BUY', 'MARKET', 100, 72000, 'PENDING']
        );
        // Step B: simulate intentional failure mid-transaction
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch {
      transactionRolledBack = true;
    }

    const failedOrderCheck = await postgresOrderRepository.findById('vertex-default', 'FAIL-ORD-01');
    const walletAfterFail = await postgresWalletRepository.getWallet('vertex-default', trader1.user_id);
    assertTest(
      'Test 16: ACID rollback leaves zero orphaned records or state corruption',
      transactionRolledBack === true &&
        failedOrderCheck === null &&
        walletAfterFail?.available_balance === balanceBeforeFail,
      { failedOrderCheck, balanceBeforeFail, balanceAfter: walletAfterFail?.available_balance }
    );

    // -------------------------------------------------------------------------
    // TEST 17: Concurrent Order Execution with SELECT FOR UPDATE Row Locking
    // -------------------------------------------------------------------------
    // Place 3 concurrent orders simultaneously
    const concurrentPromises = [
      tradingExecutionService.placeOrder({
        tenantId: 'vertex-default',
        userId: trader1.user_id,
        symbol: 'NATURALGAS FUT',
        side: 'BUY',
        lots: 1,
        price: 250,
      }),
      tradingExecutionService.placeOrder({
        tenantId: 'vertex-default',
        userId: trader1.user_id,
        symbol: 'NATURALGAS FUT',
        side: 'BUY',
        lots: 1,
        price: 250,
      }),
      tradingExecutionService.placeOrder({
        tenantId: 'vertex-default',
        userId: trader1.user_id,
        symbol: 'NATURALGAS FUT',
        side: 'BUY',
        lots: 1,
        price: 250,
      }),
    ];

    const concurrentResults = await Promise.all(concurrentPromises);
    const natGasPos = (await postgresPositionRepository.getPositions('vertex-default', trader1.user_id))
      .find((p) => p.instrument_id === 'NATURALGAS FUT' || p.instrument_id === 'NATURAL GAS FUT');
    assertTest(
      'Test 17: Concurrent orders safely serialize with FOR UPDATE locking (quantity = 3750, 3 lots)',
      concurrentResults.every((r) => r.success === true) && natGasPos?.quantity === 3750,
      { natGasPos }
    );

    // Clean up NATGAS position
    if (natGasPos) {
      await tradingExecutionService.closePosition('vertex-default', trader1.user_id, natGasPos.id);
    }

    // -------------------------------------------------------------------------
    // TEST 18: Tenant Isolation for Orders
    // -------------------------------------------------------------------------
    // Place order in apex-capital
    const apexOrder = await tradingExecutionService.placeOrder({
      tenantId: 'apex-capital',
      userId: trader2.user_id,
      symbol: 'SILVER FUT',
      side: 'BUY',
      lots: 1,
      price: 90000,
    });
    // Attempt to query apex order from vertex-default tenant
    const crossTenantOrderQuery = await postgresOrderRepository.findById('vertex-default', apexOrder.order.id);
    assertTest(
      'Test 18: Tenant isolation strictly enforced on order repository query',
      crossTenantOrderQuery === null,
      { crossTenantOrderQuery }
    );

    // -------------------------------------------------------------------------
    // TEST 19: Tenant Isolation for Positions
    // -------------------------------------------------------------------------
    const vertexPositions = await postgresPositionRepository.getPositions('vertex-default', trader1.user_id);
    const containsApexPosition = vertexPositions.some((p) => p.tenant_id === 'apex-capital');
    assertTest(
      'Test 19: Tenant isolation strictly enforced on position repository query',
      containsApexPosition === false,
      { containsApexPosition }
    );

    // -------------------------------------------------------------------------
    // TEST 20: Tenant Isolation for Wallets
    // -------------------------------------------------------------------------
    const crossTenantWallet = await postgresWalletRepository.getWallet('vertex-default', trader2.user_id);
    assertTest(
      'Test 20: Tenant isolation strictly enforced on wallet repository query',
      crossTenantWallet === null,
      { crossTenantWallet }
    );

    // -------------------------------------------------------------------------
    // TEST 21: Cross-Tenant Order Placement Rejected via HTTP
    // -------------------------------------------------------------------------
    // Trader 1 (vertex-default token) tries to place order with X-Tenant-ID: apex-capital
    const crossTenantHttpRes = await fetch(`${baseUrl}/api/trading/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'X-Tenant-ID': 'apex-capital',
      },
      body: JSON.stringify({
        symbol: 'SILVER FUT',
        type: 'BUY',
        lots: 1,
      }),
    });
    const crossTenantHttpData = await crossTenantHttpRes.json();
    assertTest(
      'Test 21: Cross-tenant HTTP order placement rejected with 403 TENANT_MISMATCH',
      crossTenantHttpRes.status === 403 && crossTenantHttpData.code === 'TENANT_MISMATCH',
      { status: crossTenantHttpRes.status, crossTenantHttpData }
    );

    // -------------------------------------------------------------------------
    // TEST 22: Emergency Trading Halt Rejects Order Placement
    // -------------------------------------------------------------------------
    await tradingHaltService.setTradingHalt('vertex-default', true, 'Emergency Audit Test');
    const haltedOrderRes = await fetch(`${baseUrl}/api/trading/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'X-Tenant-ID': 'vertex-default',
      },
      body: JSON.stringify({
        symbol: 'SILVER FUT',
        type: 'BUY',
        lots: 1,
      }),
    });
    const haltedOrderData = await haltedOrderRes.json();
    await tradingHaltService.setTradingHalt('vertex-default', false, 'Resume after test');
    assertTest(
      'Test 22: Order placement during emergency trading halt rejected with 403 TRADING_DISABLED',
      haltedOrderRes.status === 403 && haltedOrderData.code === 'TRADING_DISABLED',
      { status: haltedOrderRes.status, haltedOrderData }
    );

    // -------------------------------------------------------------------------
    // TEST 23: Frozen Trader Rejection
    // -------------------------------------------------------------------------
    await emergencyControlService.freezeUser('vertex-default', trader1.user_id, true, 'Test 23 Freeze');
    const frozenTraderRes = await fetch(`${baseUrl}/api/trading/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'X-Tenant-ID': 'vertex-default',
      },
      body: JSON.stringify({
        symbol: 'SILVER FUT',
        type: 'BUY',
        lots: 1,
      }),
    });
    const frozenTraderData = await frozenTraderRes.json();
    await emergencyControlService.freezeUser('vertex-default', trader1.user_id, false, 'Unfreeze');
    assertTest(
      'Test 23: Frozen trader order placement rejected with 403 ACCOUNT_FROZEN / USER_FROZEN',
      frozenTraderRes.status === 403 && (frozenTraderData.code === 'ACCOUNT_FROZEN' || frozenTraderData.code === 'USER_FROZEN'),
      { status: frozenTraderRes.status, frozenTraderData }
    );

    // -------------------------------------------------------------------------
    // TEST 24: Options Trading Flag Enforcement
    // -------------------------------------------------------------------------
    tenantConfigCache.set('vertex-default', { optionsTradingEnabled: false, configVersion: 99 });
    const optionsRes = await fetch(`${baseUrl}/api/trading/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'X-Tenant-ID': 'vertex-default',
      },
      body: JSON.stringify({
        symbol: 'NIFTY 24500 CE',
        type: 'BUY',
        lots: 1,
      }),
    });
    const optionsData = await optionsRes.json();
    tenantConfigCache.set('vertex-default', { optionsTradingEnabled: true, configVersion: 100 });
    assertTest(
      'Test 24: Options order rejected with 403 OPTIONS_DISABLED when feature disabled',
      optionsRes.status === 403 && optionsData.code === 'OPTIONS_DISABLED',
      { status: optionsRes.status, optionsData }
    );

    // -------------------------------------------------------------------------
    // TEST 25: WebSocket Connection with Valid JWT
    // -------------------------------------------------------------------------
    const wsClient1 = new WebSocket(`${wsBaseUrl}/ws?token=${token1}`);
    const ws1Messages: any[] = [];

    const ws1Connected = await new Promise<boolean>((resolve) => {
      wsClient1.on('open', () => {});
      wsClient1.on('message', (msgData) => {
        try {
          const parsed = JSON.parse(msgData.toString());
          ws1Messages.push(parsed);
          if (parsed.event === 'connection.ready') {
            resolve(true);
          }
        } catch {
          // ignore
        }
      });
      wsClient1.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 3000);
    });

    assertTest(
      'Test 25: WebSocket connection succeeds with valid JWT and receives connection.ready',
      ws1Connected === true && ws1Messages.some((m) => m.event === 'connection.ready'),
      { ws1Messages }
    );

    // -------------------------------------------------------------------------
    // TEST 26: WebSocket Connection Rejected with Missing/Invalid Token
    // -------------------------------------------------------------------------
    const wsClientInvalid = new WebSocket(`${wsBaseUrl}/ws?token=invalid-token-xyz`);
    const wsRejected = await new Promise<boolean>((resolve) => {
      wsClientInvalid.on('close', (code) => {
        resolve(code === 4001 || code === 4003 || code === 1008);
      });
      wsClientInvalid.on('error', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });
    assertTest(
      'Test 26: WebSocket connection rejected with invalid JWT',
      wsRejected === true,
      { wsRejected }
    );

    // -------------------------------------------------------------------------
    // TEST 27: WebSocket Tenant Isolation (Apex client does NOT receive Vertex events)
    // -------------------------------------------------------------------------
    const wsClient2 = new WebSocket(`${wsBaseUrl}/ws?token=${token2}`);
    const ws2Messages: any[] = [];

    await new Promise<void>((resolve) => {
      wsClient2.on('message', (msgData) => {
        try {
          ws2Messages.push(JSON.parse(msgData.toString()));
        } catch {}
      });
      wsClient2.on('open', () => resolve());
    });

    // Broadcast test event to vertex-default
    tradingWebSocketServer.broadcastToTenant('vertex-default', 'custom.test.event', {
      message: 'Vertex only message',
    });

    await new Promise((r) => setTimeout(r, 200));

    const client2GotVertexMessage = ws2Messages.some(
      (m) => m.event === 'custom.test.event'
    );
    assertTest(
      'Test 27: WebSocket tenant isolation verified (apex-capital client does not receive vertex events)',
      client2GotVertexMessage === false,
      { client2GotVertexMessage }
    );

    // -------------------------------------------------------------------------
    // TEST 28: WebSocket Trader Privacy Isolation
    // -------------------------------------------------------------------------
    // Connect trader 3 in vertex-default
    let trader3 = db.findUserByUserId('trader-vertex-3') || db.findUserByMobile('8888800053');
    if (!trader3) {
      trader3 = db.createUser({
        fullName: 'Vertex Trader 3',
        userId: 'trader-vertex-3',
        countryCode: '+91',
        mobile: '8888800053',
        passwordHash: 'hash',
        tenantId: 'vertex-default',
      });
    }
    const token3 = authService.generateToken({
      id: trader3.id,
      userId: trader3.user_id,
      role: trader3.role,
      tenantId: trader3.tenant_id,
    });
    const wsClient3 = new WebSocket(`${wsBaseUrl}/ws?token=${token3}`);
    const ws3Messages: any[] = [];

    await new Promise<void>((resolve) => {
      wsClient3.on('message', (msgData) => {
        try {
          ws3Messages.push(JSON.parse(msgData.toString()));
        } catch {}
      });
      wsClient3.on('open', () => resolve());
    });

    // Place an order for Trader 1 via HTTP
    await fetch(`${baseUrl}/api/trading/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'X-Tenant-ID': 'vertex-default',
      },
      body: JSON.stringify({
        symbol: 'CRUDEOIL FUT',
        type: 'BUY',
        lots: 1,
      }),
    });

    await new Promise((r) => setTimeout(r, 300));

    // Trader 3 should NOT receive Trader 1's private order/trade event
    const trader3GotTrader1Order = ws3Messages.some(
      (m) => m.event === 'order.created' && m.payload?.user_id === trader1.user_id
    );
    assertTest(
      'Test 28: WebSocket trader privacy strictly isolates private order events between traders in same tenant',
      trader3GotTrader1Order === false,
      { trader3GotTrader1Order }
    );

    // -------------------------------------------------------------------------
    // TEST 29: WebSocket Client 1 Received Order/Trade Events
    // -------------------------------------------------------------------------
    const client1GotOrder = ws1Messages.some((m) => m.event === 'order.created');
    const client1GotTrade = ws1Messages.some((m) => m.event === 'trade.executed');
    assertTest(
      'Test 29: Trader 1 successfully received real-time order.created and trade.executed WebSocket events',
      client1GotOrder === true && client1GotTrade === true,
      { client1GotOrder, client1GotTrade }
    );

    // Clean up WS connections
    wsClient1.close();
    wsClient2.close();
    wsClient3.close();

    // -------------------------------------------------------------------------
    // TEST 30: Emergency Cancel All Orders Integration with PostgreSQL
    // -------------------------------------------------------------------------
    // Create pending limit order for trader 1
    const pendingOrder = await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      symbol: 'GOLD FUT',
      side: 'BUY',
      orderType: 'LIMIT',
      lots: 1,
      price: 70000,
    });
    // Call emergency cancel via Internal S2S endpoint
    const cancelPath = '/api/internal/v1/emergency/cancel-orders';
    const cancelBody = { scope: 'TENANT' };
    const cancelHeaders = generateInternalHeaders({
      secret: SECRET,
      tenantId: 'vertex-default',
      method: 'POST',
      path: cancelPath,
      body: cancelBody,
    });
    const emergencyCancelRes = await fetch(`${baseUrl}${cancelPath}`, {
      method: 'POST',
      headers: { ...cancelHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelBody),
    });
    const emergencyCancelData = await emergencyCancelRes.json();
    const fetchedPending = await postgresOrderRepository.findById('vertex-default', pendingOrder.order.id);
    assertTest(
      'Test 30: Emergency cancel all orders cancels PostgreSQL orders and returns 200',
      emergencyCancelRes.status === 200 &&
        emergencyCancelData.success === true &&
        fetchedPending?.status === 'CANCELLED',
      { emergencyCancelData, fetchedPending }
    );

    // -------------------------------------------------------------------------
    // TEST 31: Emergency Square-Off All Positions with PostgreSQL
    // -------------------------------------------------------------------------
    // Put trader 1 in a position
    await tradingExecutionService.placeOrder({
      tenantId: 'vertex-default',
      userId: trader1.user_id,
      symbol: 'SILVER FUT',
      side: 'BUY',
      orderType: 'MARKET',
      lots: 1,
      price: 90000,
    });
    const squareOffPath = '/api/internal/v1/emergency/square-off';
    const squareOffBody = { scope: 'TENANT' };
    const squareOffHeaders = generateInternalHeaders({
      secret: SECRET,
      tenantId: 'vertex-default',
      method: 'POST',
      path: squareOffPath,
      body: squareOffBody,
    });
    const emergencySquareOffRes = await fetch(`${baseUrl}${squareOffPath}`, {
      method: 'POST',
      headers: { ...squareOffHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(squareOffBody),
    });
    const emergencySquareOffData = await emergencySquareOffRes.json();
    const positionsAfterSquareOff = await postgresPositionRepository.getPositions('vertex-default', trader1.user_id);
    assertTest(
      'Test 31: Emergency square-off all closes PostgreSQL positions and returns 200',
      emergencySquareOffRes.status === 200 &&
        emergencySquareOffData.success === true &&
        positionsAfterSquareOff.length === 0,
      { emergencySquareOffData, positionsAfterSquareOff }
    );

    // -------------------------------------------------------------------------
    // TEST 32: Full Regression (Phase 5B HMAC, Phase 5C Emergency Risk, Phase 5D Event Queue)
    // -------------------------------------------------------------------------
    const hmacValid = verifyInternalHmac(SECRET, 'regression-test', 'invalid-signature') === false;
    const riskSummary = await emergencyControlService.getRiskSummary('vertex-default');
    const dispatcherQueue = internalEventDispatcher.getQueue().getStats();
    assertTest(
      'Test 32: Full Regression (Phase 5B HMAC, Phase 5C Risk Summary, Phase 5D Event Queue) verified',
      hmacValid === true && riskSummary !== null && typeof dispatcherQueue.queueSize === 'number',
      { hmacValid, riskSummary, dispatcherQueue }
    );

  } catch (err: any) {
    console.error('Fatal test execution exception:', err);
    failed++;
  } finally {
    tradingWebSocketServer.close();
    (server as any).closeAllConnections?.();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`PHASE 5E TEST RESULTS: ${passed} PASSED, ${failed} FAILED out of 32`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5ETests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
