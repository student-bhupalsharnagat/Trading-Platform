const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'server', 'routes', 'tradingRoutes.ts');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Bug #04 & #09: Product mapping
const target1 = `      const rawProd = String((p as any).product || (p as any).product_type || '').toUpperCase();
      const isHolding = rawProd === 'HOLDING' || rawProd === 'CNC' || (inst?.category === 'EQUITY' && posType === 'BUY' && rawProd !== 'INTRADAY');
      const product = isHolding ? ('HOLDING' as const) : ('INTRADAY' as const);`;

const replacement1 = `      const rawProd = String((p as any).product || (p as any).product_type || '').toUpperCase();
      const isHolding = rawProd === 'HOLDING' || rawProd === 'CNC' || rawProd === 'NRML' || (inst?.category === 'EQUITY' && posType === 'BUY' && rawProd !== 'INTRADAY' && rawProd !== 'MIS');
      const product = isHolding ? ('HOLDING' as const) : ('INTRADAY' as const);`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully patched target 1 (product mapping in positions)');
} else {
  console.error('Target 1 not found');
}

const target1b = `          const rawProd = String((p as any).product || (p as any).product_type || '').toUpperCase();
          const isHolding = rawProd === 'HOLDING' || rawProd === 'CNC' || (pInst?.category === 'EQUITY' && posType === 'BUY' && rawProd !== 'INTRADAY');
          const product = isHolding ? ('HOLDING' as const) : ('INTRADAY' as const);`;

const replacement1b = `          const rawProd = String((p as any).product || (p as any).product_type || '').toUpperCase();
          const isHolding = rawProd === 'HOLDING' || rawProd === 'CNC' || rawProd === 'NRML' || (pInst?.category === 'EQUITY' && posType === 'BUY' && rawProd !== 'INTRADAY' && rawProd !== 'MIS');
          const product = isHolding ? ('HOLDING' as const) : ('INTRADAY' as const);`;

if (normalize(content).includes(normalize(target1b))) {
  content = normalize(content).replace(normalize(target1b), normalize(replacement1b));
  console.log('Successfully patched target 1b (product mapping in fallback positions)');
} else {
  console.error('Target 1b not found');
}

// Orders product mapping
const target1c = `      const rawOrderProd = String((o as any).product || (o as any).product_type || '').toUpperCase();
      const isHoldingOrder = rawOrderProd === 'HOLDING' || rawOrderProd === 'CNC';
      const product = isHoldingOrder ? ('HOLDING' as const) : ('INTRADAY' as const);`;

const replacement1c = `      const rawOrderProd = String((o as any).product || (o as any).product_type || '').toUpperCase();
      const isHoldingOrder = rawOrderProd === 'HOLDING' || rawOrderProd === 'CNC' || rawOrderProd === 'NRML';
      const product = isHoldingOrder ? ('HOLDING' as const) : ('INTRADAY' as const);`;

if (normalize(content).includes(normalize(target1c))) {
  content = normalize(content).replace(normalize(target1c), normalize(replacement1c));
  console.log('Successfully patched target 1c (product mapping in orders)');
} else {
  console.error('Target 1c not found');
}

// 2. Bug #15: Isolate client state from demo transactions
const target2a = `    const memTxs = [
      ...getTenantFundTransactions(tenantId),
      ...getTenantFundTransactions('TNT-001'),
      ...getTenantFundTransactions('vertex-default'),
    ].filter((t: any) => !t.userId || t.userId === targetUserId || t.userId === resolvedTargetUserId || t.userId === 'vtx_demo' || t.userId === 'demo-trader');`;

const replacement2a = `    const isDemoTarget = targetUserId === 'vtx_demo' || targetUserId === 'demo-trader' || String(targetUserId).toLowerCase().includes('demo');
    const memTxs = [
      ...getTenantFundTransactions(tenantId),
      ...(tenantId !== 'TNT-001' ? getTenantFundTransactions('TNT-001') : []),
    ].filter((t: any) => {
      if (!t.userId) return false;
      if (isDemoTarget) return t.userId === targetUserId || t.userId === resolvedTargetUserId || t.userId === 'vtx_demo' || t.userId === 'demo-trader';
      return t.userId === targetUserId || t.userId === resolvedTargetUserId;
    });`;

if (normalize(content).includes(normalize(target2a))) {
  content = normalize(content).replace(normalize(target2a), normalize(replacement2a));
  console.log('Successfully patched target 2a (fund transactions isolation)');
} else {
  console.error('Target 2a not found');
}

const target2b = `    const memTransactions = [
      ...getTenantFundTransactions(tenantId),
      ...getTenantFundTransactions('TNT-001'),
      ...getTenantFundTransactions('vertex-default'),
    ].filter((t: any) => !t.userId || t.userId === userId || t.userId === 'vtx_demo' || t.userId === 'demo-trader');`;

const replacement2b = `    const memTransactions = [
      ...getTenantFundTransactions(tenantId),
      ...(tenantId !== 'TNT-001' ? getTenantFundTransactions('TNT-001') : []),
    ].filter((t: any) => {
      if (!t.userId) return false;
      if (isDemo) return t.userId === userId || t.userId === 'vtx_demo' || t.userId === 'demo-trader';
      return t.userId === userId;
    });`;

if (normalize(content).includes(normalize(target2b))) {
  content = normalize(content).replace(normalize(target2b), normalize(replacement2b));
  console.log('Successfully patched target 2b (wallet transactions isolation)');
} else {
  console.error('Target 2b not found');
}

// 3. Bug #28: Support ticket reply persistence
const target3 = `  ticket.messages.push(userMsg);
  ticket.updatedAt = formattedTime;
  if (ticket.status === 'RESOLVED') {
    ticket.status = 'IN_PROGRESS';
  }`;

const replacement3 = `  ticket.messages.push(userMsg);
  ticket.updatedAt = formattedTime;
  if (ticket.status === 'RESOLVED') {
    ticket.status = 'IN_PROGRESS';
  }

  // Bug #28: Persist support specialist reply on server across refreshes
  let agentReplyText = 'Thank you for providing the details. Our trading operations specialist is reviewing your account logs and will update you shortly.';
  const lowerMsg = (message + ' ' + (ticket.subject || '')).toLowerCase();
  if (lowerMsg.includes('gold') || lowerMsg.includes('order') || lowerMsg.includes('margin') || lowerMsg.includes('market')) {
    agentReplyText = 'We checked the order routing logs. For commodity futures like GOLD FUT, please confirm order type is INTRADAY or HOLDING within official MCX hours (09:00 - 23:30 IST). Our technical desk has logged this incident.';
  } else if (lowerMsg.includes('withdraw') || lowerMsg.includes('50,000') || lowerMsg.includes('bank') || lowerMsg.includes('payment')) {
    agentReplyText = 'We have verified the payout batch with our banking partner. The funds have been cleared from our node and should reflect in your account shortly. Transaction UTR has been logged.';
  } else if (lowerMsg.includes('pan') || lowerMsg.includes('kyc') || lowerMsg.includes('document')) {
    agentReplyText = 'Your identity documents have been re-validated against the KRA database. Your KYC compliance status is now Verified with full segment access enabled.';
  }

  const agentMsg = {
    id: \`msg-\${Date.now() + 1}\`,
    sender: 'support' as const,
    senderName: 'Vertex Support',
    text: agentReplyText,
    time: timeStr,
    timestamp: formattedTime,
  };
  ticket.messages.push(agentMsg);
  ticket.status = 'IN_PROGRESS';`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched target 3 (ticket reply persistence)');
} else {
  console.error('Target 3 not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating tradingRoutes.ts');
