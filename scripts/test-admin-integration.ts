/**
 * Trading Platform -> Central Admin Integration Test Suite
 * Tests all 5 integration areas:
 * 1. CLIENT Signup & Verification -> admin event (client.registered, client.activated)
 * 2. Trade Execution -> admin event (trade.executed with full authoritative data)
 * 3. Position/P&L -> admin event (position.updated with price, qty, P&L, status)
 * 4. Wallet -> admin event (wallet.updated with balances, margin, equity)
 * 5. Customer Deposit & Withdrawal -> PostgreSQL flow + admin events (deposit.created, deposit.approved, withdrawal.created)
 */

import { db } from '../src/server/db/database.ts';
import { authService } from '../src/server/services/authService.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { transactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${title}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${title}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   TRADING PLATFORM -> CENTRAL ADMIN INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  await runMigrations();

  const tenantId = 'vertex-default';
  const testUserId = `admin_sync_${Date.now()}`;
  const testPhone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;

  // Capture dispatched events locally from event queue
  const queue = internalEventDispatcher.getQueue();

  // -----------------------------------------------------------------
  // 1. CLIENT Signup -> Admin Event
  // -----------------------------------------------------------------
  console.log('--- TEST 1: CLIENT Signup & Activation -> Central Admin Event ---');
  const signupResult = await authService.register({
    fullName: 'Integration Trader',
    userId: testUserId,
    phone: testPhone,
    password: 'SecurePassword@2026',
    confirmPassword: 'SecurePassword@2026',
  }, tenantId);

  assert(signupResult.user.userId === testUserId, 'CLIENT registered and activated');
  assert(signupResult.user.status === 'ACTIVE', 'Direct signup account is ACTIVE');

  const pendingEvents = queue.getPending();
  const regEvent = pendingEvents.find((e) => e.eventType === 'client.registered' && e.payload?.userId === testUserId);
  assert(Boolean(regEvent), 'client.registered event enqueued for Central Admin');
  assert(regEvent?.payload?.tradingUserId === testUserId, 'Event contains canonical tradingUserId');
  assert(regEvent?.payload?.phone !== undefined, 'Event contains phone without exposing password');
  assert(regEvent?.payload?.password === undefined, 'Event strictly DOES NOT expose password');

  const actEvent = queue.getPending().find((e) => e.eventType === 'client.activated' && e.payload?.userId === testUserId);
  assert(Boolean(actEvent), 'client.activated event enqueued for Central Admin');
  assert(actEvent?.payload?.status === 'ACTIVE', 'Activated event reports status ACTIVE');

  // -----------------------------------------------------------------
  // 2. Trade Execution -> Authoritative Trade Event
  // -----------------------------------------------------------------
  console.log('\n--- TEST 2: Trade Execution -> Authoritative Trade Event ---');
  // Seed wallet for trading
  await postgresWalletRepository.upsertWallet({
    tenant_id: tenantId,
    user_id: testUserId,
    available_balance: 500000,
    used_margin: 0,
    blocked_balance: 0,
    realized_pnl: 0,
  });

  const orderResult = await tradingExecutionService.placeOrder({
    tenantId,
    userId: testUserId,
    symbol: 'RELIANCE',
    side: 'BUY',
    lots: 1,
    orderType: 'MARKET',
  });

  assert(orderResult.success === true, 'Market BUY order executed');
  assert(Boolean(orderResult.trade), 'Trade record generated');

  const allQueued = queue.getPending();
  const tradeEvent = allQueued.find((e) => e.eventType === 'trade.executed' && e.payload?.tradeId === orderResult.trade?.id);
  assert(Boolean(tradeEvent), 'Authoritative trade.executed event enqueued for Central Admin');
  assert(tradeEvent?.payload?.symbol === 'RELIANCE', 'Trade event includes correct symbol');
  assert(tradeEvent?.payload?.side === 'BUY', 'Trade event includes side BUY');
  assert(Number(tradeEvent?.payload?.executionPrice) > 0, 'Trade event includes real execution price');
  assert(Number(tradeEvent?.payload?.executionValue) > 0, 'Trade event includes execution value');
  assert(tradeEvent?.payload?.tradingUserId === testUserId, 'Trade event maps to tradingUserId');

  // -----------------------------------------------------------------
  // 3. Position/P&L Synchronization -> Admin Event
  // -----------------------------------------------------------------
  console.log('\n--- TEST 3: Position & P&L Synchronization -> Central Admin Event ---');
  const posEvent = allQueued.find((e) => e.eventType === 'position.updated' && e.payload?.userId === testUserId);
  assert(Boolean(posEvent), 'position.updated event enqueued for Central Admin');
  assert(posEvent?.payload?.symbol === 'RELIANCE', 'Position event has symbol RELIANCE');
  assert(Number(posEvent?.payload?.quantity) > 0, 'Position event reports open quantity');
  assert(posEvent?.payload?.status === 'OPEN', 'Position event reports status OPEN');

  // Close the position
  const closeResult = await tradingExecutionService.closePosition(tenantId, testUserId, orderResult.position?.id || 'RELIANCE');
  assert(closeResult.success === true, 'Position closed successfully');

  const closedPosEvents = queue.getPending().filter((e) => e.eventType === 'position.updated' && e.payload?.userId === testUserId && e.payload?.status === 'CLOSED');
  assert(closedPosEvents.length > 0, 'position.updated (CLOSED) event enqueued for Central Admin');

  // -----------------------------------------------------------------
  // 4. Wallet Synchronization -> Admin Event
  // -----------------------------------------------------------------
  console.log('\n--- TEST 4: Wallet Synchronization -> Central Admin Event ---');
  const walletEvents = queue.getPending().filter((e) => e.eventType === 'wallet.updated' && e.payload?.userId === testUserId);
  assert(walletEvents.length > 0, 'wallet.updated event enqueued for Central Admin');
  const latestWallet = walletEvents[walletEvents.length - 1];
  assert(Number(latestWallet?.payload?.availableBalance) > 0, 'Wallet event contains authoritative availableBalance');
  assert(Number(latestWallet?.payload?.equity) > 0, 'Wallet event contains authoritative equity');

  // -----------------------------------------------------------------
  // 5. Customer Deposit & Withdrawal -> PostgreSQL Flow + Admin Events
  // -----------------------------------------------------------------
  console.log('\n--- TEST 5: Deposit & Withdrawal Flow + Admin Events ---');
  // 5a. Create Deposit
  const depositTx = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    testUserId,
    'DEPOSIT',
    50000,
    'UPI Instant',
    `DEP-${Date.now()}`
  );
  assert(depositTx.status === 'PENDING', 'Deposit transaction created in PENDING state');

  const depCreatedEvent = queue.getPending().find((e) => e.eventType === 'deposit.created' && e.payload?.transactionId === depositTx.id);
  assert(Boolean(depCreatedEvent), 'deposit.created event enqueued for Central Admin');

  // 5b. Approve Deposit
  await authoritativeTradingDataService.processFundTransaction(tenantId, depositTx.id, 'APPROVE', 'ADMIN_USER');
  const depApprovedEvent = queue.getPending().find((e) => e.eventType === 'deposit.approved' && e.payload?.transactionId === depositTx.id);
  assert(Boolean(depApprovedEvent), 'deposit.approved event enqueued for Central Admin');

  // 5c. Create Withdrawal
  const withdrawTx = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    testUserId,
    'WITHDRAWAL',
    10000,
    'HDFC Bank',
    `WDR-${Date.now()}`
  );
  assert(withdrawTx.status === 'PENDING', 'Withdrawal transaction created in PENDING state');

  const withCreatedEvent = queue.getPending().find((e) => e.eventType === 'withdrawal.created' && e.payload?.transactionId === withdrawTx.id);
  assert(Boolean(withCreatedEvent), 'withdrawal.created event enqueued for Central Admin');

  // 5d. Reject Withdrawal
  await authoritativeTradingDataService.processFundTransaction(tenantId, withdrawTx.id, 'REJECT', 'ADMIN_USER', 'KYC Document Incomplete');
  const withRejectedEvent = queue.getPending().find((e) => e.eventType === 'withdrawal.rejected' && e.payload?.transactionId === withdrawTx.id);
  assert(Boolean(withRejectedEvent), 'withdrawal.rejected event enqueued for Central Admin');
  assert(withRejectedEvent?.payload?.reason === 'KYC Document Incomplete', 'withdrawal.rejected contains rejection reason');

  // 5e. Create & Approve 2nd Withdrawal
  const withdrawTx2 = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    testUserId,
    'WITHDRAWAL',
    5000,
    'ICICI Bank',
    `WDR-${Date.now()}-2`
  );
  await authoritativeTradingDataService.processFundTransaction(tenantId, withdrawTx2.id, 'APPROVE', 'ADMIN_USER');
  const withApprovedEvent = queue.getPending().find((e) => e.eventType === 'withdrawal.approved' && e.payload?.transactionId === withdrawTx2.id);
  assert(Boolean(withApprovedEvent), 'withdrawal.approved event enqueued for Central Admin');

  console.log('\n================================================================');
  console.log(`INTEGRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('[FATAL INTEGRATION TEST ERROR]', err);
  process.exit(1);
});
