import assert from 'assert';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';
import { transactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';

async function runRealtimeDashboardVerification() {
  console.log('--- Starting Real-time Dashboard Event Verification ---');

  // Track captured events
  const capturedEvents: Array<{ event: string; payload: any; channel: string }> = [];

  // Mock SSE receiver
  const mockSseRes = {
    write: (chunk: string) => {
      const match = chunk.match(/event:\s*([^\n]+)\ndata:\s*([^\n]+)/);
      if (match) {
        try {
          capturedEvents.push({
            channel: 'SSE',
            event: match[1].trim(),
            payload: JSON.parse(match[2].trim()),
          });
        } catch {}
      }
    },
  };

  const unsubSse = internalEventDispatcher.registerSseClient(mockSseRes, {
    tenantId: 'TNT-001',
    role: 'SUPER_ADMIN',
  });

  // Mock WebSocket broadcast interceptor
  const origBroadcastToTenant = tradingWebSocketServer.broadcastToTenant.bind(tradingWebSocketServer);
  (tradingWebSocketServer as any).broadcastToTenant = (
    tenantId: string,
    event: string,
    payload: any,
    recipientFilter?: any,
    skipRedisPublish = false,
    targetFilter?: any
  ) => {
    capturedEvents.push({
      channel: 'WS',
      event,
      payload,
    });
    return 1;
  };

  try {
    // TEST 1: broker.added emission with hierarchy links
    console.log('1. Testing broker.added emission...');
    await internalEventDispatcher.dispatchBrokerAdded({
      tenantId: 'TNT-001',
      id: 'BRK-TEST-1',
      userId: 'test_broker',
      name: 'Test Broker',
      fullName: 'Test Broker',
      role: 'BROKER',
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    const brokerWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'broker.added');
    const brokerSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'broker.added');
    assert(brokerWs, 'broker.added was broadcasted over /ws');
    assert(brokerSse, 'broker.added was broadcasted over SSE');
    assert.strictEqual(brokerWs.payload.tenantId, 'TNT-001');
    assert.strictEqual(brokerWs.payload.masterId, 'MST-ROOT-1');
    assert.strictEqual(brokerWs.payload.brokerId, 'BRK-TEST-1');
    assert.strictEqual(brokerWs.payload.subBrokerId, null);
    console.log('   ✓ broker.added emitted over WS & SSE with hierarchy links.');

    // TEST 2: client.registered emission with hierarchy links
    console.log('2. Testing client.registered emission...');
    await internalEventDispatcher.dispatchClientRegistered({
      tenantId: 'TNT-001',
      tradingUserId: 'client_alpha',
      userId: 'client_alpha',
      clientId: 'client_alpha',
      clientCode: 'CLIENT_ALPHA',
      name: 'Client Alpha',
      fullName: 'Client Alpha',
      phone: '+919999999999',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const clientWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'client.registered');
    const clientSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'client.registered');
    assert(clientWs, 'client.registered was broadcasted over /ws');
    assert(clientSse, 'client.registered was broadcasted over SSE');
    assert.strictEqual(clientWs.payload.tenantId, 'TNT-001');
    assert.strictEqual(clientWs.payload.masterId, 'MST-ROOT-1');
    assert.strictEqual(clientWs.payload.brokerId, 'BRK-TEST-1');
    assert.strictEqual(clientWs.payload.subBrokerId, 'SUB-001');
    console.log('   ✓ client.registered emitted over WS & SSE with hierarchy links.');

    // TEST 3: fund.transaction_updated emission on deposit/withdrawal
    console.log('3. Testing fund.transaction_updated emission...');
    await internalEventDispatcher.dispatchFundTransaction('deposit.created', {
      transactionId: 'TX-DEP-101',
      tenantId: 'TNT-001',
      userId: 'client_alpha',
      clientId: 'client_alpha',
      tradingUserId: 'client_alpha',
      amount: 50000,
      type: 'DEPOSIT',
      status: 'PENDING',
      timestamp: new Date().toISOString(),
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const fundWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'fund.transaction_updated');
    const fundSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'fund.transaction_updated');
    assert(fundWs, 'fund.transaction_updated was broadcasted over /ws');
    assert(fundSse, 'fund.transaction_updated was broadcasted over SSE');
    assert.strictEqual(fundWs.payload.action, 'REQUESTED');
    assert.strictEqual(fundWs.payload.amount, 50000);
    assert.strictEqual(fundWs.payload.masterId, 'MST-ROOT-1');
    assert.strictEqual(fundWs.payload.brokerId, 'BRK-TEST-1');
    console.log('   ✓ fund.transaction_updated emitted on Pay-in request.');

    await internalEventDispatcher.dispatchFundTransaction('withdrawal.approved', {
      transactionId: 'TX-WTH-202',
      tenantId: 'TNT-001',
      userId: 'client_alpha',
      clientId: 'client_alpha',
      tradingUserId: 'client_alpha',
      amount: 25000,
      type: 'WITHDRAWAL',
      status: 'APPROVED',
      timestamp: new Date().toISOString(),
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const fundAppWs = capturedEvents.find(
      (e) => e.channel === 'WS' && e.event === 'fund.transaction_updated' && e.payload.transactionId === 'TX-WTH-202'
    );
    assert(fundAppWs, 'fund.transaction_updated was broadcasted for approved withdrawal');
    assert.strictEqual(fundAppWs.payload.action, 'APPROVED');
    console.log('   ✓ fund.transaction_updated emitted on Pay-out approval.');

    // TEST 4: trade.executed and ledger.updated emission
    console.log('4. Testing trade.executed and ledger.updated emission...');
    await internalEventDispatcher.dispatchTradeExecuted({
      tenantId: 'TNT-001',
      userId: 'client_alpha',
      orderId: 'ORD-999',
      tradeId: 'TRD-999',
      symbol: 'RELIANCE',
      side: 'BUY',
      quantity: 50,
      executionPrice: 2800,
      executionValue: 140000,
      turnover: 140000,
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const tradeWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'trade.executed');
    const tradeSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'trade.executed');
    assert(tradeWs, 'trade.executed was broadcasted over /ws');
    assert(tradeSse, 'trade.executed was broadcasted over SSE');
    assert.strictEqual(tradeWs.payload.turnover, 140000);
    assert.strictEqual(tradeWs.payload.masterId, 'MST-ROOT-1');
    console.log('   ✓ trade.executed emitted with turnover and hierarchy links.');

    await internalEventDispatcher.dispatchLedgerUpdated({
      tenantId: 'TNT-001',
      userId: 'client_alpha',
      transactionId: 'TRD-999',
      type: 'CREDIT',
      category: 'TRADE_PNL',
      amount: 1500,
      balanceBefore: 50000,
      balanceAfter: 51500,
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const ledgerWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'ledger.updated');
    const ledgerSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'ledger.updated');
    assert(ledgerWs, 'ledger.updated was broadcasted over /ws');
    assert(ledgerSse, 'ledger.updated was broadcasted over SSE');
    assert.strictEqual(ledgerWs.payload.balanceAfter, 51500);
    assert.strictEqual(ledgerWs.payload.masterId, 'MST-ROOT-1');
    console.log('   ✓ ledger.updated emitted with balance deltas and hierarchy links.');

    // TEST 5: risk.alert_triggered emission
    console.log('5. Testing risk.alert_triggered emission...');
    await internalEventDispatcher.dispatchRiskAlert({
      tenantId: 'TNT-001',
      userId: 'client_alpha',
      alertType: 'MARGIN_SHORTFALL',
      severity: 'HIGH',
      message: 'Insufficient margin for BUY order on NIFTY',
      requiredMargin: 150000,
      availableMargin: 51500,
      shortfall: 98500,
      masterId: 'MST-ROOT-1',
      brokerId: 'BRK-TEST-1',
      subBrokerId: 'SUB-001',
    });

    const riskWs = capturedEvents.find((e) => e.channel === 'WS' && e.event === 'risk.alert_triggered');
    const riskSse = capturedEvents.find((e) => e.channel === 'SSE' && e.event === 'risk.alert_triggered');
    assert(riskWs, 'risk.alert_triggered was broadcasted over /ws');
    assert(riskSse, 'risk.alert_triggered was broadcasted over SSE');
    assert.strictEqual(riskWs.payload.alertType, 'MARGIN_SHORTFALL');
    assert.strictEqual(riskWs.payload.shortfall, 98500);
    assert.strictEqual(riskWs.payload.masterId, 'MST-ROOT-1');
    console.log('   ✓ risk.alert_triggered emitted with shortfall details and hierarchy links.');

    console.log('\nALL REAL-TIME DASHBOARD EVENT ASSERTIONS PASSED SUCCESSFULLY!');
  } finally {
    unsubSse();
    (tradingWebSocketServer as any).broadcastToTenant = origBroadcastToTenant;
  }
}

runRealtimeDashboardVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Real-time Dashboard Verification Failed:', err);
    process.exit(1);
  });
