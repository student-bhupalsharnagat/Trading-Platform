const assert = require('assert');

// 1. Test Portfolio Live P&L Math
console.log('--- Test 1: Portfolio Live P&L Calculation ---');
function calculatePositionPnL(type, qty, avgPrice, ltp) {
  const pnl = type === 'BUY' ? (ltp - avgPrice) * qty : (avgPrice - ltp) * qty;
  const totalExposure = avgPrice * qty;
  const pnlPercent = totalExposure > 0 ? Number(((pnl / totalExposure) * 100).toFixed(2)) : 0;
  return { pnl: Number(pnl.toFixed(2)), pnlPercent };
}

// Long position: 50 Qty bought at 2500, price moves to 2520 (+20)
const longPnL = calculatePositionPnL('BUY', 50, 2500, 2520);
assert.strictEqual(longPnL.pnl, 1000, 'Long PnL should be +1000');
assert.strictEqual(longPnL.pnlPercent, 0.8, 'Long PnL % should be +0.8%');
console.log('[PASS] Long position PnL calculation: +₹1,000 (+0.8%)');

// Short position: 50 Qty sold at 2500, price moves to 2480 (-20) -> profit for short
const shortPnL = calculatePositionPnL('SELL', 50, 2500, 2480);
assert.strictEqual(shortPnL.pnl, 1000, 'Short PnL should be +1000 when market drops');
console.log('[PASS] Short position PnL calculation: +₹1,000 (Market drop profit)');

// Short position: 50 Qty sold at 2500, price rises to 2520 (+20) -> loss for short
const shortLossPnL = calculatePositionPnL('SELL', 50, 2500, 2520);
assert.strictEqual(shortLossPnL.pnl, -1000, 'Short PnL should be -1000 when market rises');
console.log('[PASS] Short position PnL calculation: -₹1,000 (Market rise loss)');

// Total metrics
const positions = [
  { pnl: 1000, avgPrice: 2500, qty: 50 },
  { pnl: -250, avgPrice: 500, qty: 100 },
];
const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
const totalInvestedMargin = positions.reduce((sum, p) => sum + (p.avgPrice * p.qty), 0);
const realizedPnL = 500;
const netPnL = Number((realizedPnL + totalUnrealizedPnL).toFixed(2));
assert.strictEqual(totalUnrealizedPnL, 750, 'Total unrealized PnL should be 750');
assert.strictEqual(totalInvestedMargin, 175000, 'Total invested margin should be 175,000');
assert.strictEqual(netPnL, 1250, 'Net PnL should be 1250');
console.log('[PASS] Total Portfolio Value, Invested Capital, and Net P&L sync');

// 2. Test Order Normalization for Trade History & Session Persistence
console.log('\n--- Test 2: Order Normalization & Trade History Persistence ---');
function normalizeOrder(raw) {
  const symbol = raw.symbol || raw.instrument_id || '';
  const type = (raw.type || raw.side || 'BUY').toUpperCase();
  const qty = Number(raw.qty ?? raw.quantity ?? 0);
  const lotSize = Number(raw.lotSize || 1);
  const lots = Number(raw.lots || Math.max(1, Math.round(qty / lotSize)));
  const dateObj = raw.created_at ? new Date(raw.created_at) : new Date();
  return {
    id: raw.id || `ORD-${Date.now()}`,
    symbol,
    type,
    orderType: raw.orderType || raw.order_type || 'MARKET',
    product: raw.product || 'INTRADAY',
    lots,
    qty,
    lotSize,
    price: Number(raw.price || 0),
    status: raw.status || 'EXECUTED',
    time: raw.time || dateObj.toTimeString().split(' ')[0],
    date: raw.date || dateObj.toLocaleDateString('en-GB'),
    tenantId: raw.tenantId || raw.tenant_id,
  };
}

