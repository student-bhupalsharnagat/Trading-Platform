import 'dotenv/config';
import assert from 'assert';
import { marketDataGateway } from '../src/server/gateways/MarketDataGateway.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';
import { setTenantPositions, setTenantWallet, INSTRUMENTS } from '../src/server/trading/tradingStore.ts';

async function runTests() {
  console.log('--- Testing Real-Time MTM P&L, LTP, and Position Streaming ---');

  // 1. Test MarketDataGateway in-memory live price map
  console.log('\n1. Testing MarketDataGateway Live Price Map...');
  marketDataGateway.updatePrice('RELIANCE', {
    symbol: 'RELIANCE',
    ltp: 2650.50,
    bid: 2650.00,
    ask: 2651.00,
    change: 50.50,
    changePercent: 1.94,
    timestamp: Date.now(),
  });

  const reliancePrice = marketDataGateway.getPrice('RELIANCE');
  assert(reliancePrice, 'Price for RELIANCE must be found in live price map');
  assert.strictEqual(reliancePrice.ltp, 2650.50, 'LTP must match updated price');
  assert.strictEqual(marketDataGateway.getLtp('RELIANCE'), 2650.50, 'getLtp must return 2650.50');

  const snapshot = marketDataGateway.getLivePriceSnapshot();
  assert(snapshot['RELIANCE'], 'Snapshot must include RELIANCE');
  console.log('✓ MarketDataGateway live price map verified.');

  // 2. Set up test position in memory
  console.log('\n2. Testing Live Tick-Driven MTM Calculation in authoritativeTradingDataService.getPositions...');
  const testTenant = 'vertex-default';
  setTenantPositions(testTenant, [
    {
      id: 'pos-test-rel-buy',
      userId: 'test_trader_1',
      symbol: 'RELIANCE',
      type: 'BUY',
      qty: 10,
      lots: 1,
      avgPrice: 2600.00,
      ltp: 2600.00,
      pnl: 0,
      timestamp: new Date().toISOString(),
      orderId: 'ord-test-1',
    } as any,
    {
      id: 'pos-test-rel-sell',
      userId: 'test_trader_2',
      symbol: 'RELIANCE',
      type: 'SELL',
      qty: 5,
      lots: 1,
      avgPrice: 2700.00,
      ltp: 2700.00,
      pnl: 0,
      timestamp: new Date().toISOString(),
      orderId: 'ord-test-2',
    } as any,
  ]);

  const posRes = await authoritativeTradingDataService.getPositions(testTenant);
  const buyPos = posRes.positions.find((p: any) => p.id === 'pos-test-rel-buy');
  const sellPos = posRes.positions.find((p: any) => p.id === 'pos-test-rel-sell');

  assert(buyPos, 'Buy position must be found');
  assert.strictEqual(buyPos.currentPrice, 2650.50, 'Buy position currentPrice must match live LTP');
  // (2650.50 - 2600) * 10 = +505
  assert.strictEqual(buyPos.mtmPnl, 505.00, 'Buy position mtmPnl must be (2650.50 - 2600) * 10 = 505.00');
  assert.strictEqual(buyPos.unrealizedPnL, 505.00, 'Buy position unrealizedPnL must match 505.00');

  assert(sellPos, 'Sell position must be found');
  assert.strictEqual(sellPos.currentPrice, 2650.50, 'Sell position currentPrice must match live LTP');
  // (2700 - 2650.50) * 5 = +247.50
  assert.strictEqual(sellPos.mtmPnl, 247.50, 'Sell position mtmPnl must be (2700 - 2650.50) * 5 = 247.50');
  assert.strictEqual(sellPos.unrealizedPnL, 247.50, 'Sell position unrealizedPnL must match 247.50');

  console.log('✓ authoritativeTradingDataService.getPositions dynamic MTM calculation verified.');

  // 3. Test getClientsPaged dynamic unrealizedPnL and totalEquity calculation
  console.log('\n3. Testing getClientsPaged Aggregated Live unrealizedPnL & totalEquity...');
  const clientsRes = await authoritativeTradingDataService.getClientsPaged(testTenant, { limit: 10 });
  assert(clientsRes && clientsRes.clients, 'getClientsPaged must return clients array');
  for (const client of clientsRes.clients) {
    assert(typeof client.totalEquity === 'number', 'client.totalEquity must be numeric');
    assert(typeof client.unrealizedPnL === 'number', 'client.unrealizedPnL must be numeric');
    assert.strictEqual(
      Number(client.totalEquity.toFixed(2)),
      Number((client.walletBalance + client.unrealizedPnL).toFixed(2)),
      `client totalEquity (${client.totalEquity}) must equal walletBalance (${client.walletBalance}) + unrealizedPnL (${client.unrealizedPnL})`
    );
  }
  console.log('✓ getClientsPaged live aggregated unrealizedPnL & totalEquity verified.');

  // 4. Test getSnapshot authoritative response
  console.log('\n4. Testing authoritativeTradingDataService.getSnapshot...');
  const snapshotRes = await authoritativeTradingDataService.getSnapshot(testTenant);
  assert(snapshotRes.success, 'Snapshot must return success');
  assert(snapshotRes.prices && snapshotRes.prices['RELIANCE'], 'Snapshot must include live price map');
  assert(Array.isArray(snapshotRes.positions), 'Snapshot must include positions array');
  assert(snapshotRes.metrics, 'Snapshot must include metrics');
  assert(typeof snapshotRes.metrics.totalUnrealizedPnL === 'number', 'Metrics must include totalUnrealizedPnL');
  assert(typeof snapshotRes.metrics.totalEquity === 'number', 'Metrics must include totalEquity');
  console.log('✓ authoritativeTradingDataService.getSnapshot verified.');

  // 5. Test computeActivePositionsMtmDeltas
  console.log('\n5. Testing computeActivePositionsMtmDeltas...');
  const deltas = authoritativeTradingDataService.computeActivePositionsMtmDeltas();
  assert(Array.isArray(deltas), 'computeActivePositionsMtmDeltas must return array');
  const buyDelta = deltas.find((d) => d.positionId === 'pos-test-rel-buy');
  assert(buyDelta, 'Buy delta must be present');
  assert.strictEqual(buyDelta.symbol, 'RELIANCE');
  assert.strictEqual(buyDelta.ltp, 2650.50);
  assert.strictEqual(buyDelta.unrealizedPnL, 505.00);
  console.log('✓ computeActivePositionsMtmDeltas verified.');

  // 6. Test SSE client registration and broadcast in InternalEventDispatcher
  console.log('\n6. Testing InternalEventDispatcher SSE Client Registration & Broadcast...');
  const receivedMessages: string[] = [];
  const mockSseRes: any = {
    write: (msg: string) => {
      receivedMessages.push(msg);
      return true;
    },
  };

  const unreg = internalEventDispatcher.registerSseClient(mockSseRes);
  assert.strictEqual(internalEventDispatcher.getSseClientsCount() >= 1, true, 'SSE client must be registered');

  // Broadcast market.tick
  internalEventDispatcher.broadcastRealtimeTick({
    symbol: 'RELIANCE',
    ltp: 2650.50,
    change: 50.50,
    changePercent: 1.94,
  });

  // Broadcast positions.mtm_batch
  internalEventDispatcher.broadcastMtmBatch(deltas);

  assert(
    receivedMessages.some((m) => m.includes('event: market.tick') && m.includes('"symbol":"RELIANCE"')),
    'SSE must receive market.tick event'
  );
  assert(
    receivedMessages.some((m) => m.includes('event: positions.mtm_batch') && m.includes('pos-test-rel-buy')),
    'SSE must receive positions.mtm_batch event'
  );

  unreg();
  console.log('✓ InternalEventDispatcher SSE streaming verified.');

  // 7. Test Router Logic for /positions, /clients, /snapshot, and /stream
  console.log('\n7. Testing Route Handlers (/positions, /clients, /snapshot, /stream)...');
  const { default: internalRoutes } = await import('../src/server/routes/internal/index.ts');
  const { default: tradingRoutes } = await import('../src/server/routes/tradingRoutes.ts');

  // Find layer handlers from routers
  const findHandler = (router: any, path: string, method = 'get') => {
    for (const layer of router.stack) {
      if (layer.route) {
        const matchesPath = Array.isArray(layer.route.path)
          ? layer.route.path.includes(path)
          : layer.route.path === path;
        if (matchesPath && layer.route.methods[method.toLowerCase()]) {
          return layer.route.stack[layer.route.stack.length - 1].handle;
        }
      }
    }
    return null;
  };

  const createMockRes = () => {
    const res: any = {
      statusCode: 200,
      headers: {},
      data: null,
      status(code: number) { this.statusCode = code; return this; },
      writeHead(code: number, headers: any) { this.statusCode = code; this.headers = headers; return this; },
      write(data: string) { return true; },
      json(data: any) { this.data = data; return this; },
      end() { return this; },
    };
    return res;
  };

  // 7a. Test /trading/positions handler
  const posHandler = findHandler(internalRoutes, '/trading/positions');
  assert(posHandler, 'Internal /trading/positions route handler must exist');
  const posReq: any = { internalContext: { tenantId: 'TNT-001' }, query: {} };
  const posResMock = createMockRes();
  await posHandler(posReq, posResMock);
  assert(posResMock.data && posResMock.data.success, '/trading/positions handler must return success');
  assert(Array.isArray(posResMock.data.positions), '/trading/positions must return positions array');
  console.log('  ✓ Internal /trading/positions route handler verified');

  // 7b. Test /trading/clients handler
  const clientsHandler = findHandler(internalRoutes, '/trading/clients');
  assert(clientsHandler, 'Internal /trading/clients route handler must exist');
  const clientsReq: any = { internalContext: { tenantId: 'TNT-001' }, query: {} };
  const clientsResMock = createMockRes();
  await clientsHandler(clientsReq, clientsResMock);
  assert(clientsResMock.data && Array.isArray(clientsResMock.data.clients), '/trading/clients must return clients array');
  console.log('  ✓ Internal /trading/clients route handler verified');

  // 7c. Test /trading/snapshot handler
  const snapHandler = findHandler(internalRoutes, '/trading/snapshot');
  assert(snapHandler, 'Internal /trading/snapshot route handler must exist');
  const snapReq: any = { internalContext: { tenantId: 'TNT-001' }, query: {} };
  const snapResMock = createMockRes();
  await snapHandler(snapReq, snapResMock);
  assert(snapResMock.data && snapResMock.data.success, '/trading/snapshot must return success');
  assert(snapResMock.data.prices && snapResMock.data.prices['RELIANCE'], '/trading/snapshot must return live price map');
  assert(snapResMock.data.metrics, '/trading/snapshot must return metrics');
  console.log('  ✓ Internal /trading/snapshot route handler verified');

  // 7d. Test /trading/stream SSE handler
  const streamHandler = findHandler(internalRoutes, '/trading/stream');
  assert(streamHandler, 'Internal /trading/stream route handler must exist');
  const streamReq: any = { internalContext: { tenantId: 'TNT-001' }, query: {}, on: () => {} };
  const streamResMock = createMockRes();
  streamHandler(streamReq, streamResMock);
  assert.strictEqual(streamResMock.statusCode, 200, 'SSE status code must be 200');
  assert(streamResMock.headers['Content-Type']?.includes('text/event-stream'), 'SSE Content-Type must be text/event-stream');
  console.log('  ✓ Internal /trading/stream SSE route handler verified');

  // 7e. Test /snapshot in tradingRoutes
  const clientSnapHandler = findHandler(tradingRoutes, '/snapshot');
  assert(clientSnapHandler, 'Client /snapshot route handler must exist');
  const clientSnapReq: any = { tenantId: 'TNT-001', query: {} };
  const clientSnapRes = createMockRes();
  await clientSnapHandler(clientSnapReq, clientSnapRes);
  assert(clientSnapRes.data && clientSnapRes.data.success, 'Client /snapshot must return success');
  console.log('  ✓ Client /api/trading/snapshot route handler verified');

  // 7f. Test /stream in tradingRoutes
  const clientStreamHandler = findHandler(tradingRoutes, '/stream');
  assert(clientStreamHandler, 'Client /stream route handler must exist');
  const clientStreamReq: any = { tenantId: 'TNT-001', query: {}, on: () => {} };
  const clientStreamRes = createMockRes();
  clientStreamHandler(clientStreamReq, clientStreamRes);
  assert(clientStreamRes.headers['Content-Type']?.includes('text/event-stream'), 'Client /stream must return text/event-stream');
  console.log('  ✓ Client /api/trading/stream route handler verified');

  console.log('\n======================================================');
  console.log('  ALL REAL-TIME MTM & POSITION STREAMING TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
