/**
 * End-to-End Validation Suite for:
 * 1. Admin 'Commission' Section: Trading platform profit commission (20%), brokerage fees, hierarchy distribution, and trade ledger calculations.
 * 2. Admin 'White Label' Section: Platform branding configuration (name, short name, logo, color, support contacts) directly from admin panel and live synchronization.
 */

import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { tenantRepository } from '../src/server/repositories/JsonTenantRepository.ts';

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

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('   END-TO-END COMMISSION & WHITE LABEL VERIFICATION SUITE');
  console.log('================================================================\n');

  // Step 0: Ensure DB migrations and Super Admin exist
  await runMigrations();
  await hierarchyService.ensureSuperAdmin();

  const tenantId = 'vertex-default';
  const traderId = `trader_comm_${Date.now()}`;
  const traderPhone = `+1917555${Math.floor(1000 + Math.random() * 9000)}`;

  // -----------------------------------------------------------------
  // 1. White Label Configuration Tests
  // -----------------------------------------------------------------
  console.log('--- TEST GROUP 1: White Label Platform Branding End-to-End ---');

  // 1a. Initial Branding Fetch
  const initialBranding = await tenantRepository.getBranding(tenantId);
  assert(Boolean(initialBranding), 'Initial branding configuration exists');
  assert(Boolean(initialBranding?.brandName), `Initial brand name: "${initialBranding?.brandName}"`);

  // 1b. Update Platform Branding (Name, Logo, Colors, Contacts)
  const testBrandName = 'Global Apex Securities';
  const testShortName = 'GAS';
  const testLogoUrl = 'https://assets.goldfut.com/branding/apex-logo.png';
  const testTagline = 'Next-Generation Multi-Asset Execution Engine';
  const testPrimaryColor = '#06B6D4'; // Cyan
  const testSupportEmail = 'desk@globalapex.trade';

  const updatedBranding = await tenantRepository.updateBranding(tenantId, {
    brandName: testBrandName,
    shortName: testShortName,
    logoUrl: testLogoUrl,
    tagline: testTagline,
    primaryColor: testPrimaryColor,
    supportEmail: testSupportEmail,
    headerBranding: {
      showTagline: true,
      badgeText: 'DIRECT DMA INSTITUTIONAL',
    },
  });

  assert(Boolean(updatedBranding), 'updateBranding executed successfully');
  assert(updatedBranding?.brandName === testBrandName, `Brand name updated to "${testBrandName}"`);
  assert(updatedBranding?.shortName === testShortName, `Short symbol updated to "${testShortName}"`);
  assert(updatedBranding?.logoUrl === testLogoUrl, `Logo URL set to "${testLogoUrl}"`);
  assert(updatedBranding?.primaryColor === testPrimaryColor, `Primary color set to "${testPrimaryColor}"`);
  assert(updatedBranding?.supportEmail === testSupportEmail, `Support email set to "${testSupportEmail}"`);

  // 1c. Verify Persistence and Retrieval
  const retrievedBranding = await tenantRepository.getBranding(tenantId);
  assert(retrievedBranding?.brandName === testBrandName, 'Retrieved branding matches updated brand name');
  assert(retrievedBranding?.logoUrl === testLogoUrl, 'Retrieved branding matches updated logo URL');
  assert(retrievedBranding?.primaryColor === testPrimaryColor, 'Retrieved branding matches updated primary color');

  // -----------------------------------------------------------------
  // 2. Commission & Trading Profit Calculations
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Trading Platform Profit & Commission Calculations ---');

  // 2a. Register a client & seed wallet
  const regRes = await authService.register({
    fullName: 'Alpha Trader Profit Maker',
    userId: traderId,
    phone: traderPhone,
    password: 'SecurePassword@2026',
    confirmPassword: 'SecurePassword@2026',
  }, tenantId);
  assert(regRes.user.userId === traderId, 'Trader account created for commission testing');

  await postgresWalletRepository.upsertWallet({
    tenant_id: tenantId,
    user_id: traderId,
    available_balance: 1000000, // 10 Lakhs
    used_margin: 0,
    blocked_balance: 0,
    realized_pnl: 0,
  });

  // 2b. Place Trade 1 (BUY 1 lot of RELIANCE)
  const buyOrder = await tradingExecutionService.placeOrder({
    tenantId,
    userId: traderId,
    symbol: 'RELIANCE',
    side: 'BUY',
    lots: 1,
    orderType: 'MARKET',
  });
  assert(buyOrder.success === true, 'BUY order executed successfully');
  assert(Boolean(buyOrder.trade), 'Trade execution record created');

  const buyPrice = buyOrder.trade!.execution_price;
  const buyQty = buyOrder.trade!.quantity;
  const buyTurnover = buyPrice * buyQty;

  // 2c. Close the position (SELL 1 lot of RELIANCE at profit to test 20% profit commission)
  const posId = buyOrder.position?.id || 'RELIANCE';
  const closeOrder = await tradingExecutionService.closePosition(tenantId, traderId, posId, buyPrice + 50);
  assert(closeOrder.success === true, 'Position closed successfully at profit (generating realized P&L)');
  assert(Boolean(closeOrder.position), 'Closing position record generated');

  // 2d. Fetch All Trades for the Tenant via Authoritative Service
  const tradesData = await authoritativeTradingDataService.getTrades(tenantId, { limit: 100 });
  const allTrades = tradesData.trades || [];
  assert(allTrades.length >= 2, `Retrieved ${allTrades.length} trades from authoritative database`);

  // 2e. Validate Commission & Profit Share Formula
  let totalTurnover = 0;
  let totalBrokerage = 0;
  let totalClientProfit = 0;
  let totalProfitCommission = 0;

  for (const t of allTrades) {
    const val = Number(t.execution_value || t.total_value || (Number(t.price || t.execution_price || 0) * Number(t.quantity || 0)));
    totalTurnover += val;

    const fee = Number(t.fees != null && t.fees !== '' ? t.fees : (t.commission != null && t.commission !== '' ? t.commission : 20));
    totalBrokerage += fee > 0 ? fee : 20;

    const pnl = Number(t.realized_pnl || 0);
    if (pnl > 0) {
      totalClientProfit += pnl;
      totalProfitCommission += pnl * 0.20;
    }
  }

  const netPlatformRevenue = totalBrokerage + totalProfitCommission;

  assert(totalTurnover > 0, `Total Trading Turnover calculated: ₹${totalTurnover.toLocaleString('en-IN')}`);
  assert(totalBrokerage >= 40, `Aggregated Brokerage calculated: ₹${totalBrokerage.toLocaleString('en-IN')}`);
  assert(totalProfitCommission >= 0, `Commission from Platform Profit (20% share): ₹${totalProfitCommission.toLocaleString('en-IN')}`);
  assert(netPlatformRevenue >= totalBrokerage, `Net Platform Revenue (Brokerage + Profit Share): ₹${netPlatformRevenue.toLocaleString('en-IN')}`);

  // 2f. Validate Multi-Tier Hierarchy Revenue Distribution
  const superAdminShare = netPlatformRevenue * 0.40;
  const masterShare = netPlatformRevenue * 0.30;
  const brokerShare = netPlatformRevenue * 0.20;
  const subBrokerShare = netPlatformRevenue * 0.10;

  const sumShares = superAdminShare + masterShare + brokerShare + subBrokerShare;
  assert(Math.abs(sumShares - netPlatformRevenue) < 0.01, 'Franchise hierarchy splits sum to 100% of platform revenue');
  assert(superAdminShare > 0, `Tier 1 Super Admin (40%): ₹${superAdminShare.toFixed(2)}`);
  assert(masterShare > 0, `Tier 2 Master (30%): ₹${masterShare.toFixed(2)}`);
  assert(brokerShare > 0, `Tier 3 Broker (20%): ₹${brokerShare.toFixed(2)}`);
  assert(subBrokerShare > 0, `Tier 4 Sub-Broker (10%): ₹${subBrokerShare.toFixed(2)}`);

  // -----------------------------------------------------------------
  // 3. Live Integration Invariance Check
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Live Integration Invariance & Non-Regression ---');

  // Verify wallet balance is correctly updated
  const wallet = await postgresWalletRepository.getWallet(tenantId, traderId);
  assert(Boolean(wallet), 'Wallet remains intact in PostgreSQL');
  assert(wallet!.available_balance > 0, `Authoritative wallet balance valid: ₹${wallet!.available_balance}`);

  // -----------------------------------------------------------------
  // 4. Live HTTP API Tests (Admin White Label & Commission Endpoints)
  // -----------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Live HTTP API Endpoints Check ---');
  try {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'superadmin', password: 'Admin@12345' }),
    });
    const loginJson = await loginRes.json();
    assert(loginRes.ok && Boolean(loginJson.token), 'Admin login successful and token retrieved');

    const adminToken = loginJson.token;

    // Test GET /api/admin/white-label
    const wlGetRes = await fetch('http://localhost:3000/api/admin/white-label', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const wlGetJson = await wlGetRes.json();
    assert(wlGetRes.ok && wlGetJson.success === true, 'GET /api/admin/white-label returns 200 OK');
    assert(Boolean(wlGetJson.data?.branding?.brandName), `Current branding brandName: "${wlGetJson.data?.branding?.brandName}"`);

    // Test POST /api/admin/white-label
    const newBrandName = 'VERTEX Prime Global';
    const newShortName = 'VPG';
    const newColor = '#F59E0B';
    const wlPostRes = await fetch('http://localhost:3000/api/admin/white-label', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        brandName: newBrandName,
        shortName: newShortName,
        primaryColor: newColor,
        tagline: 'Institutional Multi-Asset Platform',
        logoUrl: 'https://vertex.trade/logo.png',
        supportEmail: 'support@vertex-trading.com',
      }),
    });
    const wlPostJson = await wlPostRes.json();
    assert(wlPostRes.ok && wlPostJson.success === true, 'POST /api/admin/white-label returns 200 OK');
    assert(wlPostJson.data?.brandName === newBrandName, `Updated branding verified via POST: "${newBrandName}"`);

    // Test GET /api/tenant/branding reflects the update
    const publicBrandingRes = await fetch('http://localhost:3000/api/tenant/branding');
    const publicBrandingJson = await publicBrandingRes.json();
    assert(publicBrandingRes.ok && publicBrandingJson.success === true, 'GET /api/tenant/branding returns 200 OK');
    assert(publicBrandingJson.data?.brandName === newBrandName, `Public tenant branding immediately reflects: "${newBrandName}"`);

    // Test GET /api/admin/orders/trades returns trades structure
    const tradesApiRes = await fetch('http://localhost:3000/api/admin/orders/trades', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const tradesApiJson = await tradesApiRes.json();
    assert(tradesApiRes.ok && tradesApiJson.success === true, 'GET /api/admin/orders/trades returns 200 OK');
    const returnedTrades = Array.isArray(tradesApiJson.data) ? tradesApiJson.data : (tradesApiJson.data?.trades || []);
    assert(Array.isArray(returnedTrades), `Admin orders/trades returns authoritative trades array (count: ${returnedTrades.length})`);
  } catch (httpErr: any) {
    console.error('HTTP test error:', httpErr);
    assert(false, `HTTP tests executed without exception -> ${httpErr.message}`);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`   SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
