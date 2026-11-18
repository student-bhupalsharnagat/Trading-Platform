import 'dotenv/config';
import assert from 'assert';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { tradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';

async function run() {
  const tenantId = 'vertex-default';
  const sseAll: Array<{ event: string; payload: any }> = [];
  const sseBrokerFiltered: Array<{ event: string; payload: any }> = [];
  const wsEvents: Array<{ event: string; tenantId: string; payload: any }> = [];

  const parseSse = (raw: string) => {
    const evMatch = raw.match(/^event:\s*(.+)$/m);
    const dataMatch = raw.match(/^data:\s*(.+)$/m);
    if (evMatch && dataMatch) {
      return { event: evMatch[1].trim(), payload: JSON.parse(dataMatch[1]) };
    }
    return null;
  };

  const unsubAll = internalEventDispatcher.registerSseClient(
    { write: (msg: string) => { const p = parseSse(msg); if (p) sseAll.push(p); return true; } },
    { tenantId, role: 'SUPER_ADMIN' }
  );

  const unsubFiltered = internalEventDispatcher.registerSseClient(
    { write: (msg: string) => { const p = parseSse(msg); if (p) sseBrokerFiltered.push(p); return true; } },
    { tenantId, brokerId: 'BRK-MATCH', role: 'BROKER' }
  );

  const origBroadcast = tradingWebSocketServer.broadcastToTenant.bind(tradingWebSocketServer);
  (tradingWebSocketServer as any).broadcastToTenant = (
    tId: string,
    event: string,
    payload: any
  ) => {
    wsEvents.push({ event, tenantId: tId, payload });
    return 1;
  };

  try {
    // 1. client.registered
    await internalEventDispatcher.dispatchClientRegistered({
      tenantId,
      tradingUserId: 'clt_rt_1',
      userId: 'clt_rt_1',
      clientCode: 'CLT_RT_1',
      name: 'Realtime Client',
      phone: '+919999999999',
      status: 'ACTIVE',
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: 'SUB-1',
      createdAt: new Date().toISOString(),
    });

    // 2. broker.added (Master / Broker / Sub-Broker)
    await internalEventDispatcher.dispatchBrokerAdded({
      tenantId,
      id: 'BRK-MATCH',
      userId: 'brk_match',
      name: 'Matched Broker',
      role: 'BROKER',
      parentId: 'MST-1',
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    // 3. fund.transaction_updated (Pay-in / Pay-out)
    await internalEventDispatcher.dispatchFundTransaction('deposit.approved', {
      transactionId: 'tx-rt-1',
      tenantId,
      userId: 'clt_rt_1',
      clientId: 'clt_rt_1',
      tradingUserId: 'clt_rt_1',
      amount: 50000,
      type: 'DEPOSIT',
      status: 'APPROVED',
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: 'SUB-1',
      timestamp: new Date().toISOString(),
    });

    // 4. trade.executed + ledger.updated
    await internalEventDispatcher.dispatchTradeExecuted({
      tenantId,
      userId: 'clt_rt_1',
      orderId: 'ORD-RT-1',
      tradeId: 'TRD-RT-1',
      symbol: 'NIFTY',
      side: 'BUY',
      quantity: 50,
      executionPrice: 22000,
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: 'SUB-1',
    });

    await internalEventDispatcher.dispatchLedgerUpdated({
      tenantId,
      transactionId: 'TRD-RT-1',
      userId: 'clt_rt_1',
      type: 'CREDIT',
      category: 'TRADE_PNL',
      amount: 2500,
      balanceBefore: 50000,
      balanceAfter: 52500,
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: 'SUB-1',
    });

    // 5. risk.alert_triggered (margin shortfall + blocked order)
    internalEventDispatcher.resetMarginBreachTracking();
    await internalEventDispatcher.dispatchMarginBreach({
      tenantId,
      userId: 'clt_rt_1',
      usedMargin: 90000,
      availableMargin: 1000,
      exposure: 120000,
      orderId: 'ORD-BLK-1',
      symbol: 'GOLD',
      side: 'BUY',
      requiredMargin: 30000,
      masterId: 'MST-1',
      brokerId: 'BRK-OTHER',
      subBrokerId: null,
    });

    await internalEventDispatcher.dispatchRiskAlertTriggered({
      tenantId,
      userId: 'clt_rt_1',
      alertType: 'ORDER_BLOCKED',
      severity: 'CRITICAL',
      reason: 'Trading halted',
      symbol: 'CRUDEOIL',
      masterId: 'MST-1',
      brokerId: 'BRK-MATCH',
      subBrokerId: 'SUB-1',
    });

    const requiredEvents = [
      'client.registered',
      'broker.added',
      'fund.transaction_updated',
      'trade.executed',
      'ledger.updated',
      'risk.alert_triggered',
    ];

    for (const ev of requiredEvents) {
      const wsEv = wsEvents.find((e) => e.event === ev);
      const sseEv = sseAll.find((e) => e.event === ev);
      assert(wsEv, `Missing /ws broadcast for ${ev}`);
      assert(sseEv, `Missing SSE broadcast for ${ev}`);
      assert.strictEqual(wsEv.payload.tenantId, tenantId, `${ev} WS payload missing tenantId`);
      assert('masterId' in wsEv.payload, `${ev} WS payload missing masterId`);
      assert('brokerId' in wsEv.payload, `${ev} WS payload missing brokerId`);
      assert('subBrokerId' in wsEv.payload, `${ev} WS payload missing subBrokerId`);
      assert.strictEqual(sseEv.payload.tenantId, tenantId, `${ev} SSE payload missing tenantId`);
      assert('masterId' in sseEv.payload, `${ev} SSE payload missing masterId`);
      assert('brokerId' in sseEv.payload, `${ev} SSE payload missing brokerId`);
      assert('subBrokerId' in sseEv.payload, `${ev} SSE payload missing subBrokerId`);
    }

    // Verify trade.executed retains legacy snake_case + camelCase fields
    const tradeWs = wsEvents.find((e) => e.event === 'trade.executed')!;
    assert.strictEqual(tradeWs.payload.id, 'TRD-RT-1');
    assert.strictEqual(tradeWs.payload.order_id, 'ORD-RT-1');
    assert.strictEqual(tradeWs.payload.execution_value, 1100000);
    assert.strictEqual(tradeWs.payload.turnover, 1100000);

    // Verify SSE hierarchy filter excluded BRK-OTHER risk alert while including BRK-MATCH
    assert(
      !sseBrokerFiltered.some((e) => e.payload.brokerId === 'BRK-OTHER'),
      'SSE brokerId filter leaked event from another broker'
    );
    assert(
      sseBrokerFiltered.some((e) => e.event === 'risk.alert_triggered' && e.payload.brokerId === 'BRK-MATCH'),
      'SSE brokerId filter missed matching broker risk alert'
    );

    console.log('ALL REAL-TIME DASHBOARD KPI EVENT ASSERTIONS PASSED!');
  } finally {
    (tradingWebSocketServer as any).broadcastToTenant = origBroadcast;
    unsubAll();
    unsubFiltered();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
