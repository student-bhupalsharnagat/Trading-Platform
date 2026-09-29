/**
 * Comprehensive Production-Readiness Integration Test Suite
 * Validates the exact 14 points requested:
 * 1. Create/login a CLIENT.
 * 2. Verify tenantId and trading user identity.
 * 3. Execute one BUY trade.
 * 4. Verify trade, order, position and wallet are persisted in PostgreSQL.
 * 5. Verify the Central Admin event contains: client identity, tradeId, orderId, symbol, side, quantity, execution price, execution value, and timestamp.
 * 6. Verify position.updated data.
 * 7. Create a deposit.
 * 8. Verify deposit is PENDING in authoritative fund transaction table.
 * 9. Create a withdrawal.
 * 10. Verify withdrawal is PENDING in authoritative fund transaction table.
 * 11. Verify approval/rejection events are generated.
 * 12. Verify no password, JWT, cookie or secret is included in events.
 * 13. Verify duplicate event delivery is idempotent.
 * 14. Verify tenant isolation.
 */

import { db } from '../src/server/db/database.ts';
import { authService } from '../src/server/services/authService.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresFundTransactionRepository } from '../src/server/repositories/trading/PostgresFundTransactionRepository.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';

interface TestResult {
  num: number;
  test: string;
  result: 'PASS' | 'FAIL';
  evidence: string;
  problem?: string;
}

const results: TestResult[] = [];

function recordResult(num: number, test: string, passed: boolean, evidence: string, problem?: string) {
  results.push({
    num,
    test,
    result: passed ? 'PASS' : 'FAIL',
    evidence,
    problem: passed ? undefined : problem,
  });
}

