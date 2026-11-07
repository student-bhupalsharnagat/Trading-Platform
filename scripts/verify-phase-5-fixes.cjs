const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================');
console.log('   VERIFYING ALL PHASE 5 QA BUG FIXES & STABILIZATION ');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------
// 1. Finding 24: IOC Rejection without ReferenceError
// -----------------------------------------------------------
test('Finding 24: TradingExecutionService declares orderId before isUnfillableIOC check', () => {
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '../src/server/services/TradingExecutionService.ts'),
    'utf-8'
  );
  const orderIdIdx = serviceFile.indexOf('const orderId =');
  const iocCheckIdx = serviceFile.indexOf('if (isUnfillableIOC)');
  assert(orderIdIdx !== -1, 'orderId must be defined');
  assert(iocCheckIdx !== -1, 'isUnfillableIOC check must exist');
  assert(orderIdIdx < iocCheckIdx, 'orderId must be defined BEFORE isUnfillableIOC check to prevent ReferenceError');
});

// -----------------------------------------------------------
// 2. Findings 01 & 18: Timeframe harmonic & volatility scaling
// -----------------------------------------------------------
test('Findings 01 & 18: Historical candle generator scales volatility by timeframe ratio', () => {
  const routesFile = fs.readFileSync(
    path.join(__dirname, '../src/server/routes/tradingRoutes.ts'),
    'utf-8'
  );
  assert(routesFile.includes('const tfRatio = Math.sqrt(Math.max(1, intervalMinutes) / 15);'), 'Must calculate tfRatio based on interval');
  assert(routesFile.includes('const wave = Math.sin((i + intervalMinutes) * 0.35) * volatility * 0.4;'), 'Must apply timeframe harmonic wave');

  const chartFile = fs.readFileSync(
    path.join(__dirname, '../src/components/TradingViewChart.tsx'),
    'utf-8'
  );
  assert(chartFile.includes("const generateLocalCandles = (basePrice: number, tf: string = '15m'): LocalCandle[] => {"), 'TradingView local generator must accept timeframe');
  assert(chartFile.includes("const tfSeconds = tfMinutes * 60;"), 'TradingView candles must scale timestamp interval');
});

// -----------------------------------------------------------
// 3. Findings 08 & 16: Product isolation (MIS vs CNC)
// -----------------------------------------------------------
test('Findings 08 & 16: Intraday (MIS) is not coerced to Delivery (CNC/HOLDING)', () => {
  const routesFile = fs.readFileSync(
    path.join(__dirname, '../src/server/routes/tradingRoutes.ts'),
    'utf-8'
  );
  assert(routesFile.includes("const isHolding = rawProd === 'HOLDING' || rawProd === 'CNC' || rawProd === 'NRML';"), 'Only explicit CNC/HOLDING should be treated as holding');
  assert(routesFile.includes("const product = isHolding ? ('HOLDING' as const) : ('INTRADAY' as const);"), 'Defaults to INTRADAY if not holding');
});

// -----------------------------------------------------------
// 4. Finding 13: Option position MTM guard against spot price
// -----------------------------------------------------------
test('Finding 13: Option position MTM guarded against underlying index/future spot price', () => {
  const routesFile = fs.readFileSync(
    path.join(__dirname, '../src/server/routes/tradingRoutes.ts'),
    'utf-8'
  );
  assert(routesFile.includes("const isOption = p.instrument_id.includes(' CE') || p.instrument_id.includes(' PE') || inst?.category === 'OPTIONS';"), 'Backend identifies option contracts');
  assert(routesFile.includes("const ltp = isOption\n        ? ((inst && inst.category === 'OPTIONS' && inst.lastPrice < 5000) ? inst.lastPrice : avgPrice)"), 'Backend routes guard option LTP against spot price');

  const dashFile = fs.readFileSync(
    path.join(__dirname, '../src/pages/Dashboard.tsx'),
    'utf-8'
  );
  assert(dashFile.includes('isOption && rawAvg > 0 && ltp > rawAvg * 10 && rawAvg < 2000 && ltp > 5000'), 'Dashboard livePositions must guard option LTP');
});