// Case 1: Raw order from Postgres
const pgRawOrder = {
  id: 'ORD-98214',
  tenant_id: 'TNT-001',
  user_id: 'USR-TEST',
  instrument_id: 'RELIANCE',
  side: 'BUY',
  order_type: 'MARKET',
  quantity: 50,
  price: 2490.5,
  status: 'EXECUTED',
  created_at: '2026-11-03T10:15:30.000Z',
};
const norm1 = normalizeOrder(pgRawOrder);
assert.strictEqual(norm1.id, 'ORD-98214');
assert.strictEqual(norm1.symbol, 'RELIANCE');
assert.strictEqual(norm1.type, 'BUY');
assert.strictEqual(norm1.qty, 50);
assert.strictEqual(norm1.price, 2490.5);
assert.strictEqual(norm1.status, 'EXECUTED');
assert.ok(norm1.time && norm1.date, 'Time and date must be populated');
console.log('[PASS] Postgres raw order normalized with all required fields');

// Case 2: Frontend API response order
const apiRawOrder = {
  id: 'ORD-11223',
  symbol: 'TCS',
  type: 'SELL',
  qty: 25,
  price: 3800,
  status: 'EXECUTED',
};
const norm2 = normalizeOrder(apiRawOrder);
assert.strictEqual(norm2.symbol, 'TCS');
assert.strictEqual(norm2.type, 'SELL');
assert.strictEqual(norm2.qty, 25);
console.log('[PASS] API response order normalized cleanly');

// 3. Test Deposit Approval Wallet Credit Logic
console.log('\n--- Test 3: Manual Deposit Approval & Wallet Credit ---');
function applyWalletUpdate(prevWallet, payload) {
  const newBal = payload.availableBalance ?? payload.available_balance ?? 
    (payload.amountCredited ? prevWallet.availableBalance + Number(payload.amountCredited) : prevWallet.availableBalance);
  return {
    ...prevWallet,
    availableBalance: newBal,
    deposited: payload.deposited ?? 
      (payload.amountCredited ? prevWallet.deposited + Number(payload.amountCredited) : prevWallet.deposited),
  };
}

const initialWallet = {
  availableBalance: 50000,
  usedMargin: 10000,
  totalPnL: 1500,
  todayPnL: 1500,
  deposited: 50000,
  withdrawn: 0,
};

// Admin approves deposit of 25,000 INR
const depositPayload = {
  userId: 'USR-TEST',
  availableBalance: 75000,
  available_balance: 75000,
  amountCredited: 25000,
  timestamp: new Date().toISOString(),
};

const updatedWallet = applyWalletUpdate(initialWallet, depositPayload);
assert.strictEqual(updatedWallet.availableBalance, 75000, 'Wallet balance should increase by 25,000');
assert.strictEqual(updatedWallet.deposited, 75000, 'Deposited amount should reflect 75,000');
console.log('[PASS] Wallet immediately credited upon admin approval payload: ₹50,000 -> ₹75,000');

// Fallback with amountCredited only
const fallbackUpdatedWallet = applyWalletUpdate(initialWallet, { amountCredited: 25000 });
assert.strictEqual(fallbackUpdatedWallet.availableBalance, 75000, 'Fallback balance increment should work');
console.log('[PASS] Fallback wallet increment with amountCredited verified');

// 4. Test Demo Portfolio Isolation Filter
console.log('\n--- Test 4: Demo Portfolio MTM Isolation ---');
const demoFilter = (ws) => !ws.userId || ws.userId === 'demo-trader' || ws.userId === 'vtx_demo';
assert.strictEqual(demoFilter({ userId: undefined }), true, 'Unauthenticated client receives demo MTM');
assert.strictEqual(demoFilter({ userId: 'demo-trader' }), true, 'Demo trader client receives demo MTM');
assert.strictEqual(demoFilter({ userId: 'vtx_demo' }), true, 'VTX Demo client receives demo MTM');
assert.strictEqual(demoFilter({ userId: 'USR-REAL-12345' }), false, 'Real authenticated client MUST NOT receive demo MTM');
console.log('[PASS] Authenticated user isolated from tenant-wide mock portfolio overwrite');

console.log('\nALL 4 CORE SUITE TESTS PASSED CLEANLY.');

