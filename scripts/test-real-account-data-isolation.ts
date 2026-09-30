/**
 * Automated Test Suite for Real Account Data Connection & Tenant/User Isolation
 */

import { authService } from '../src/server/services/authService.ts';
import { db } from '../src/server/db/database.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runRealAccountIsolationTests() {
  console.log('================================================================');
  console.log('   RUNNING REAL ACCOUNT DATA & USER ISOLATION TEST SUITE');
  console.log('================================================================\n');

  await runMigrations();

  const ts = Date.now();
  const tenantId = 'vertex-default';

  // --- 1. User A & User B Signup ---
  console.log('--- 1. Registering Isolated Users (User A & User B) ---');
  const userA_id = `trader_a_${ts}`;
  const userB_id = `trader_b_${ts}`;
  const pass = 'SecurePass@2026';

  const regA = await authService.register({ fullName: 'Trader Alpha', userId: userA_id, password: pass, confirmPassword: pass }, tenantId);
  const regB = await authService.register({ fullName: 'Trader Beta', userId: userB_id, password: pass, confirmPassword: pass }, tenantId);

  assert(regA.user.userId === userA_id, 'User A registered successfully');
  assert(regB.user.userId === userB_id, 'User B registered successfully');

  // --- 2. Initial Account Data Verification ---
  console.log('\n--- 2. Initial Account Zero/Empty State Verification ---');
  const walletA_init = await postgresWalletRepository.getOrCreateWallet(tenantId, userA_id, 0);
  const walletB_init = await postgresWalletRepository.getOrCreateWallet(tenantId, userB_id, 0);

  assert(walletA_init.available_balance === 0, 'User A wallet starts at 0 available balance');
  assert(walletB_init.available_balance === 0, 'User B wallet starts at 0 available balance');

  const posA_init = await postgresPositionRepository.getPositions(tenantId, userA_id);
  const posB_init = await postgresPositionRepository.getPositions(tenantId, userB_id);

  assert(posA_init.length === 0, 'User A open positions start as empty array []');
  assert(posB_init.length === 0, 'User B open positions start as empty array []');

  // --- 3. Deposit Funds to User A Only ---
  console.log('\n--- 3. Depositing Funds to User A Only ---');
  await postgresWalletRepository.updateWallet(tenantId, userA_id, { available_balance: 100000 });

  const walletA_afterDep = await postgresWalletRepository.getWallet(tenantId, userA_id);
  const walletB_afterDep = await postgresWalletRepository.getWallet(tenantId, userB_id);

  assert(walletA_afterDep?.available_balance === 100000, 'User A wallet balance correctly updated to ₹1,00,000');
  assert(walletB_afterDep?.available_balance === 0, 'User B wallet remains strictly ₹0 (No cross-talk)');

  // --- 4. Order Execution for User A ---
  console.log('\n--- 4. Order Execution for User A ---');
  const orderResA = await tradingExecutionService.placeOrder({
    tenantId,
    userId: userA_id,
    symbol: 'GOLD FUT',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'INTRADAY',
    lots: 1,
    price: 72000,
  });

  assert(Boolean(orderResA.order), 'User A order executed successfully');

  const ordersA = await postgresOrderRepository.getOrders(tenantId, userA_id);
  const ordersB = await postgresOrderRepository.getOrders(tenantId, userB_id);

  assert(ordersA.length === 1, 'User A orders table contains 1 order');
  assert(ordersB.length === 0, 'User B orders table remains strictly empty []');

  const posA = await postgresPositionRepository.getPositions(tenantId, userA_id);
  const posB = await postgresPositionRepository.getPositions(tenantId, userB_id);

  assert(posA.length === 1, 'User A open positions table contains 1 position');
  assert(posB.length === 0, 'User B open positions table remains strictly empty []');

  console.log('\n================================================================');
  console.log('   ALL REAL ACCOUNT DATA & ISOLATION TESTS PASSED!');
  console.log('================================================================');
  process.exit(0);
}

runRealAccountIsolationTests().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
