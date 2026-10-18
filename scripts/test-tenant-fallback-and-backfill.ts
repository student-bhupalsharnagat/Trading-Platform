import assert from 'assert';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { postgresClientMappingRepository } from '../src/server/repositories/PostgresClientMappingRepository.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { transactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresOutboxRepository } from '../src/server/repositories/trading/PostgresOutboxRepository.ts';

async function run() {
  console.log('--- Testing Tenant-Agnostic Fallback & Auto-Backfill ---');

  // 1. Initialize embedded DB migrations
  await runMigrations();

  // 2. Seed a test user under 'vertex-default'
  const testUserId = `user_fall_${Date.now()}`;
  db.createUser({
    userId: testUserId,
    fullName: 'Fallback Test User',
    countryCode: '+91',
    mobile: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    passwordHash: 'dummy',
    status: 'active',
    isVerified: true,
    tenantId: 'vertex-default',
    role: 'CLIENT',
  });

  // 3. Test Auto-Backfill
  const backfillResult = await postgresClientMappingRepository.backfillClientMappingsAndWallets('TNT-001');
  console.log('Backfill result:', backfillResult);
  assert.ok(backfillResult.processed > 0, 'Backfill should process users');

  // Verify wallet exists in PostgreSQL under TNT-001
  const walletRes = await pgDb.query(
    'SELECT * FROM trading_wallets WHERE user_id = $1 AND tenant_id = $2',
    [testUserId, 'TNT-001']
  );
  assert.ok(walletRes.rows.length > 0, 'Wallet must exist under TNT-001');
  console.log('✓ PASS: Auto-backfilled wallet under TNT-001 verified');

  // Verify client_mapping exists under TNT-001
  const mappingRes = await pgDb.query(
    'SELECT * FROM client_mappings WHERE user_id = $1 AND tenant_id = $2',
    [testUserId, 'TNT-001']
  );
  assert.ok(mappingRes.rows.length > 0, 'Mapping must exist under TNT-001');
  console.log('✓ PASS: Auto-backfilled client_mapping under TNT-001 verified');

  // 4. Test Tenant-Agnostic getClientsPaged
  // Querying with TNT-001 must return the user created under vertex-default
  const pagedClients = await authoritativeTradingDataService.getClientsPaged('TNT-001', { search: testUserId });
  assert.strictEqual(pagedClients.total, 1, 'Should find user in TNT-001 query');
  assert.strictEqual(pagedClients.clients[0].userId, testUserId);
  console.log('✓ PASS: getClientsPaged returns client across tenant mismatch');

  // 5. Test Orders fallback
  const testOrderId = `ord_fall_${Date.now()}`;
  await postgresOrderRepository.create({
    id: testOrderId,
    tenant_id: 'vertex-default',
    user_id: testUserId,
    instrument_id: 'RELIANCE',
    side: 'BUY',
    order_type: 'MARKET',
    quantity: 10,
    price: 2500,
    trigger_price: null,
    status: 'PENDING',
    broker_order_id: null,
    normalized_status: 'PENDING',
    filled_quantity: 0,
    remaining_quantity: 10,
    average_fill_price: 0,
    time_in_force: 'DAY',
    cancelled_at: null,
  });

  // Querying orders with TNT-001 must return the order created under vertex-default
  const ordersInTnt001 = await authoritativeTradingDataService.getOrders('TNT-001');
  const foundOrder = ordersInTnt001.orders.find((o) => o.id === testOrderId);
  assert.ok(foundOrder, 'Order created in vertex-default must be returned when querying TNT-001');
  console.log('✓ PASS: getOrders returns order across default tenant fallback');

  // 6. Test Position fallback
  const testPosId = `pos_fall_${Date.now()}`;
  await postgresPositionRepository.upsertPosition({
    id: testPosId,
    tenant_id: 'vertex-default',
    user_id: testUserId,
    instrument_id: 'INFY',
    quantity: 25,
    average_price: 1500,
    realized_pnl: 0,
    unrealized_pnl: 250,
    margin_used: 7500,
  });

  const posInTnt001 = await authoritativeTradingDataService.getPositions('TNT-001');
  const foundPos = posInTnt001.positions.find((p) => p.user_id === testUserId && p.instrument_id === 'INFY');
  assert.ok(foundPos, 'Position created in vertex-default must be returned when querying TNT-001');
  console.log('✓ PASS: getPositions returns position across default tenant fallback');

  // 7. Test getTradingSummary & getFinancialSummary across tenants
  const summary = await authoritativeTradingDataService.getTradingSummary('TNT-001');
  assert.ok(summary.metrics.total_users > 0, 'Summary total_users must be > 0');
  assert.ok(summary.metrics.pending_orders_count > 0, 'Summary pending_orders must include fallback');
  console.log('✓ PASS: getTradingSummary aggregates across default tenant fallback');

  // 8. Test getClientAccount without 403 TENANT_MISMATCH
  const account = await authoritativeTradingDataService.getClientAccount('TNT-001', testUserId);
  assert.strictEqual(account.trading_user_id, testUserId);
  assert.ok(account.account.balance > 0, 'Account balance must be present');
  console.log('✓ PASS: getClientAccount resolves cross-tenant client account without 403');

  // 9. Test Outbox Dead-Letter Reset & Startup Sync
  // Insert a mock DEAD_LETTER outbox entry
  await pgDb.query(`
    INSERT INTO trading_outbox (id, event_id, tenant_id, event_type, payload, status, attempt_count, max_attempts, next_attempt_at, created_at)
    VALUES ('test-dead-letter-1', 'evt-dead-1', 'TNT-001', 'client.registered', '{}', 'DEAD_LETTER', 5, 5, NOW(), NOW())
    ON CONFLICT (event_id) DO UPDATE SET status = 'DEAD_LETTER';
  `);

  const resetCount = await transactionalOutboxService.resetFailedAndDeadLetterEvents();
  assert.ok(resetCount > 0, 'Should reset at least 1 dead-letter event');

  const checkReset = await pgDb.query('SELECT status FROM trading_outbox WHERE id = $1', ['test-dead-letter-1']);
  assert.strictEqual(checkReset.rows[0].status, 'PENDING', 'Dead letter must be reset to PENDING');
  console.log('✓ PASS: resetFailedAndDeadLetterEvents successfully restored DEAD_LETTER to PENDING');

  // Test syncAllCurrentDataToCentralAdmin
  const syncResult = await transactionalOutboxService.syncAllCurrentDataToCentralAdmin('TNT-001');
  assert.ok(syncResult.clientsCount > 0, 'Startup sync must enqueue clients');
  console.log('✓ PASS: syncAllCurrentDataToCentralAdmin successfully enqueued current state');

  console.log('\nALL TENANT-AGNOSTIC & BACKFILL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
