const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'server', 'services', 'TradingExecutionService.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Bug #27 & #31: SL-M crossed and IOC unfillable
const target1 = `    const rawOrderType = (input.orderType || 'MARKET').toUpperCase();
    const isPendingOrder = rawOrderType === 'LIMIT' || rawOrderType === 'SL' || rawOrderType === 'SL-M';
    const effectiveOrderType = rawOrderType === 'SL-M' ? 'SL-M' : rawOrderType === 'SL' ? 'SL' : rawOrderType === 'LIMIT' ? 'LIMIT' : 'MARKET';`;

const replacement1 = `    const rawOrderType = (input.orderType || 'MARKET').toUpperCase();
    const effectiveOrderType = rawOrderType === 'SL-M' ? 'SL-M' : rawOrderType === 'SL' ? 'SL' : rawOrderType === 'LIMIT' ? 'LIMIT' : 'MARKET';

    // Bug #27: SL-M orders execute immediately when trigger is crossed
    const isSlmTriggered = rawOrderType === 'SL-M' && input.triggerPrice != null &&
      ((side === 'BUY' && inst.lastPrice >= input.triggerPrice) || (side === 'SELL' && inst.lastPrice <= input.triggerPrice));

    // Bug #31: Unfillable IOC limit orders cancel immediately
    const isUnfillableIOC = input.timeInForce === 'IOC' && (
      rawOrderType === 'SL' || rawOrderType === 'SL-M' ||
      (rawOrderType === 'LIMIT' && input.price != null && (
        (side === 'BUY' && input.price < inst.lastPrice) ||
        (side === 'SELL' && input.price > inst.lastPrice)
      ))
    );

    if (isUnfillableIOC) {
      const cancelledOrder = await postgresOrderRepository.create({
        id: orderId,
        tenant_id: tenantId,
        user_id: userId,
        client_order_id: clientOrderId ? clientOrderId.trim() : null,
        instrument_id: inst.symbol,
        side,
        order_type: effectiveOrderType,
        quantity: qty,
        price: execPrice,
        trigger_price: input.triggerPrice != null ? input.triggerPrice : null,
        status: 'CANCELLED',
        broker_order_id: \`ioc-cncl-\${Date.now()}\`,
        normalized_status: 'CANCELLED',
        filled_quantity: 0,
        remaining_quantity: qty,
        average_fill_price: null,
        time_in_force: 'IOC',
      });
      const isPrivileged = (role: string) => ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(role);
      const userFilter = (ws: any) => ws.userId === userId || isPrivileged(ws.role);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'order.cancelled', cancelledOrder, userFilter);
      const wallet = await postgresWalletRepository.getWallet(tenantId, userId);
      return {
        success: false,
        order: cancelledOrder,
        wallet,
        message: \`IOC limit order for \${inst.symbol} cancelled immediately as price could not be filled.\`,
      };
    }

    const isPendingOrder = !isSlmTriggered && (rawOrderType === 'LIMIT' || rawOrderType === 'SL' || rawOrderType === 'SL-M');`;

const normalize = (s) => s.replace(/\r\n/g, '\n');
if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully patched Bug #27 & #31');
} else {
  console.error('Target 1 not found');
}

// 2. Bug #03: GTT OCO Bracket Orders after primary execution
const target2 = `    return {
      success: true,
      order: result.newOrder,
      trade: result.newTrade,
      position: result.updatedPosition,
      wallet: result.updatedWallet,
      message: \`\${side} order for \${lots} lot(s) of \${inst.symbol} executed successfully!\`,
    };`;

const replacement2 = `    // Bug #03: Create GTT OCO bracket stop-loss and target child orders upon primary buy execution
    if (result.newOrder && side === 'BUY') {
      const isPrivileged = (role: string) => ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(role);
      const userFilter = (ws: any) => ws.userId === userId || isPrivileged(ws.role);
      if (input.stopLoss && input.stopLoss > 0) {
        try {
          const slChild = await postgresOrderRepository.create({
            id: \`ORD-SL-\${Math.floor(10000 + Math.random() * 90000)}\`,
            tenant_id: tenantId,
            user_id: userId,
            client_order_id: \`gtt-sl-\${result.newOrder.id}\`,
            instrument_id: inst.symbol,
            side: 'SELL',
            order_type: 'SL-M',
            quantity: qty,
            price: input.stopLoss,
            trigger_price: input.stopLoss,
            status: 'PENDING',
            broker_order_id: \`gtt-sl-\${Date.now()}\`,
            normalized_status: 'NEW',
            filled_quantity: 0,
            remaining_quantity: qty,
            average_fill_price: null,
            time_in_force: 'GTC',
          });
          tradingWebSocketServer.broadcastToTenant(tenantId, 'order.created', slChild, userFilter);
        } catch (e) {
          console.error('[GTT] Failed to create stop-loss child order:', e);
        }
      }
      if (input.target && input.target > 0) {
        try {
          const tgtChild = await postgresOrderRepository.create({
            id: \`ORD-TGT-\${Math.floor(10000 + Math.random() * 90000)}\`,
            tenant_id: tenantId,
            user_id: userId,
            client_order_id: \`gtt-tgt-\${result.newOrder.id}\`,
            instrument_id: inst.symbol,
            side: 'SELL',
            order_type: 'LIMIT',
            quantity: qty,
            price: input.target,
            trigger_price: null,
            status: 'PENDING',
            broker_order_id: \`gtt-tgt-\${Date.now()}\`,
            normalized_status: 'NEW',
            filled_quantity: 0,
            remaining_quantity: qty,
            average_fill_price: null,
            time_in_force: 'GTC',
          });
          tradingWebSocketServer.broadcastToTenant(tenantId, 'order.created', tgtChild, userFilter);
        } catch (e) {
          console.error('[GTT] Failed to create target child order:', e);
        }
      }
    }

    return {
      success: true,
      order: result.newOrder,
      trade: result.newTrade,
      position: result.updatedPosition,
      wallet: result.updatedWallet,
      message: \`\${side} order for \${lots} lot(s) of \${inst.symbol} executed successfully!\`,
    };`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched Bug #03');
} else {
  console.error('Target 2 not found');
}

// 3. Bug #17: Exempt Options from Circuit Breaker Clamp in closePosition
const target3 = `      // Guard against unscaled/mismatched mock instrument prices (>1.5x or <0.67x deviation from entryAvg beyond exchange circuit limits)
      if (exitPriceOverride === undefined && inst?.lastPrice && entryAvg > 0) {
        const ratio = Number(inst.lastPrice) / entryAvg;
        if (ratio < 0.67 || ratio > 1.5) {
          exitPrice = entryAvg;
        }
      }`;

const replacement3 = `      // Guard against unscaled/mismatched mock instrument prices (>1.5x or <0.67x deviation from entryAvg beyond exchange circuit limits)
      // Bug #17: Exempt options from circuit breaker ratio clamp so market exits calculate realized PnL using current option LTP
      const isOption = inst?.category === 'OPTIONS' || /-(?:CE|PE)$/i.test(pos.instrument_id) || /\\s(?:CE|PE)$/i.test(pos.instrument_id);
      if (!isOption && exitPriceOverride === undefined && inst?.lastPrice && entryAvg > 0) {
        const ratio = Number(inst.lastPrice) / entryAvg;
        if (ratio < 0.67 || ratio > 1.5) {
          exitPrice = entryAvg;
        }
      }`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched Bug #17');
} else {
  console.error('Target 3 not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating TradingExecutionService.ts');
