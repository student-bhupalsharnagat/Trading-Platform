import assert from 'assert';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { postgresClientMappingRepository } from '../src/server/repositories/PostgresClientMappingRepository.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { authService } from '../src/server/services/authService.ts';

async function run() {
  console.log('=== Testing /api/internal/v1/trading/* Performance & Immediate Signup Provisioning ===');

  // 1. Initialize migrations
  await runMigrations();

  // 2. Test Immediate Signup Provisioning (AuthService.register)
  const signupUserId = `fast_user_${Date.now()}`;
  const signupMobile = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
  const regResult = await authService.register({
    fullName: 'Immediate Signup User',
    userId: signupUserId,
    mobile: signupMobile,
    password: 'Password123!',
    countryCode: '+91',
  }, 'TNT-001');

  assert.ok(regResult.user, 'User should be registered successfully');
  console.log('✓ PASS: User registered via authService.register');

  // Verify client_mappings exists immediately in Postgres
  const mapRes = await pgDb.query(
    'SELECT * FROM client_mappings WHERE user_id = $1 AND tenant_id = $2',
    [signupUserId, 'TNT-001']
  );
  assert.ok(mapRes.rows.length > 0, 'client_mappings row must be created immediately on signup');
  console.log('✓ PASS: client_mappings created immediately during signup');

  // Verify trading_wallets exists immediately in Postgres
  const walRes = await pgDb.query(
    'SELECT * FROM trading_wallets WHERE user_id = $1 AND tenant_id = $2',
    [signupUserId, 'TNT-001']
  );
  assert.ok(walRes.rows.length > 0, 'trading_wallets row must be created immediately on signup');
  console.log('✓ PASS: trading_wallets created immediately during signup');

  // Verify client_identity_mappings exists immediately in Postgres
  const cidRes = await pgDb.query(
    'SELECT * FROM client_identity_mappings WHERE trading_user_id = $1 AND tenant_id = $2',
    [signupUserId, 'TNT-001']
  );
  assert.ok(cidRes.rows.length > 0, 'client_identity_mappings row must be created immediately on signup');
  console.log('✓ PASS: client_identity_mappings created immediately during signup');

  // 3. Performance Benchmark on all 7 Trading Endpoints
  // Measure getClientsPaged
  const t0 = performance.now();
  const clientsRes = await authoritativeTradingDataService.getClientsPaged('TNT-001', { page: 1, limit: 50 });
  const tClients = performance.now() - t0;
  console.log(`getClientsPaged completed in ${tClients.toFixed(2)}ms (found ${clientsRes.total} clients)`);
  assert.ok(tClients < 100, `getClientsPaged took ${tClients}ms, expected < 100ms`);
  assert.ok(clientsRes.clients.length > 0, 'Clients must be returned');

  // Measure getOrders
  const t1 = performance.now();
  const ordersRes = await authoritativeTradingDataService.getOrders('TNT-001', { limit: 50 });
  const tOrders = performance.now() - t1;
  console.log(`getOrders completed in ${tOrders.toFixed(2)}ms (found ${ordersRes.total} orders)`);
  assert.ok(tOrders < 100, `getOrders took ${tOrders}ms, expected < 100ms`);

  // Measure getTrades
  const t2 = performance.now();
  const tradesRes = await authoritativeTradingDataService.getTrades('TNT-001', { limit: 50 });
  const tTrades = performance.now() - t2;
  console.log(`getTrades completed in ${tTrades.toFixed(2)}ms (found ${tradesRes.total} trades)`);
  assert.ok(tTrades < 100, `getTrades took ${tTrades}ms, expected < 100ms`);

  // Measure getPositions
  const t3 = performance.now();
  const posRes = await authoritativeTradingDataService.getPositions('TNT-001', { limit: 50 });
  const tPositions = performance.now() - t3;
  console.log(`getPositions completed in ${tPositions.toFixed(2)}ms (found ${posRes.total} positions)`);
  assert.ok(tPositions < 100, `getPositions took ${tPositions}ms, expected < 100ms`);

  // Measure getFundsPaged
  const t4 = performance.now();
  const fundsRes = await authoritativeTradingDataService.getFundsPaged('TNT-001', { page: 1, limit: 50 });
  const tFunds = performance.now() - t4;
  console.log(`getFundsPaged completed in ${tFunds.toFixed(2)}ms (found ${fundsRes.total} transactions)`);
  assert.ok(tFunds < 100, `getFundsPaged took ${tFunds}ms, expected < 100ms`);

  // Measure getLedgerPaged
  const t5 = performance.now();
  const ledgerRes = await authoritativeTradingDataService.getLedgerPaged('TNT-001', { page: 1, limit: 50 });
  const tLedger = performance.now() - t5;
  console.log(`getLedgerPaged completed in ${tLedger.toFixed(2)}ms (found ${ledgerRes.total} entries)`);
  assert.ok(tLedger < 100, `getLedgerPaged took ${tLedger}ms, expected < 100ms`);

  // Measure getTradingSummary
  const t6 = performance.now();
  const summaryRes = await authoritativeTradingDataService.getTradingSummary('TNT-001');
  const tSummary = performance.now() - t6;
  console.log(`getTradingSummary completed in ${tSummary.toFixed(2)}ms (total users: ${summaryRes.metrics.total_users})`);
  assert.ok(tSummary < 100, `getTradingSummary took ${tSummary}ms, expected < 100ms`);

  console.log('\nALL PERFORMANCE AND SIGNUP PROVISIONING TESTS PASSED (<100ms)!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
