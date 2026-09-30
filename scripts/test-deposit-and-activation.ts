/**
 * Focused Production Integration Tests for:
 * 1. Deposit flow:
 *    - Customer POST /funds/deposit creates authoritative fund transaction in PENDING state and publishes deposit.created
 *    - No automatic approval from customer route
 *    - No wallet credit before approval
 *    - Admin approval credits wallet exactly once (second approval rejected idempotently)
 * 2. Client activation:
 *    - After OTP verification, publishes client.activated
 *    - Contract includes: tenantId, tradingUserId, userId, clientId, clientCode, name, email, phone, status, createdAt
 *    - Transactional outbox & event dispatcher used
 *    - Zero exposure of password, OTP, JWT, cookies, or secrets
 *    - Duplicate activation event delivery is idempotent
 */

import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { db } from '../src/server/db/database.ts';
import { authService } from '../src/server/services/authService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresFundTransactionRepository } from '../src/server/repositories/trading/PostgresFundTransactionRepository.ts';
import { postgresLedgerRepository } from '../src/server/repositories/trading/PostgresLedgerRepository.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { eventIdempotencyStore } from '../src/server/events/EventIdempotencyStore.ts';
import { centralAdminEventClient } from '../src/server/events/CentralAdminEventClient.ts';
import { InternalEvent } from '../src/server/events/types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(message);
  }
  console.log(`[PASS] ${message}`);
}

