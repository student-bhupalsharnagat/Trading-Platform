import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { db } from '../src/server/db/database.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders } from '../src/server/auth/internalAuth.ts';
import { authService } from '../src/server/services/authService.ts';
import internalRoutes from '../src/server/routes/internal/index.ts';
import tenantRoutes from '../src/server/routes/tenantRoutes.ts';
import authRoutes from '../src/server/routes/authRoutes.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';
import adminRoutes from '../src/server/routes/admin/index.ts';
import {
  getTenantOrders,
  getTenantPositions,
  getTenantWallet,
  setTenantPositions,
  setTenantOrders,
  initialPositions,
  initialOrders,
} from '../src/server/trading/tradingStore.ts';
import { auditService } from '../src/server/services/auditService.ts';
import { tenantRepository } from '../src/server/repositories/JsonTenantRepository.ts';
import { pgDb } from '../src/server/db/postgres.ts';

const config = getInternalAuthConfig();
const SECRET = config.internalCommunicationSecret;

async function runPhase5CTests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5C TEST SUITE: 24 TARGET TESTS');
  console.log('Central Admin Emergency Controls & Tenant Configuration Sync');
  console.log('================================================================\n');

  // Seed super admin and setup database
  await hierarchyService.ensureSuperAdmin();

  // Create an active test trader
  let testTrader = db.findUserByUserId('TRADER-TEST-5C');
  if (!testTrader) {
    testTrader = db.createUser({
      fullName: 'Trader 5C Test',
      userId: 'TRADER-TEST-5C',
      countryCode: '+91',
      mobile: '9999900051',
      passwordHash: 'hashedpassword123',
      tenantId: 'vertex-default',
    });
  } else {
    db.setUserFrozen(testTrader.user_id, false);
  }

  // Create a trader in another tenant for cross-tenant testing
  let otherTenantTrader = db.findUserByUserId('TRADER-OTHER-TENANT');
  if (!otherTenantTrader) {
    otherTenantTrader = db.createUser({
      fullName: 'Other Tenant Trader',
      userId: 'TRADER-OTHER-TENANT',
      countryCode: '+91',
      mobile: '9999900099',
      passwordHash: 'hashedpassword123',
      tenantId: 'apex-capital',
    });
  }

  // Generate valid browser auth tokens
  const traderToken = authService.generateToken(testTrader);

  // Setup Express App
  const app = express();
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(resolveTenantMiddleware);

  // Mount routes
  app.use('/api/internal/v1', internalRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passedCount = 0;
  let failedCount = 0;

  function assertTest(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name}`, details ? JSON.stringify(details, null, 2) : '');
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. TENANT CONFIG SYNC (Tests 1 - 6)
    // -------------------------------------------------------------------------

    // Test 1: POST /api/internal/v1/tenant/sync with valid config -> 200
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        tenantStatus: 'active',
        tradingEnabled: true,
        registrationEnabled: true,
        apiEnabled: true,
        maintenanceMode: false,
        maxLeverage: 100,
        configVersion: 10,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 1: Tenant Sync with valid config -> 200',
        res.status === 200 && data.success === true && data.tenantId === 'vertex-default',
        { status: res.status, data }
      );
    }

    // Test 2: POST /api/internal/v1/tenant/sync with tradingEnabled=false updates runtime status
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        tradingEnabled: false,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      const configAfter = await tenantRepository.getPlatformConfig('vertex-default');
      const statusAfter = await tenantRepository.getStatus('vertex-default');
      assertTest(
        'Test 2: Tenant Sync tradingEnabled=false sets trading_killswitch_active',
        res.status === 200 &&
          configAfter?.trading_enabled === false &&
          statusAfter?.trading_killswitch_active === true,
        { configAfter, statusAfter }
      );
    }

    // Test 3: POST /api/internal/v1/tenant/sync with maintenanceMode=true sets maintenance_active
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        maintenanceMode: true,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const statusAfter = await tenantRepository.getStatus('vertex-default');
      assertTest(
        'Test 3: Tenant Sync maintenanceMode=true sets maintenance_active',
        res.status === 200 && statusAfter?.maintenance_active === true,
        { statusAfter }
      );
    }

    // Test 4: POST /api/internal/v1/tenant/sync with invalid field types -> 400
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        tradingEnabled: 'invalid_boolean',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assertTest(
        'Test 4: Tenant Sync with invalid types -> 400',
        res.status === 400,
        { status: res.status }
      );
    }

    // Test 5: POST /api/internal/v1/tenant/sync cross-tenant mismatch in body vs header -> 403
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        tenantId: 'apex-capital', // does not match header
        tradingEnabled: true,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 5: Tenant Sync cross-tenant mismatch in body vs header -> 403',
        res.status === 403 && data.code === 'TENANT_MISMATCH',
        { status: res.status, data }
      );
    }

    // Test 6: POST /api/internal/v1/tenant/sync restore clean active state for upcoming tests
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        tenantStatus: 'active',
        tradingEnabled: true,
        registrationEnabled: true,
        apiEnabled: true,
        maintenanceMode: false,
        maxLeverage: 100,
        configVersion: 11,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const statusAfter = await tenantRepository.getStatus('vertex-default');
      const configAfter = await tenantRepository.getPlatformConfig('vertex-default');
      assertTest(
        'Test 6: Tenant Sync restores active state -> trading_enabled=true, killswitch=false',
        res.status === 200 &&
          statusAfter?.trading_killswitch_active === false &&
          configAfter?.trading_enabled === true,
        { statusAfter, configAfter }
      );
    }

    // -------------------------------------------------------------------------
    // 2. EMERGENCY TRADING HALT & RESUME (Tests 7 - 12)
    // -------------------------------------------------------------------------

    // Test 7: POST /api/internal/v1/emergency/trading-halt with enabled=true -> 200
    {
      const path = '/api/internal/v1/emergency/trading-halt';
      const body = {
        enabled: true,
        reason: 'Circuit breaker triggered in market',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 7: Emergency trading halt enabled=true -> 200',
        res.status === 200 && data.tradingHalted === true,
        { status: res.status, data }
      );
    }

    // Test 8: Verify trader cannot place order when trading is halted -> 403
    {
      const orderRes = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'GOLD FUT',
          type: 'BUY',
          orderType: 'MARKET',
          lots: 1,
        }),
      });
      const orderData = await orderRes.json();
      assertTest(
        'Test 8: Trader placing order during trading halt -> 403 Forbidden',
        orderRes.status === 403,
        { status: orderRes.status, orderData }
      );
    }

    // Test 9: POST /api/internal/v1/emergency/trading-halt with enabled=false -> 200 (resumes)
    {
      const path = '/api/internal/v1/emergency/trading-halt';
      const body = {
        enabled: false,
        reason: 'Markets stabilized, resuming operations',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 9: Emergency trading halt enabled=false -> 200 trading resumed',
        res.status === 200 && data.tradingHalted === false,
        { status: res.status, data }
      );
    }

    // Test 10: Verify trader can place order again once trading is resumed -> 200
    {
      const wallet = getTenantWallet('vertex-default');
      wallet.availableBalance = 1000000;

      const orderRes = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'GOLD FUT',
          type: 'BUY',
          orderType: 'MARKET',
          lots: 1,
        }),
      });
      const orderData = await orderRes.json();
      assertTest(
        'Test 10: Trader placing order after resume -> 200 OK',
        orderRes.status === 200 && orderData.success === true,
        { status: orderRes.status, orderData }
      );
    }

    // Test 11: POST /api/internal/v1/emergency/trading-halt with invalid enabled value -> 400
    {
      const path = '/api/internal/v1/emergency/trading-halt';
      const body = {
        enabled: 'not_a_boolean',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assertTest(
        'Test 11: Emergency trading halt invalid enabled -> 400 Bad Request',
        res.status === 400,
        { status: res.status }
      );
    }

    // Test 12: POST /api/internal/v1/emergency/trading-halt cross-tenant mismatch -> 403
    {
      const path = '/api/internal/v1/emergency/trading-halt';
      const body = {
        tenantId: 'apex-capital', // mismatch with header
        enabled: true,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assertTest(
        'Test 12: Emergency trading halt cross-tenant mismatch -> 403 Forbidden',
        res.status === 403,
        { status: res.status }
      );
    }

    // -------------------------------------------------------------------------
    // 3. EMERGENCY CANCEL ALL ORDERS (Tests 13 - 16)
    // -------------------------------------------------------------------------

    // Setup pending orders in tenant
    const orders = getTenantOrders('vertex-default');
    orders.push({
      id: 'ORD-PENDING-1',
      symbol: 'GOLD FUT',
      type: 'BUY',
      orderType: 'LIMIT',
      product: 'INTRADAY',
      qty: 100,
      lots: 1,
      lotSize: 100,
      price: 155000.0,
      status: 'PENDING',
      time: '12:00:00',
      date: '31 Aug 2026',
      userId: testTrader.id,
      tenantId: 'vertex-default',
    });
    orders.push({
      id: 'ORD-PENDING-2',
      symbol: 'SILVER FUT',
      type: 'BUY',
      orderType: 'LIMIT',
      product: 'INTRADAY',
      qty: 30,
      lots: 1,
      lotSize: 30,
      price: 2300.0,
      status: 'PENDING',
      time: '12:05:00',
      date: '31 Aug 2026',
      userId: 'ANOTHER-USER-ID',
      tenantId: 'vertex-default',
    });

    // Test 13: POST /api/internal/v1/emergency/cancel-all-orders with scope=TENANT -> 200
    {
      const path = '/api/internal/v1/emergency/cancel-all-orders';
      const body = {
        scope: 'TENANT',
        reason: 'Emergency tenant-wide order purge',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 13: Emergency Cancel All Orders (TENANT scope) -> 200 & cancelledCount >= 2',
        res.status === 200 && data.success === true && data.cancelledCount >= 2,
        { status: res.status, data }
      );
    }

    // Setup another pending order for Test 14
    orders.push({
      id: 'ORD-PENDING-TEST-TRADER',
      symbol: 'COPPER FUT',
      type: 'BUY',
      orderType: 'LIMIT',
      product: 'INTRADAY',
      qty: 2500,
      lots: 1,
      lotSize: 2500,
      price: 840.0,
      status: 'PENDING',
      time: '12:10:00',
      date: '31 Aug 2026',
      userId: testTrader.id,
      tenantId: 'vertex-default',
    });

    // Test 14: POST /api/internal/v1/emergency/cancel-all-orders with scope=USER -> 200
    {
      const path = '/api/internal/v1/emergency/cancel-all-orders';
      const body = {
        scope: 'USER',
        userId: testTrader.user_id,
        reason: 'Purge orders for target user',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 14: Emergency Cancel All Orders (USER scope) -> 200 for target user',
        res.status === 200 && data.success === true && data.cancelledCount >= 1,
        { status: res.status, data }
      );
    }

    // Test 15: POST /api/internal/v1/emergency/cancel-all-orders with scope=USER but missing userId -> 400
    {
      const path = '/api/internal/v1/emergency/cancel-all-orders';
      const body = {
        scope: 'USER',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assertTest(
        'Test 15: Cancel All Orders with scope=USER missing userId -> 400 Bad Request',
        res.status === 400,
        { status: res.status }
      );
    }

    // Test 16: POST /api/internal/v1/emergency/cancel-all-orders cross-tenant user targeting -> 403
    {
      const path = '/api/internal/v1/emergency/cancel-all-orders';
      const body = {
        scope: 'USER',
        userId: otherTenantTrader.user_id, // belongs to apex-capital
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 16: Cancel All Orders for user in another tenant -> 403 Forbidden',
        res.status === 403 && data.code === 'TENANT_MISMATCH',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // 4. EMERGENCY SQUARE-OFF ALL (Tests 17 - 20)
    // -------------------------------------------------------------------------

    // Setup positions for testing square-off
    await pgDb.query('DELETE FROM trading_positions WHERE tenant_id = $1', ['vertex-default']).catch(() => {});
    const walletBefore = getTenantWallet('vertex-default');
    const positions = getTenantPositions('vertex-default');
    positions.length = 0;
    positions.push({
      id: 'POS-SQ-1',
      symbol: 'GOLD FUT',
      category: 'COMMODITY',
      type: 'BUY',
      product: 'INTRADAY',
      qty: 100,
      lots: 1,
      lotSize: 100,
      avgPrice: 157000.0,
      ltp: 157300.0,
      pnl: 30000.0,
      pnlPercent: 0.19,
      timestamp: new Date().toISOString(),
      userId: testTrader.id,
      tenantId: 'vertex-default',
    });
    positions.push({
      id: 'POS-SQ-2',
      symbol: 'SILVER FUT',
      category: 'COMMODITY',
      type: 'BUY',
      product: 'INTRADAY',
      qty: 30,
      lots: 1,
      lotSize: 30,
      avgPrice: 2400.0,
      ltp: 2380.0,
      pnl: -600.0,
      pnlPercent: -0.83,
      timestamp: new Date().toISOString(),
      userId: 'ANOTHER-USER-ID',
      tenantId: 'vertex-default',
    });

    // Test 17: POST /api/internal/v1/emergency/square-off-all with scope=TENANT -> 200
    {
      const path = '/api/internal/v1/emergency/square-off-all';
      const body = {
        scope: 'TENANT',
        reason: 'Emergency risk threshold breach',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const positionsAfter = getTenantPositions('vertex-default');
      assertTest(
        'Test 17: Emergency Square-Off All (TENANT scope) closes all positions -> 200',
        res.status === 200 && data.squaredOffCount === 2 && positionsAfter.length === 0,
        { status: res.status, data, remaining: positionsAfter.length }
      );
    }

    // Setup single position for USER scope test
    positions.push({
      id: 'POS-SQ-USER',
      symbol: 'GOLD FUT',
      category: 'COMMODITY',
      type: 'BUY',
      product: 'INTRADAY',
      qty: 100,
      lots: 1,
      lotSize: 100,
      avgPrice: 157000.0,
      ltp: 157300.0,
      pnl: 30000.0,
      pnlPercent: 0.19,
      timestamp: new Date().toISOString(),
      userId: testTrader.id,
      tenantId: 'vertex-default',
    });

    // Test 18: POST /api/internal/v1/emergency/square-off-all with scope=USER -> 200
    {
      const path = '/api/internal/v1/emergency/square-off-all';
      const body = {
        scope: 'USER',
        userId: testTrader.user_id,
        reason: 'User margin default square-off',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 18: Emergency Square-Off All (USER scope) -> 200 closes user positions',
        res.status === 200 && data.squaredOffCount === 1,
        { status: res.status, data }
      );
    }

    // Test 19: POST /api/internal/v1/emergency/square-off-all cross-tenant user targeting -> 403
    {
      const path = '/api/internal/v1/emergency/square-off-all';
      const body = {
        scope: 'USER',
        userId: otherTenantTrader.user_id, // belongs to apex-capital
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 19: Emergency Square-Off All targeting user in other tenant -> 403 Forbidden',
        res.status === 403 && data.code === 'TENANT_MISMATCH',
        { status: res.status, data }
      );
    }

    // Test 20: POST /api/internal/v1/emergency/square-off-all invalid scope -> 400
    {
      const path = '/api/internal/v1/emergency/square-off-all';
      const body = {
        scope: 'GLOBAL',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assertTest(
        'Test 20: Emergency Square-Off All with invalid scope -> 400 Bad Request',
        res.status === 400,
        { status: res.status }
      );
    }

    // -------------------------------------------------------------------------
    // 5. EMERGENCY FREEZE USER (Tests 21 - 23)
    // -------------------------------------------------------------------------

    // Test 21: POST /api/internal/v1/emergency/freeze-user freeze=true -> 200
    {
      const path = '/api/internal/v1/emergency/freeze-user';
      const body = {
        userId: testTrader.user_id,
        freeze: true,
        reason: 'Compliance audit pending',
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const updatedInDb = db.findUserByUserId(testTrader.user_id);
      assertTest(
        'Test 21: Emergency Freeze User freeze=true -> 200 and user marked frozen',
        res.status === 200 && data.frozen === true && updatedInDb?.is_frozen === true,
        { status: res.status, data, updatedInDb }
      );
    }

    // Test 22: Verify frozen user cannot trade -> 403 Forbidden
    {
      const orderRes = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'GOLD FUT',
          type: 'BUY',
          orderType: 'MARKET',
          lots: 1,
        }),
      });
      const orderData = await orderRes.json();
      assertTest(
        'Test 22: Frozen trader placing order -> 403 Forbidden',
        orderRes.status === 403 && (orderData.code === 'USER_FROZEN' || orderData.isFrozen === true),
        { status: orderRes.status, orderData }
      );
    }

    // Test 23: POST /api/internal/v1/emergency/freeze-user cross-tenant user targeting -> 403
    {
      const path = '/api/internal/v1/emergency/freeze-user';
      const body = {
        userId: otherTenantTrader.user_id, // belongs to apex-capital
        freeze: true,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 23: Freeze user in another tenant -> 403 Forbidden',
        res.status === 403 && data.code === 'TENANT_MISMATCH',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // 6. TENANT RISK SUMMARY & AUDIT LOGGING (Test 24)
    // -------------------------------------------------------------------------

    // Test 24: GET /api/internal/v1/risk/summary returns aggregate telemetry without leaks
    {
      const path = '/api/internal/v1/risk/summary';
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'GET',
        path,
      });

      const res = await fetch(`${baseUrl}${path}`, { headers });
      const data = await res.json();

      const hasRequiredFields =
        data.success === true &&
        typeof data.totalOpenPositions === 'number' &&
        typeof data.totalOpenOrders === 'number' &&
        typeof data.totalExposure === 'number' &&
        typeof data.usedMargin === 'number' &&
        typeof data.availableMargin === 'number' &&
        typeof data.activeTraders === 'number' &&
        typeof data.tradingHalted === 'boolean';

      // Verify no sensitive keys leaked in the risk telemetry
      const jsonStr = JSON.stringify(data);
      const containsSecrets =
        jsonStr.includes(SECRET) ||
        jsonStr.includes('password') ||
        jsonStr.includes('X-Internal-Signature');

      // Verify audit logs were written
      const recentAudit = auditService.getEmergencyLogs('vertex-default');

      assertTest(
        'Test 24: Risk summary returns valid metrics without leaking secrets and audit trail recorded',
        res.status === 200 && hasRequiredFields && !containsSecrets && recentAudit.length > 0,
        { status: res.status, data, auditEventsCount: recentAudit.length }
      );
    }

  } catch (err) {
    console.error('Unexpected test execution error:', err);
    failedCount++;
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`PHASE 5C TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED out of 24`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5CTests().catch((err) => {
  console.error('Fatal error running Phase 5C test suite:', err);
  process.exit(1);
});