async function run() {
  await runMigrations();

  const tenantA = 'tenant_prod_alpha';
  const tenantB = 'tenant_prod_beta';
  const testUserId = `client_${Date.now()}`;
  const phone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
  const password = 'SuperSecurePassword@2026';

  // 1. Create/login a CLIENT
  let user: any;
  let loginRes: any;
  try {
    const regRes = await authService.register(
      {
        fullName: 'Production Trader One',
        userId: testUserId,
        phone,
        password,
        confirmPassword: password,
      },
      tenantA
    );
    // Verify OTP to activate
    const otp = db.getLatestActiveOtp(testUserId, 'registration')?.dev_otp_preview;
    if (otp) {
      await authService.verifyRegistrationOtp(testUserId, otp);
    }
    // Perform standard login
    loginRes = await authService.login(testUserId, password);
    user = loginRes.user;

    const pass = Boolean(loginRes.token && user && user.userId === testUserId && user.status === 'ACTIVE');
    recordResult(
      1,
      'Create and login a CLIENT',
      pass,
      `User ${user?.userId} logged in successfully with JWT token generated`,
      pass ? undefined : 'Registration or login failed'
    );
  } catch (err: any) {
    recordResult(1, 'Create and login a CLIENT', false, 'authService', err.message);
  }

  // 2. Verify tenantId and trading user identity
  try {
    const userInDb = db.findUserByUserId(testUserId);
    const pass = Boolean(
      userInDb &&
      userInDb.tenant_id === tenantA &&
      userInDb.user_id === testUserId &&
      loginRes.token
    );
    recordResult(
      2,
      'Verify tenantId and trading user identity',
      pass,
      `User tenant_id="${userInDb?.tenant_id}", user_id="${userInDb?.user_id}" matches session identity`,
      pass ? undefined : 'Mismatch in tenantId or userId'
    );
  } catch (err: any) {
    recordResult(2, 'Verify tenantId and trading user identity', false, 'db', err.message);
  }

  // Seed PostgreSQL wallet for trading in tenantA
  await postgresWalletRepository.upsertWallet({
    tenant_id: tenantA,
    user_id: testUserId,
    available_balance: 1000000,
    used_margin: 0,
    blocked_balance: 0,
    realized_pnl: 0,
  });

  // 3. Execute one BUY trade
  let tradeResult: any;
  try {
    tradeResult = await tradingExecutionService.placeOrder({
      tenantId: tenantA,
      userId: testUserId,
      symbol: 'RELIANCE',
      side: 'BUY',
      lots: 1,
      orderType: 'MARKET',
    });

    const pass = Boolean(tradeResult.success && tradeResult.trade && tradeResult.order);
    recordResult(
      3,
      'Execute one BUY trade',
      pass,
      `Order ${tradeResult.order?.id} executed trade ${tradeResult.trade?.id} for RELIANCE`,
      pass ? undefined : 'Order placement returned failure'
    );
  } catch (err: any) {
    recordResult(3, 'Execute one BUY trade', false, 'TradingExecutionService', err.message);
  }

  // 4. Verify trade, order, position, and wallet are persisted in PostgreSQL
  try {
    const orderId = tradeResult.order?.id;
    const tradeId = tradeResult.trade?.id;

    const pgOrders = await postgresOrderRepository.getOrders(tenantA, testUserId);
    const pgOrder = pgOrders.find((o) => o.id === orderId);

    const pgTrades = await postgresTradeRepository.getTrades(tenantA, testUserId);
    const pgTrade = pgTrades.find((t) => t.id === tradeId);

    const pgPositions = await postgresPositionRepository.getPositions(tenantA, testUserId);
    const pgPos = pgPositions.find((p) => p.instrument_id === 'RELIANCE');

    const pgWallet = await postgresWalletRepository.getWallet(tenantA, testUserId);

    const pass = Boolean(
      pgOrder &&
      pgTrade &&
      pgPos &&
      Number(pgPos.quantity) > 0 &&
      pgWallet &&
      Number(pgWallet.used_margin) > 0
    );
    recordResult(
      4,
      'Verify trade, order, position and wallet persisted in PostgreSQL',
      pass,
      `PostgreSQL order=${pgOrder?.id}, trade=${pgTrade?.id}, pos_qty=${pgPos?.quantity}, used_margin=${pgWallet?.used_margin}`,
      pass ? undefined : 'Missing persistence in one or more PostgreSQL repositories'
    );
  } catch (err: any) {
    recordResult(4, 'Verify trade, order, position and wallet persisted in PostgreSQL', false, 'PostgresRepositories', err.message);
  }

  // 5. Verify the Central Admin trade event contains:
  // client identity, tradeId, orderId, symbol, side, quantity, execution price, execution value and timestamp.
  const queue = internalEventDispatcher.getQueue();
  const allEvents = queue.getPending();
  try {
    const tradeEvent = allEvents.find((e) => e.eventType === 'trade.executed' && e.payload?.tradeId === tradeResult.trade?.id);
    const p = tradeEvent?.payload;
    const hasClientIdentity = Boolean((p?.clientId || p?.tradingUserId || p?.userId) === testUserId && p?.clientCode);
    const hasTradeId = p?.tradeId === tradeResult.trade?.id;
    const hasOrderId = p?.orderId === tradeResult.order?.id;
    const hasSymbol = p?.symbol === 'RELIANCE';
    const hasSide = p?.side === 'BUY';
    const hasQty = Number(p?.quantity) > 0;
    const hasPrice = Number(p?.executionPrice) > 0;
    const hasValue = Number(p?.executionValue) > 0;
    const hasTimestamp = Boolean(tradeEvent?.timestamp || p?.executedAt);

    const pass = Boolean(tradeEvent && hasClientIdentity && hasTradeId && hasOrderId && hasSymbol && hasSide && hasQty && hasPrice && hasValue && hasTimestamp);
    recordResult(
      5,
      'Central Admin trade.executed event contains full authoritative data',
      pass,
      `Event id=${tradeEvent?.eventId}, user=${p?.tradingUserId}, symbol=${p?.symbol}, side=${p?.side}, qty=${p?.quantity}, price=${p?.executionPrice}, val=${p?.executionValue}, ts=${tradeEvent?.timestamp}`,
      pass ? undefined : 'Trade event missing required fields'
    );
  } catch (err: any) {
    recordResult(5, 'Central Admin trade.executed event contains full authoritative data', false, 'InternalEventDispatcher', err.message);
  }

  // 6. Verify position.updated data
  try {
    const posEvent = allEvents.find((e) => e.eventType === 'position.updated' && e.payload?.userId === testUserId && e.payload?.symbol === 'RELIANCE');
    const p = posEvent?.payload;
    const pass = Boolean(
      posEvent &&
      p?.symbol === 'RELIANCE' &&
      Number(p?.quantity) > 0 &&
      Number(p?.averagePrice) > 0 &&
      p?.status === 'OPEN' &&
      p?.tenantId === tenantA &&
      p?.userId === testUserId
    );
    recordResult(
      6,
      'Verify position.updated data for Central Admin',
      pass,
      `Position event id=${posEvent?.eventId}, symbol=${p?.symbol}, qty=${p?.quantity}, avgPrice=${p?.averagePrice}, status=${p?.status}`,
      pass ? undefined : 'position.updated event missing or has invalid data'
    );
  } catch (err: any) {
    recordResult(6, 'Verify position.updated data for Central Admin', false, 'InternalEventDispatcher', err.message);
  }

  // 7 & 8. Create a deposit and verify it is PENDING in authoritative fund transaction table
  let depositTx: any;
  try {
    depositTx = await authoritativeTradingDataService.createFundTransaction(
      tenantA,
      testUserId,
      'DEPOSIT',
      75000,
      'NEFT/RTGS',
      `DEP_PROD_${Date.now()}`
    );

    const dbTx = await postgresFundTransactionRepository.findById(tenantA, depositTx.id);
    const pass = Boolean(dbTx && dbTx.status === 'PENDING' && Number(dbTx.amount) === 75000 && dbTx.transaction_type === 'DEPOSIT');
    recordResult(
      7,
      'Create a deposit',
      Boolean(depositTx && depositTx.id),
      `Deposit created id=${depositTx?.id} for ₹75,000`
    );
    recordResult(
      8,
      'Verify deposit is PENDING in authoritative fund transaction table',
      pass,
      `PostgreSQL fund_transactions row id=${dbTx?.id} status="${dbTx?.status}" amount=${dbTx?.amount}`,
      pass ? undefined : 'Deposit transaction not found or status not PENDING'
    );
  } catch (err: any) {
    recordResult(7, 'Create a deposit', false, 'authoritativeTradingDataService', err.message);
    recordResult(8, 'Verify deposit is PENDING in authoritative fund transaction table', false, 'PostgresFundTransactionRepository', err.message);
  }

  // 9 & 10. Create a withdrawal and verify it is PENDING in authoritative fund transaction table
  let withdrawalTx: any;
  try {
    withdrawalTx = await authoritativeTradingDataService.createFundTransaction(
      tenantA,
      testUserId,
      'WITHDRAWAL',
      25000,
      'Bank Payout',
      `WDR_PROD_${Date.now()}`
    );

    const dbTx = await postgresFundTransactionRepository.findById(tenantA, withdrawalTx.id);
    const pass = Boolean(dbTx && dbTx.status === 'PENDING' && Number(dbTx.amount) === 25000 && dbTx.transaction_type === 'WITHDRAWAL');
    recordResult(
      9,
      'Create a withdrawal',
      Boolean(withdrawalTx && withdrawalTx.id),
      `Withdrawal created id=${withdrawalTx?.id} for ₹25,000`
    );
    recordResult(
      10,
      'Verify withdrawal is PENDING in authoritative fund transaction table',
      pass,
      `PostgreSQL fund_transactions row id=${dbTx?.id} status="${dbTx?.status}" amount=${dbTx?.amount}`,
      pass ? undefined : 'Withdrawal transaction not found or status not PENDING'
    );
  } catch (err: any) {
    recordResult(9, 'Create a withdrawal', false, 'authoritativeTradingDataService', err.message);
    recordResult(10, 'Verify withdrawal is PENDING in authoritative fund transaction table', false, 'PostgresFundTransactionRepository', err.message);
  }

  // 11. Verify approval/rejection events are generated
  try {
    // Approve deposit
    await authoritativeTradingDataService.processFundTransaction(tenantA, depositTx.id, 'APPROVE', 'ADMIN_SUPER');
    // Reject withdrawal
    await authoritativeTradingDataService.processFundTransaction(tenantA, withdrawalTx.id, 'REJECT', 'ADMIN_SUPER', 'Insufficient margin requirement');

    const latestEvents = queue.getPending();
    const depAppEvent = latestEvents.find((e) => e.eventType === 'deposit.approved' && e.payload?.transactionId === depositTx.id);
    const wdrRejEvent = latestEvents.find((e) => e.eventType === 'withdrawal.rejected' && e.payload?.transactionId === withdrawalTx.id);

    const pass = Boolean(depAppEvent && wdrRejEvent && wdrRejEvent.payload?.reason === 'Insufficient margin requirement');
    recordResult(
      11,
      'Verify approval/rejection events are generated',
      pass,
      `Generated deposit.approved (id=${depAppEvent?.eventId}) and withdrawal.rejected (id=${wdrRejEvent?.eventId}, reason="${wdrRejEvent?.payload?.reason}")`,
      pass ? undefined : 'Missing deposit.approved or withdrawal.rejected event'
    );
  } catch (err: any) {
    recordResult(11, 'Verify approval/rejection events are generated', false, 'authoritativeTradingDataService', err.message);
  }

  // 12. Verify no password, JWT, cookie or secret is included in events
  try {
    const eventsToCheck = queue.getPending();
    let secretLeakFound = false;
    let leakDetail = '';

    for (const evt of eventsToCheck) {
      const str = JSON.stringify(evt).toLowerCase();
      if (str.includes(password.toLowerCase())) {
        secretLeakFound = true;
        leakDetail = `Event ${evt.eventId} leaked raw password`;
        break;
      }
      if (str.includes('password_hash') || str.includes('jwt_secret') || str.includes('internal_secret')) {
        secretLeakFound = true;
        leakDetail = `Event ${evt.eventId} leaked secret key`;
        break;
      }
      if (evt.payload?.password || evt.payload?.token || evt.payload?.cookie) {
        secretLeakFound = true;
        leakDetail = `Event ${evt.eventId} contains sensitive payload credential`;
        break;
      }
    }

    const pass = !secretLeakFound && eventsToCheck.length > 0;
    recordResult(
      12,
      'Verify no password, JWT, cookie or secret is included in events',
      pass,
      `Audited ${eventsToCheck.length} published events; zero credential/hash/secret leaks detected`,
      pass ? undefined : leakDetail
    );
  } catch (err: any) {
    recordResult(12, 'Verify no password, JWT, cookie or secret is included in events', false, 'EventAudit', err.message);
  }

  // 13. Verify duplicate event delivery is idempotent
  try {
    const testEvt = allEvents[0];
    const initialCount = queue.getPending().filter((e) => e.eventId === testEvt.eventId).length;
    // Attempt re-dispatching identical event
    await internalEventDispatcher.dispatch(testEvt);
    const finalCount = queue.getPending().filter((e) => e.eventId === testEvt.eventId).length;

    // Dispatcher deduplication ensures the queue / outbox ignores re-entry with identical eventId
    const pass = initialCount === finalCount;
    recordResult(
      13,
      'Verify duplicate event delivery is idempotent',
      pass,
      `Dispatched duplicate eventId="${testEvt.eventId}"; queue length for event remained ${finalCount}`,
      pass ? undefined : 'Duplicate event was appended instead of deduplicated'
    );
  } catch (err: any) {
    recordResult(13, 'Verify duplicate event delivery is idempotent', false, 'InternalEventDispatcher', err.message);
  }

  // 14. Verify tenant isolation
  try {
    // Check that user, trades, and positions in tenantA are NOT accessible under tenantB
    const tenantBOrders = await postgresOrderRepository.getOrders(tenantB, testUserId);
    const tenantBTrades = await postgresTradeRepository.getTrades(tenantB, testUserId);
    const tenantBPositions = await postgresPositionRepository.getPositions(tenantB, testUserId);
    const tenantBWallet = await postgresWalletRepository.getWallet(tenantB, testUserId);

    const pass =
      tenantBOrders.length === 0 &&
      tenantBTrades.length === 0 &&
      tenantBPositions.length === 0 &&
      tenantBWallet === null;

    recordResult(
      14,
      'Verify tenant isolation',
      pass,
      `Tenant B query for Tenant A user returned 0 orders, 0 trades, 0 positions, and null wallet`,
      pass ? undefined : 'Tenant isolation leak: records from Tenant A visible in Tenant B'
    );
  } catch (err: any) {
    recordResult(14, 'Verify tenant isolation', false, 'PostgresRepositories', err.message);
  }

  console.log('\n========================================================================================');
  console.log('                 PRODUCTION-READINESS INTEGRATION TEST REPORT');
  console.log('========================================================================================\n');

  console.log('| # | Test | Result | Evidence / File | Problem if Failed |');
  console.log('|---|------|--------|-----------------|-------------------|');
  for (const r of results) {
    console.log(`| ${r.num} | ${r.test} | ${r.result} | ${r.evidence} | ${r.problem || 'None'} |`);
  }

  const allPass = results.every((r) => r.result === 'PASS');
  console.log('\nFinal Verdict:', allPass ? 'ALL 14 CHECKS PASSED' : 'SOME CHECKS FAILED');

  if (!allPass) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((e) => {
  console.error('[FATAL TEST SUITE ERROR]', e);
  process.exit(1);
});