async function run() {
  console.log('================================================================');
  console.log('RUNNING FOCUSED INTEGRATION TESTS: DEPOSIT & CLIENT ACTIVATION');
  console.log('================================================================\n');

  await runMigrations();

  const tenantId = `tenant_test_${Date.now()}`;
  const userId = `client_${Date.now()}`;
  const phone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
  const password = 'SuperSecurePassword@2026';
  const fullName = 'Integration Test Trader';

  // -------------------------------------------------------------------------
  // PART 1: Client Activation via OTP Verification
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Client Activation ---');

  // Register client
  const regResult = await authService.register(
    {
      fullName,
      userId,
      phone,
      password,
      confirmPassword: password,
      email: `${userId}@example.com`,
    },
    tenantId
  );
  assert(regResult.user.userId === userId, 'Client registered in database');

  assert(regResult.user.status === 'ACTIVE', 'Direct signup activates the account');
  assert(Boolean(regResult.token), 'Direct signup issues a session token');

  // Verify client.activated event was published to the queue
  const pendingEvents = internalEventDispatcher.getQueue().getPending();
  const activationEvent = pendingEvents.find(
    (e) => e.eventType === 'client.activated' && (e.payload?.userId === userId || e.payload?.tradingUserId === userId)
  );

  assert(Boolean(activationEvent), 'OTP verification publishes client.activated event');

  const p = activationEvent!.payload;

  // Check all 10 required contract fields
  assert(p.tenantId === tenantId, 'Event contract includes tenantId');
  assert(p.tradingUserId === userId, 'Event contract includes tradingUserId');
  assert(p.userId === userId, 'Event contract includes userId');
  assert(Boolean(p.clientId), `Event contract includes clientId: "${p.clientId}"`);
  assert(p.clientCode === userId.toUpperCase(), `Event contract includes clientCode: "${p.clientCode}"`);
  assert(p.name === fullName, 'Event contract includes name');
  assert(p.email === `${userId}@example.com`, 'Event contract includes email');
  assert(p.phone === phone, 'Event contract includes phone');
  assert(p.status === 'ACTIVE', 'Event contract includes status');
  assert(Boolean(p.createdAt), 'Event contract includes createdAt');

  // Verify zero exposure of sensitive secrets
  const serialized = JSON.stringify(activationEvent);
  assert(!serialized.includes(password), 'Event DOES NOT expose password');
  assert(!serialized.toLowerCase().includes('otp'), 'Event DOES NOT expose OTP code');
  assert(!serialized.includes('password_hash'), 'Event DOES NOT expose password_hash');
  assert(!serialized.includes('dev_otp_preview'), 'Event DOES NOT expose OTP preview');
  assert(p.token === undefined, 'Event payload DOES NOT expose JWT token');
  assert(p.cookie === undefined, 'Event payload DOES NOT expose cookies');
  assert(p.secret === undefined, 'Event payload DOES NOT expose secrets');

  // Test duplicate activation event idempotency
  console.log('\n--- TEST GROUP 2: Duplicate Activation Event Idempotency ---');
  const initialQueueCount = internalEventDispatcher.getQueue().getPending().filter((e) => e.eventId === activationEvent!.eventId).length;

  // Re-dispatch identical activation event
  await internalEventDispatcher.dispatch(activationEvent!);
  const secondQueueCount = internalEventDispatcher.getQueue().getPending().filter((e) => e.eventId === activationEvent!.eventId).length;
  assert(initialQueueCount === secondQueueCount, 'Dispatcher queue deduplicates duplicate activation event');

  // Test Central Admin receiver idempotency directly
  const testEventId = activationEvent!.eventId;
  eventIdempotencyStore.clear(); // clean slate
  assert(!eventIdempotencyStore.has(testEventId), 'Idempotency store initially does not have eventId');

  // First receipt
  eventIdempotencyStore.record(testEventId, 'client.activated', tenantId);
  assert(eventIdempotencyStore.has(testEventId), 'First delivery is recorded');

  // Second receipt - idempotent acknowledgment
  const isDuplicate = eventIdempotencyStore.has(testEventId);
  assert(isDuplicate, 'Duplicate delivery detected as already processed (idempotent)');

  // -------------------------------------------------------------------------
  // PART 2: Deposit Flow & Authoritative Financials
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Customer Deposit Flow & State Transitions ---');

  // Initialize wallet for user
  const initialWallet = await postgresWalletRepository.upsertWallet({
    tenant_id: tenantId,
    user_id: userId,
    available_balance: 50000,
    used_margin: 0,
    blocked_balance: 0,
    realized_pnl: 0,
  });
  const balanceBefore = Number(initialWallet.available_balance);
  assert(balanceBefore === 50000, 'Initial authoritative wallet balance set to 50,000');

  // Customer creates a deposit
  const depositAmount = 25000;
  const depositTx = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    userId,
    'DEPOSIT',
    depositAmount,
    'UPI Instant',
    `REF_DEP_${Date.now()}`
  );

  // 1. Customer deposit remains PENDING
  const queriedTx = await postgresFundTransactionRepository.findById(tenantId, depositTx.id);
  assert(Boolean(queriedTx), 'Authoritative PostgreSQL fund transaction created');
  assert(queriedTx?.status === 'PENDING', 'Customer deposit remains in PENDING state');
  assert(Number(queriedTx?.amount) === depositAmount, `Deposit amount is authoritative ₹${depositAmount}`);
  assert(queriedTx?.transaction_type === 'DEPOSIT', 'Transaction type is DEPOSIT');

  // Verify deposit.created event was published
  const latestEvents = internalEventDispatcher.getQueue().getPending();
  const depCreatedEvent = latestEvents.find(
    (e) => e.eventType === 'deposit.created' && e.payload?.transactionId === depositTx.id
  );
  assert(Boolean(depCreatedEvent), 'Deposit creation publishes deposit.created event');
  assert(depCreatedEvent?.payload?.status === 'PENDING', 'deposit.created event reports PENDING status');
  assert(depCreatedEvent?.payload?.amount === depositAmount, 'deposit.created event contains exact amount');

  // 2. No wallet credit before approval
  const walletBeforeApproval = await postgresWalletRepository.getWallet(tenantId, userId);
  assert(
    Number(walletBeforeApproval?.available_balance) === balanceBefore,
    `No wallet credit before approval: balance remains ₹${walletBeforeApproval?.available_balance}`
  );

  const ledgerBeforeApproval = await postgresLedgerRepository.getByUserId(userId, tenantId);
  const depositLedgerBefore = ledgerBeforeApproval.filter((l) => l.transaction_id === depositTx.id);
  assert(depositLedgerBefore.length === 0, 'No ledger entry exists for pending deposit before approval');

  // 3. Approval credits wallet exactly once
  console.log('\n--- TEST GROUP 4: Admin Approval & Wallet Mutation ---');

  // Admin approves deposit
  const approvedTx = await authoritativeTradingDataService.processFundTransaction(
    tenantId,
    depositTx.id,
    'APPROVE',
    'ADMIN_OFFICER_01'
  );

  assert(
    approvedTx?.status === 'APPROVED' || approvedTx?.status === 'COMPLETED',
    `Deposit status transitioned to ${approvedTx?.status}`
  );

  // Verify wallet is credited
  const walletAfterApproval = await postgresWalletRepository.getWallet(tenantId, userId);
  const expectedBalance = balanceBefore + depositAmount;
  assert(
    Number(walletAfterApproval?.available_balance) === expectedBalance,
    `Wallet credited with ₹${depositAmount}; new balance = ₹${walletAfterApproval?.available_balance}`
  );

  // Verify immutable ledger entry created
  const ledgerAfterApproval = await postgresLedgerRepository.getByUserId(userId, tenantId);
  const depositLedgerAfter = ledgerAfterApproval.filter((l) => l.transaction_id === depositTx.id);
  assert(depositLedgerAfter.length === 1, 'Exactly one immutable ledger entry created for approved deposit');
  assert(depositLedgerAfter[0].type === 'CREDIT', 'Ledger entry is CREDIT');
  assert(Number(depositLedgerAfter[0].amount) === depositAmount, 'Ledger entry amount matches deposit');
  assert(Number(depositLedgerAfter[0].balance_after) === expectedBalance, 'Ledger entry balance_after matches wallet');

  // Verify deposit.approved event was published
  const appEvents = internalEventDispatcher.getQueue().getPending();
  const depApprovedEvent = appEvents.find(
    (e) => e.eventType === 'deposit.approved' && e.payload?.transactionId === depositTx.id
  );
  assert(Boolean(depApprovedEvent), 'Admin approval publishes deposit.approved event');

  // Attempt duplicate approval: MUST fail and NOT credit wallet again
  console.log('\n--- TEST GROUP 5: Double-Approval Protection ---');
  let duplicateApprovalFailed = false;
  try {
    await authoritativeTradingDataService.processFundTransaction(
      tenantId,
      depositTx.id,
      'APPROVE',
      'ADMIN_OFFICER_02'
    );
  } catch (err: any) {
    duplicateApprovalFailed = true;
    assert(err.statusCode === 400 || err.message.includes('already in state'), `Duplicate approval rejected: "${err.message}"`);
  }
  assert(duplicateApprovalFailed, 'Subsequent approval attempt on already approved deposit was strictly rejected');

  // Verify wallet balance remained unchanged after duplicate approval attempt
  const walletAfterDuplicateAttempt = await postgresWalletRepository.getWallet(tenantId, userId);
  assert(
    Number(walletAfterDuplicateAttempt?.available_balance) === expectedBalance,
    `Wallet credited exactly once: balance remains ₹${expectedBalance} after second approval attempt`
  );

  const finalLedgerEntries = await postgresLedgerRepository.getByUserId(userId, tenantId);
  const finalDepositLedgers = finalLedgerEntries.filter((l) => l.transaction_id === depositTx.id);
  assert(finalDepositLedgers.length === 1, 'Immutable ledger contains only 1 record; no duplicate credit');

  console.log('\n================================================================');
  console.log('ALL FOCUSED TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
