import assert from 'assert';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresLedgerRepository } from '../src/server/repositories/trading/PostgresLedgerRepository.ts';
import { postgresFundTransactionRepository } from '../src/server/repositories/trading/PostgresFundTransactionRepository.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { db } from '../src/server/db/database.ts';

async function runTest() {
  console.log('--- STARTING USER/BROKER PANEL DATA & REAL-TIME EVENT TEST ---');

  await runMigrations();

  const tenantId = 'vertex-default';
  const superAdmin = await hierarchyService.ensureSuperAdmin();
  assert(superAdmin, 'Super Admin must exist');

  // 1. Create a client user
  const clientUserId = `ub_trader_${Date.now()}`;
  const registerResult = await authService.register(
    {
      fullName: 'User Broker Tester',
      userId: clientUserId,
      password: 'SecurePassword@123',
      confirmPassword: 'SecurePassword@123',
    },
    tenantId
  );
  const clientUser = db.findUserByUserId(clientUserId);
  assert(clientUser, 'User must be created in DB');
  await db.updateUser(clientUser.id, { is_verified: true, status: 'active' });

  // 2. Fund wallet and create deposit transaction
  await postgresWalletRepository.upsertWallet({
    tenant_id: tenantId,
    user_id: clientUserId,
    available_balance: 100000,
    used_margin: 0,
    blocked_balance: 0,
    realized_pnl: 0,
  });

  // Track websocket broadcasts
  const capturedWsEvents: Array<{ event: string; payload: any }> = [];
  const originalBroadcast = tradingWebSocketServer.broadcastToTenant.bind(tradingWebSocketServer);
  tradingWebSocketServer.broadcastToTenant = (
    tId: string,
    event: string,
    payload: any,
    filter?: any,
    skipRedis?: boolean,
    target?: any
  ) => {
    capturedWsEvents.push({ event, payload });
    return originalBroadcast(tId, event, payload, filter, skipRedis, target);
  };

  // 3. Test createFundTransaction -> verifies WebSocket fund.created event
  console.log('[1/4] Testing fund transaction creation & real-time WebSocket push...');
  const depositTx = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    clientUserId,
    'DEPOSIT',
    50000,
    'UPI Instant',
    `DEP-${Date.now()}`
  );
  assert(depositTx.id, 'Deposit tx must have id');
  assert.strictEqual(depositTx.status, 'PENDING');

  const createdWsEvent = capturedWsEvents.find((e) => e.event === 'fund.created' && e.payload?.transactionId === depositTx.id);
  assert(createdWsEvent, 'fund.created must be broadcast over WebSocket');
  assert.strictEqual(createdWsEvent.payload.amount, 50000);
  console.log('✓ Verified real-time fund.created WebSocket broadcast');

  // 4. Test processFundTransaction (APPROVE) -> verifies wallet.updated and fund.updated WebSocket push
  console.log('[2/4] Testing fund approval & real-time wallet synchronization...');
  await authoritativeTradingDataService.processFundTransaction(tenantId, depositTx.id, 'APPROVE', 'ADMIN_USER');

  const walletWsEvent = capturedWsEvents.find((e) => e.event === 'wallet.updated' && e.payload?.userId === clientUserId);
  assert(walletWsEvent, 'wallet.updated must be broadcast over WebSocket on fund approval');
  assert.strictEqual(walletWsEvent.payload.availableBalance, 150000);

  const fundAppWsEvent = capturedWsEvents.find((e) => e.event === 'fund.updated' && e.payload?.transactionId === depositTx.id && e.payload?.status === 'APPROVED');
  assert(fundAppWsEvent, 'fund.updated (APPROVED) must be broadcast over WebSocket');
  console.log('✓ Verified real-time wallet.updated & fund.updated (APPROVED) WebSocket broadcast');

  // 5. Verify Ledger & Funds retrieval
  console.log('[3/4] Testing ledger and funds query repositories...');
  const ledgerEntries = await postgresLedgerRepository.getByUserId(clientUserId, tenantId);
  assert(ledgerEntries.length > 0, 'Ledger must have at least 1 entry for the approved deposit');
  assert.strictEqual(Number(ledgerEntries[0].amount), 50000);
  assert.strictEqual(ledgerEntries[0].type, 'CREDIT');
  console.log(`✓ Verified immutable ledger entry: amount = ₹${ledgerEntries[0].amount}, balance_after = ₹${ledgerEntries[0].balance_after}`);

  const userFundTxs = await postgresFundTransactionRepository.getByTenant(tenantId, clientUserId);
  assert(userFundTxs.length > 0, 'User fund transactions must return created deposit');
  assert.strictEqual(userFundTxs[0].id, depositTx.id);
  assert.strictEqual(userFundTxs[0].status, 'APPROVED');
  console.log(`✓ Verified user fund transaction query: status = ${userFundTxs[0].status}`);

  // 6. Test processFundTransaction (REJECT) -> verifies fund.updated with status REJECTED
  console.log('[4/4] Testing withdrawal rejection and real-time WebSocket push...');
  const withdrawTx = await authoritativeTradingDataService.createFundTransaction(
    tenantId,
    clientUserId,
    'WITHDRAWAL',
    20000,
    'HDFC Bank',
    `WDR-${Date.now()}`
  );
  await authoritativeTradingDataService.processFundTransaction(tenantId, withdrawTx.id, 'REJECT', 'ADMIN_USER', 'KYC Incomplete');

  const fundRejWsEvent = capturedWsEvents.find((e) => e.event === 'fund.updated' && e.payload?.transactionId === withdrawTx.id && e.payload?.status === 'REJECTED');
  assert(fundRejWsEvent, 'fund.updated (REJECTED) must be broadcast over WebSocket');
  assert.strictEqual(fundRejWsEvent.payload.reason, 'KYC Incomplete');
  console.log('✓ Verified real-time fund.updated (REJECTED) WebSocket broadcast with reason');

  // Restore original broadcast function
  tradingWebSocketServer.broadcastToTenant = originalBroadcast;

  console.log('\n==================================================================');
  console.log('ALL USER/BROKER PANEL REPOSITORY & REAL-TIME EVENT TESTS PASSED!');
  console.log('==================================================================\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