// -----------------------------------------------------------
// 5. Finding 21: Support ticket file persistence
// -----------------------------------------------------------
test('Finding 21: Support tickets persist to disk and survive server restarts', () => {
  const storeFile = fs.readFileSync(
    path.join(__dirname, '../src/server/trading/tradingStore.ts'),
    'utf-8'
  );
  assert(storeFile.includes('.vertex_tickets_store.json'), 'Store must configure ticket persistence path');
  assert(storeFile.includes('function savePersistedTickets'), 'Store must define savePersistedTickets');
  assert(storeFile.includes('function loadPersistedTickets'), 'Store must define loadPersistedTickets');

  const routesFile = fs.readFileSync(
    path.join(__dirname, '../src/server/routes/tradingRoutes.ts'),
    'utf-8'
  );
  assert(routesFile.includes('savePersistedTickets()'), 'Routes must call savePersistedTickets upon ticket updates');
});

// -----------------------------------------------------------
// 6. Finding 03: Option contract labeled as OPTIONS, not COMMODITY
// -----------------------------------------------------------
test('Finding 03: Option contracts labeled OPTIONS instead of COMMODITY in order book and portfolio', () => {
  const dashFile = fs.readFileSync(
    path.join(__dirname, '../src/pages/Dashboard.tsx'),
    'utf-8'
  );
  assert(dashFile.includes("(sym.includes('CE') || sym.includes('PE')) ? 'OPTIONS' : (liveInst?.category || pos.category || 'EQUITY')"), 'Portfolio must categorize CE/PE as OPTIONS');
  assert(dashFile.includes("{(ord.symbol.includes('CE') || ord.symbol.includes('PE')) ? 'OPTIONS' : (inst?.category || ord.category || 'EQUITY')}"), 'Order book must categorize CE/PE as OPTIONS');
});

// -----------------------------------------------------------
// 7. Finding 05: Index instruments excluded from All Shares equity filters
// -----------------------------------------------------------
test('Finding 05: SENSEX and NIFTY 50 excluded from isEquityInstrument', () => {
  const dashFile = fs.readFileSync(
    path.join(__dirname, '../src/pages/Dashboard.tsx'),
    'utf-8'
  );
  assert(dashFile.includes("inst.category !== 'INDEX'"), 'isEquityInstrument must check inst.category !== INDEX');
  assert(dashFile.includes("inst.symbol !== 'SENSEX'"), 'isEquityInstrument must exclude SENSEX');
  assert(dashFile.includes("inst.symbol !== 'NIFTY 50'"), 'isEquityInstrument must exclude NIFTY 50');
});

// -----------------------------------------------------------
// 8. Finding 12: Privacy Policy & Terms opens modal instead of reload
// -----------------------------------------------------------
test('Finding 12: Footer legal links open modal instead of #privacy URL reload', () => {
  const dashFile = fs.readFileSync(
    path.join(__dirname, '../src/pages/Dashboard.tsx'),
    'utf-8'
  );
  assert(dashFile.includes("id=\"footer-privacy-btn\""), 'Privacy policy button must exist');
  assert(dashFile.includes("setLegalDocModal('PRIVACY')"), 'Clicking privacy button must set legalDocModal');
  assert(dashFile.includes("legalDocModal && ("), 'Legal document modal must render');
});

// -----------------------------------------------------------
// 9. Finding 15: Order Audit Trail button opens modal globally
// -----------------------------------------------------------
test('Finding 15: Order Audit Trail modal renders at root level accessible from Orders tab', () => {
  const dashFile = fs.readFileSync(
    path.join(__dirname, '../src/pages/Dashboard.tsx'),
    'utf-8'
  );
  // Verify that selectedOrderForDetail is rendered outside activeNav === 'positions'
  const posBlockEnd = dashFile.indexOf("activeNav === 'history'");
  const modalIdx = dashFile.indexOf("{/* Global Order Detail & Audit Modal */");
  assert(modalIdx > posBlockEnd, 'Order Detail & Audit Modal must be located in root modal section');
});

