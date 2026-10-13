/**
 * Automated Verification: Standard Platform (Zerodha Kite / Upstox) Capabilities
 * & End-to-End Real-Time Trading Platform <-> Admin Panel Data Integration
 */

import { authService } from '../src/server/services/authService.ts';
import { db } from '../src/server/db/database.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { adminDashboardService } from '../src/server/services/adminDashboardService.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresFundTransactionRepository } from '../src/server/repositories/trading/PostgresFundTransactionRepository.ts';
import { postgresLedgerRepository } from '../src/server/repositories/trading/PostgresLedgerRepository.ts';

async function runTest() {
  console.log('--- STARTING UPSTOX/ZERODHA CAPABILITIES & ADMIN INTEGRATION TEST ---');

  // Step 0: Ensure migrations are up-to-date
  await runMigrations();

  const tenantId = 'vertex-default';
  const testPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
  const testEmail = `trader_${Date.now()}@vertexmarkets.com`;

  // Step 1: Register real client trader
  console.log('[1/7] Registering new trader client in Trading Platform...');
  const testUserId = `trader_${Date.now()}`;
  const regResult = await authService.register(
    {
      fullName: 'Arjun Verma',
      userId: testUserId,
      password: 'SecurePassword@123',
      confirmPassword: 'SecurePassword@123',
    },
    tenantId
  );

  const registeredUser = db.findUserByUserId(testUserId);
  if (!registeredUser) {
    throw new Error('User registration failed');
  }

  // Ensure user is verified and active
  await db.updateUser(registeredUser.id, { is_verified: true, status: 'active' });
  const verifiedUser = db.findUserById(registeredUser.id);
  if (!verifiedUser || verifiedUser.status !== 'active') {
    throw new Error('User activation failed');
  }
  console.log(`✅ Trader account registered: ${verifiedUser.user_id} (${verifiedUser.full_name})`);

  // Step 2: Initialize & Fund Trader Wallet
  console.log('[2/7] Depositing funds into trader wallet...');
  const initialWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, verifiedUser.user_id);
  await postgresWalletRepository.updateWallet(tenantId, verifiedUser.user_id, {
    available_balance: 500000,
    blocked_balance: 0,
    used_margin: 0,
    realized_pnl: 0,
  });
  const fundedWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, verifiedUser.user_id);
  if (fundedWallet.available_balance !== 500000) {
    throw new Error(`Failed to fund wallet: expected 500000, got ${fundedWallet.available_balance}`);
  }
  console.log(`✅ Wallet funded: Available Margin = ₹${fundedWallet.available_balance}`);

  // Step 3: Record Fund Deposit Transaction & Ledger Entry
  console.log('[3/7] Recording Deposit Transaction in Fund Repository & Ledger...');
  const txId = `TX-${Date.now()}`;
  const depositTx = await postgresFundTransactionRepository.create({
    id: txId,
    tenant_id: tenantId,
    user_id: verifiedUser.user_id,
    transaction_type: 'DEPOSIT',
    amount: 500000,
    status: 'APPROVED',
    payment_method: 'UPI Instant',
    reference_id: `UPI-${Date.now()}`,
    approved_by: 'ADMIN',
    approved_at: new Date().toISOString(),
    rejected_by: null,
    rejected_at: null,
    failure_reason: null,
  });

  await postgresLedgerRepository.createEntry({
    tenant_id: tenantId,
    user_id: verifiedUser.user_id,
    transaction_id: depositTx.id,
    type: 'CREDIT',
    category: 'DEPOSIT',
    amount: 500000,
    balance_before: 0,
    balance_after: 500000,
    reference: 'Bank Payin Approval',
    created_by: 'ADMIN',
  });
  console.log(`✅ Deposit transaction recorded: ${depositTx.id}`);

  // Step 4: Execute Upstox/Zerodha Standard Order: MARKET MIS (Intraday)
  console.log('[4/7] Placing MARKET order for RELIANCE (5x Leverage MIS)...');
  const marketOrder = await tradingExecutionService.placeOrder({
    tenantId,
    userId: verifiedUser.user_id,
    symbol: 'RELIANCE',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'INTRADAY',
    lots: 1,
    quantity: 10,
  });

  if (!marketOrder.success || marketOrder.order.status !== 'EXECUTED') {
    throw new Error('Market order execution failed');
  }
  console.log(`✅ MARKET Order Executed: Order ID ${marketOrder.order.id}, Fill Price: ₹${marketOrder.order.price}`);

  // Step 5: Place Upstox/Zerodha Standard Order: LIMIT & SL (Stop-Loss)
  console.log('[5/7] Placing SL (Stop Loss Limit) Order with Trigger Price...');
  const slOrder = await tradingExecutionService.placeOrder({
    tenantId,
    userId: verifiedUser.user_id,
    symbol: 'RELIANCE',
    side: 'SELL',
    orderType: 'SL',
    product: 'INTRADAY',
    lots: 1,
    quantity: 10,
    price: 2850.0,
    triggerPrice: 2870.0,
  });

  if (!slOrder.success || slOrder.order.status !== 'PENDING') {
    throw new Error('Stop-loss order placement failed');
  }
  if (slOrder.order.trigger_price !== 2870) {
    throw new Error(`Expected trigger price 2870, got ${slOrder.order.trigger_price}`);
  }
  console.log(`✅ SL Order Placed in PENDING state: Trigger = ₹${slOrder.order.trigger_price}, Limit = ₹${slOrder.order.price}`);

  // Step 6: Verify Admin Data Synchronization (Admin Panel as Control/Reporting Truth)
  console.log('[6/7] Verifying Admin Panel Real Data Retrieval & Dashboard KPIs...');

  // A. Check Admin Orders Desk
  const adminOrdersRes = await authoritativeTradingDataService.getOrders(tenantId, { userId: verifiedUser.user_id });
  const adminOrders = adminOrdersRes.orders || [];
  if (adminOrders.length < 2) {
    throw new Error(`Admin orders query returned ${adminOrders.length}, expected at least 2`);
  }
  console.log(`✅ Admin Orders Desk: Found ${adminOrders.length} orders for client`);

  // B. Check Admin Trades Desk
  const adminTradesRes = await authoritativeTradingDataService.getTrades(tenantId, { userId: verifiedUser.user_id });
  const adminTrades = adminTradesRes.trades || [];
  if (adminTrades.length < 1) {
    throw new Error(`Admin trades query returned ${adminTrades.length}, expected at least 1`);
  }
  console.log(`✅ Admin Trades Desk: Found ${adminTrades.length} executed trades for client`);

  // C. Check Admin Risk & Open Positions
  const adminPositions = await postgresPositionRepository.getPositions(tenantId, verifiedUser.user_id);
  const openPos = adminPositions.find((p) => p.instrument_id === 'RELIANCE');
  if (!openPos || Number(openPos.quantity) <= 0) {
    throw new Error('Admin risk query failed to find open position for client');
  }
  console.log(`✅ Admin Risk Management: Open position found for RELIANCE with Qty ${openPos.quantity}, Avg Price ₹${openPos.average_price}`);

  // D. Check Admin Ledger
  const adminLedger = await postgresLedgerRepository.getByUserId(verifiedUser.user_id, tenantId);
  if (adminLedger.length < 1) {
    throw new Error('Admin ledger query returned 0 entries');
  }
  console.log(`✅ Admin Financial Ledger: Found ${adminLedger.length} immutable entries`);

  // E. Check Admin Dashboard Real KPIs
  const superAdminCaller = {
    id: 'super-admin-root',
    user_id: 'SUPER_ADMIN',
    role: 'SUPER_ADMIN',
    hierarchy_path: 'root',
    tenant_id: tenantId,
  } as any;

  const kpis = await adminDashboardService.getKPIs(superAdminCaller);
  const chartPoints = await adminDashboardService.getChartData(tenantId);

  if (kpis.todayTurnover <= 0 || kpis.tradingVolume <= 0) {
    throw new Error('Admin Dashboard KPIs turnover must reflect actual trades!');
  }
  console.log(`✅ Admin Dashboard Real KPIs Verified:`);
  console.log(`   - Today Turnover: ₹${kpis.todayTurnover}`);
  console.log(`   - Total Trading Volume: ₹${kpis.tradingVolume}`);
  console.log(`   - Total Clients: ${kpis.totalClients}`);
  console.log(`   - Active Clients: ${kpis.activeClients}`);
  console.log(`   - Weekly Chart Points: ${chartPoints.length} days generated`);

  console.log('[7/7] ALL UPSTOX/ZERODHA CAPABILITIES & ADMIN INTEGRATION TESTS PASSED!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
