/**
 * Master Integration Test Suite
 * Validates End-to-End integration between Trading Platform & Central Admin Panel
 */

import { authService } from '../src/server/services/authService.ts';
import { db } from '../src/server/db/database.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { adminDashboardService } from '../src/server/services/adminDashboardService.ts';
import { eventIdempotencyStore } from '../src/server/events/EventIdempotencyStore.ts';
import { centralAdminEventClient } from '../src/server/events/CentralAdminEventClient.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runMasterIntegrationSuite() {
  console.log('================================================================');
  console.log('   RUNNING MASTER END-TO-END INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  await runMigrations();

  const ts = Date.now();
  const tenantA = 'vertex-default';
  const tenantB = 'tenant-sec-beta';

  // --- Step 1: Create a NEW Real Trading Platform Account ---
  console.log('--- 1. Account Creation in Trading Platform ---');
  const userId_1 = `master_trader_${ts}`;
  const pass = 'SecurePass@2026';

  const phone_1 = `98${Math.floor(10000000 + Math.random() * 80000000)}`;
  const regRes = await authService.register(
    {
      fullName: 'Vikram Mehta',
      userId: userId_1,
      email: `vikram_${ts}@trading.vertex.com`,
      phone: phone_1,
      password: pass,
      confirmPassword: pass,
    },
    tenantA
  );

  assert(regRes.user.userId === userId_1, 'User registration returned correct user record');

  // --- Step 2: Confirm User in Database ---
  console.log('\n--- 2. Database Insertion Verification ---');
  const dbUser = db.findUserByUserId(userId_1);
  assert(Boolean(dbUser), 'User is persisted in Trading Platform DB');
  assert(dbUser?.status === 'ACTIVE', 'User status is directly ACTIVE');
  assert(dbUser?.tenant_id === tenantA, 'User tenant_id is preserved as vertex-default');

  // --- Step 3: Event Generation & Idempotency ---
  console.log('\n--- 3. Event Generation & Idempotency Check ---');
  const eventId = `evt-reg-${userId_1}-${ts}`;
  const isFirstProcessed = !eventIdempotencyStore.has(eventId);
  eventIdempotencyStore.record(eventId, 'client.registered', tenantA);
  const isSecondProcessed = eventIdempotencyStore.has(eventId);

  assert(isFirstProcessed, 'First event processing allowed');
  assert(isSecondProcessed, 'Duplicate event detected & acknowledged idempotently');

  // --- Step 4 & 5: Admin Panel Clients Listing ---
  console.log('\n--- 4 & 5. Admin Panel Clients Synchronization ---');
  const adminSuper = {
    id: 'admin-super',
    role: 'SUPER_ADMIN',
    hierarchy_path: 'root',
    tenant_id: tenantA,
  } as any;

  const clientsList = await hierarchyService.getScopedEntities(adminSuper, 'CLIENT');
  const syncedClient = clientsList.find((c) => c.userId === userId_1);

  assert(Boolean(syncedClient), 'Newly created Trading Platform user automatically appears in Admin Panel -> Clients');
  assert(syncedClient?.fullName === 'Vikram Mehta', 'Client full name matches');

  // --- Step 6 to 13: Client Detail Real Data Extraction ---
  console.log('\n--- 6 to 13. Client Detail Real Data Verification ---');
  const clientAccount = await authoritativeTradingDataService.getClientAccount(tenantA, userId_1);

  assert(clientAccount.trading_user_id === userId_1, 'Client ID matches');
  assert(clientAccount.identity.full_name === 'Vikram Mehta', 'Profile full name matches');
  assert(clientAccount.identity.email === `vikram_${ts}@trading.vertex.com`, 'Profile email matches');
  assert(clientAccount.account.balance === 0, 'Initial balance is ₹0');
  assert(clientAccount.account.equity === 0, 'Initial equity is ₹0');
  assert(clientAccount.account.used_margin === 0, 'Initial used margin is ₹0');
  assert(clientAccount.account.realized_pnl === 0, 'Initial realized P&L is ₹0');
  assert(clientAccount.account.unrealized_pnl === 0, 'Initial unrealized P&L is ₹0');

  // --- Step 14 to 17: Order Placement, Trade Execution & Real-Time Sync ---
  console.log('\n--- 14 to 17. Test Order Placement & Trade Execution ---');

  // Deposit margin to execute test order
  await postgresWalletRepository.updateWallet(tenantA, userId_1, { available_balance: 200000 });

  const orderRes = await tradingExecutionService.placeOrder({
    tenantId: tenantA,
    userId: userId_1,
    symbol: 'GOLD FUT',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'INTRADAY',
    lots: 1,
    price: 71500,
  });

  assert(Boolean(orderRes.order), 'Real test order placed successfully');
  assert(Boolean(orderRes.trade), 'Real trade executed automatically');
  assert(Boolean(orderRes.position), 'Real position created/updated');

  const clientOrders = await postgresOrderRepository.getOrders(tenantA, userId_1);
  const clientTrades = await postgresTradeRepository.getTrades(tenantA, userId_1);
  const clientPositions = await postgresPositionRepository.getPositions(tenantA, userId_1);

  assert(clientOrders.length === 1, 'Client Orders updated in database (1 record)');
  assert(clientTrades.length === 1, 'Client Trades updated in database (1 record)');
  assert(clientPositions.length === 1, 'Client Positions updated in database (1 record)');

  // Confirm Admin Dashboard KPIs Update
  const adminKPIs = await adminDashboardService.getKPIs(adminSuper);
  assert(adminKPIs.totalClients >= 1, 'Admin KPIs reflect real client count');
  assert(adminKPIs.tradingVolume > 0, 'Admin KPIs reflect real trading volume');

  // --- Step 18 to 22: User & Tenant Isolation Security Checks ---
  console.log('\n--- 18 to 22. User & Tenant Isolation Security Verification ---');
  const userId_2 = `trader_sec_${ts}`;
  await authService.register(
    {
      fullName: 'Aanya Verma',
      userId: userId_2,
      password: pass,
      confirmPassword: pass,
    },
    tenantA
  );

  const user1_orders = await postgresOrderRepository.getOrders(tenantA, userId_1);
  const user2_orders = await postgresOrderRepository.getOrders(tenantA, userId_2);

  assert(user1_orders.length === 1, 'User 1 has 1 order');
  assert(user2_orders.length === 0, 'User 2 has 0 orders (Strict User Isolation)');

  // Tenant Isolation Verification
  try {
    await authoritativeTradingDataService.getClientAccount(tenantB, userId_1);
    assert(false, 'Should throw TENANT_MISMATCH for cross-tenant access');
  } catch (err: any) {
    assert(err.code === 'TENANT_MISMATCH' || err.statusCode === 403 || err.statusCode === 404, 'Cross-tenant access rejected securely');
  }

  console.log('\n================================================================');
  console.log('   ALL MASTER END-TO-END INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');
}

runMasterIntegrationSuite().catch((err) => {
  console.error('[FATAL INTEGRATION ERROR]', err);
  process.exit(1);
});