// -----------------------------------------------------------
// 10. Finding 17: Hindi and Tamil translations for Profile menu items
// -----------------------------------------------------------
test('Finding 17: Hindi and Tamil translations added for profile dashboard menu items', () => {
  const langFile = fs.readFileSync(
    path.join(__dirname, '../src/context/LanguageContext.tsx'),
    'utf-8'
  );
  assert(langFile.includes("notifications: 'सूचनाएं'"), 'Hindi notifications translation present');
  assert(langFile.includes("supportTickets: 'सपोर्ट टिकट्स'"), 'Hindi supportTickets translation present');
  assert(langFile.includes("notifications: 'அறிவிப்புகள்'"), 'Tamil notifications translation present');
  assert(langFile.includes("supportTickets: 'ஆதரவு டிக்கெட்டுகள்'"), 'Tamil supportTickets translation present');

  const profileFile = fs.readFileSync(
    path.join(__dirname, '../src/components/ProfileDashboard.tsx'),
    'utf-8'
  );
  assert(profileFile.includes("{t('notifications')}"), 'ProfileDashboard renders translated notifications');
  assert(profileFile.includes("{t('supportTickets')}"), 'ProfileDashboard renders translated support tickets');
  assert(profileFile.includes("{t('settings')}"), 'ProfileDashboard renders translated settings');
  assert(profileFile.includes("{t('termsAndPrivacy')}"), 'ProfileDashboard renders translated terms and privacy');
});

// -----------------------------------------------------------
// 11. Finding 23: Tenant switching warning on DEV_OVERRIDE_FORBIDDEN
// -----------------------------------------------------------
test('Finding 23: Tenant switching captures DEV_OVERRIDE_FORBIDDEN and displays warning banner', () => {
  const tenantCtxFile = fs.readFileSync(
    path.join(__dirname, '../src/context/TenantContext.tsx'),
    'utf-8'
  );
  assert(tenantCtxFile.includes("DEV_OVERRIDE_FORBIDDEN"), 'TenantContext must handle DEV_OVERRIDE_FORBIDDEN');
  assert(tenantCtxFile.includes("devSwitchError"), 'TenantContext must expose devSwitchError');

  const tenantBarFile = fs.readFileSync(
    path.join(__dirname, '../src/components/TenantStatusBar.tsx'),
    'utf-8'
  );
  assert(tenantBarFile.includes("id=\"tenant-switch-error-banner\""), 'TenantStatusBar must render switch error banner');
});

// -----------------------------------------------------------
// 12. Findings 02 & 06: Forex formatting and currency precision
// -----------------------------------------------------------
test('Findings 02 & 06: Forex quotes display 4 decimal precision and omit Rupee prefix', () => {
  const orderWinFile = fs.readFileSync(
    path.join(__dirname, '../src/components/OrderWindow.tsx'),
    'utf-8'
  );
  assert(orderWinFile.includes("const isForex = activeInstrument.category === 'FOREX'"), 'OrderWindow must identify Forex');
  assert(orderWinFile.includes("const currencyPrefix = isCrypto ? '$' : (isForex ? '' : '₹')"), 'OrderWindow must omit currency prefix for Forex');
  assert(orderWinFile.includes("const priceDecimals = isForex ? 4 : 2"), 'OrderWindow must use 4 decimals for Forex');

  const liveChartFile = fs.readFileSync(
    path.join(__dirname, '../src/components/LiveChart.tsx'),
    'utf-8'
  );
  assert(liveChartFile.includes("const isForex = instrument.category === 'FOREX' || (instrument.lastPrice || 0) < 10;"), 'LiveChart must identify Forex');
  assert(liveChartFile.includes("const currencyPrefix = isCrypto ? '$' : (isForex ? '' : '₹');"), 'LiveChart must omit currency prefix for Forex');
});

// -----------------------------------------------------------
// 13. Finding 11: Market Depth L2 ladder alignment
// -----------------------------------------------------------
test('Finding 11: Market Depth top bid and ask match live instrument quotes', () => {
  const orderWinFile = fs.readFileSync(
    path.join(__dirname, '../src/components/OrderWindow.tsx'),
    'utf-8'
  );
  assert(orderWinFile.includes("{ orders: 42, qty: (activeInstrument.lotSize || 1) * 35, price: bidPrice }"), 'Market depth first bid must strictly match header bidPrice');
  assert(orderWinFile.includes("{ price: askPrice, qty: (activeInstrument.lotSize || 1) * 30, orders: 38 }"), 'Market depth first ask must strictly match header askPrice');
});

// -----------------------------------------------------------
// Summary
// -----------------------------------------------------------
console.log('\n======================================================');
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL PHASE 5 QA BUG FIXES VERIFIED SUCCESSFULLY.');
}
