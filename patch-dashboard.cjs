const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Dashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Add formatProduct helper and isEquityInstrument helper
const targetHelpers = `// Intelligent Instrument Card with dynamic visual cues`;
const replacementHelpers = `// Helper to format product display (CNC, MIS, NRML)
const formatProduct = (product?: string, symbol?: string, category?: string) => {
  const p = (product || '').toUpperCase();
  const isFutOrOpt = category === 'FUTURES' || category === 'OPTIONS' || (symbol && (symbol.includes('FUT') || symbol.includes('CE') || symbol.includes('PE')));
  if (p === 'HOLDING' || p === 'CNC' || p === 'NRML') {
    return isFutOrOpt ? 'NRML' : 'CNC';
  }
  return 'MIS';
};

const isEquityInstrument = (inst: Instrument) =>
  inst.category === 'EQUITY' ||
  inst.sectionName?.includes('EQUITY') ||
  inst.sectionName?.includes('NSE') ||
  inst.sectionName?.includes('BSE');

// Intelligent Instrument Card with dynamic visual cues`;

if (normalize(content).includes(normalize(targetHelpers))) {
  content = normalize(content).replace(normalize(targetHelpers), normalize(replacementHelpers));
  console.log('Successfully added formatProduct and isEquityInstrument helpers');
} else {
  console.error('Target helpers not found');
}

// 2. Add legalDocModal state
const targetState = `  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null);`;
const replacementState = `  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null);
  const [legalDocModal, setLegalDocModal] = useState<'TERMS' | 'PRIVACY' | 'RISK' | null>(null);`;

if (normalize(content).includes(normalize(targetState))) {
  content = normalize(content).replace(normalize(targetState), normalize(replacementState));
  console.log('Successfully added legalDocModal state');
} else {
  console.error('Target state not found');
}

// 3. Update filteredInstruments to use isEquityInstrument
const targetFilter = `    const isEquity =
      inst.category === 'EQUITY' ||
      inst.sectionName?.includes('EQUITY') ||
      inst.sectionName?.includes('NSE') ||
      inst.sectionName?.includes('BSE');

    const matchesCategory =
      activeTab === 'ALL' ||
      (activeTab === 'EQUITY' ? isEquity : inst.category === activeTab);`;

const replacementFilter = `    const matchesCategory =
      activeTab === 'ALL' ||
      (activeTab === 'EQUITY' ? isEquityInstrument(inst) : inst.category === activeTab);`;

if (normalize(content).includes(normalize(targetFilter))) {
  content = normalize(content).replace(normalize(targetFilter), normalize(replacementFilter));
  console.log('Successfully updated matchesCategory to use isEquityInstrument');
} else {
  console.error('Target filter not found');
}

// 4. Update intradayPositions & holdingPositions filters
const targetPositionsFilter = `  const intradayPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'INTRADAY' || !p.product),
    [livePositions]
  );
  const holdingPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'HOLDING'),
    [livePositions]
  );`;

const replacementPositionsFilter = `  const intradayPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'INTRADAY' || p.product === 'MIS' || !p.product),
    [livePositions]
  );
  const holdingPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'HOLDING' || p.product === 'CNC' || p.product === 'NRML'),
    [livePositions]
  );`;

if (normalize(content).includes(normalize(targetPositionsFilter))) {
  content = normalize(content).replace(normalize(targetPositionsFilter), normalize(replacementPositionsFilter));
  console.log('Successfully patched intraday & holding positions filter');
} else {
  console.error('Target positions filter not found');
}

// 5. Bug #36: Tab badge counts using isEquityInstrument
const targetBadges = `{label} {tab === 'EQUITY' && \`(\${instruments.filter(i => i.category === 'EQUITY').length})\`}`;
const replacementBadges = `{label} {tab === 'EQUITY' && \`(\${instruments.filter(isEquityInstrument).length})\`}`;

if (normalize(content).includes(normalize(targetBadges))) {
  content = normalize(content).replace(normalize(targetBadges), normalize(replacementBadges));
  console.log('Successfully patched equity tab badge count');
} else {
  console.error('Target badges not found');
}

const targetSectorAll = `{ key: 'ALL', label: \`All Shares (\${instruments.filter(i => i.category === 'EQUITY').length})\` },`;
const replacementSectorAll = `{ key: 'ALL', label: \`All Shares (\${instruments.filter(isEquityInstrument).length})\` },`;

if (normalize(content).includes(normalize(targetSectorAll))) {
  content = normalize(content).replace(normalize(targetSectorAll), normalize(replacementSectorAll));
  console.log('Successfully patched equity sector All Shares badge count');
} else {
  console.error('Target sector all not found');
}

// 6. Bug #37: USDT currency label for crypto in watchlist
const targetPriceDisplay = `                                {/* Row 1: Last Price */}
                                <div className="font-mono font-black text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                                  ₹{inst.lastPrice < 10
                                    ? inst.lastPrice.toFixed(4)
                                    : inst.lastPrice.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                </div>`;

const replacementPriceDisplay = `                                {/* Row 1: Last Price */}
                                <div className="font-mono font-black text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                                  {(inst.category === 'CRYPTO' || inst.symbol.includes('USDT')) ? '$' : '₹'}{inst.lastPrice < 10
                                    ? inst.lastPrice.toFixed(4)
                                    : inst.lastPrice.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                </div>`;

if (normalize(content).includes(normalize(targetPriceDisplay))) {
  content = normalize(content).replace(normalize(targetPriceDisplay), normalize(replacementPriceDisplay));
  console.log('Successfully patched lastPrice USDT symbol');
} else {
  console.error('Target price display not found');
}

// 7. Bug #04, #09, #13: Orders table product display
const targetOrderProd = `                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#162234] text-slate-600 dark:text-slate-300 font-mono text-[10px] font-bold">
                              {ord.product || 'INTRADAY'}
                            </span>
                          </td>`;

const replacementOrderProd = `                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#162234] text-slate-600 dark:text-slate-300 font-mono text-[10px] font-bold">
                              {formatProduct(ord.product, ord.symbol)}
                            </span>
                          </td>`;

if (normalize(content).includes(normalize(targetOrderProd))) {
  content = normalize(content).replace(normalize(targetOrderProd), normalize(replacementOrderProd));
  console.log('Successfully patched orders table product display');
} else {
  console.error('Target order prod not found');
}

// 8. Bug #04, #09, #13: Positions card product display
const targetPosProd = `                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#162234] border border-slate-200 dark:border-[#233650] text-[10px] font-mono text-slate-700 dark:text-slate-300 font-bold">
                                  {pos.product || 'INTRADAY'}
                                </span>`;

const replacementPosProd = `                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#162234] border border-slate-200 dark:border-[#233650] text-[10px] font-mono text-slate-700 dark:text-slate-300 font-bold">
                                  {formatProduct(pos.product, pos.symbol, pos.category)}
                                </span>`;

if (normalize(content).includes(normalize(targetPosProd))) {
  content = normalize(content).replace(normalize(targetPosProd), normalize(replacementPosProd));
  console.log('Successfully patched positions card product display');
} else {
  console.error('Target pos prod not found');
}

// 9. Bug #19: Move selectedOrderForDetail modal out of positions tab to root modals
const orderDetailModalTarget = `              {/* Order Detail & Audit Modal */}
              {selectedOrderForDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
                  <div className="bg-white dark:bg-[#0E1624] border border-slate-200 dark:border-[#1D2B40] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={\`px-2 py-0.5 rounded text-[10px] font-black uppercase \${
                            selectedOrderForDetail.type === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                          }\`}
                        >
                          {selectedOrderForDetail.type}
                        </span>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                          {selectedOrderForDetail.symbol}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetail(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-[#0A101C] border border-slate-200 dark:border-[#1A2638] rounded-xl text-xs font-mono space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Reference</span>
                        <span className="font-bold text-slate-900 dark:text-white">#{selectedOrderForDetail.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Status</span>
                        <span className="font-bold text-emerald-500">{selectedOrderForDetail.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Product Code</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetail.product || 'INTRADAY MIS'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filled Lots / Qty</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetail.lots || 1} ({selectedOrderForDetail.qty} Qty)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Execution Price</span>
                        <span className="font-bold text-slate-900 dark:text-white">₹{selectedOrderForDetail.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Timestamp</span>
                        <span className="text-slate-500">{selectedOrderForDetail.time} · {selectedOrderForDetail.date}</span>
                      </div>
                    </div>

                    {/* Execution Audit Trail Timeline */}
                    <div className="space-y-2 pt-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Execution Audit Trail</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Order received & placed by trader</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Pre-trade risk & margin validation passed</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Order routed to Matching Engine</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Trade execution confirmed & positions updated</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetail(null)}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer"
                      >
                        Close Details
                      </button>
                    </div>
                  </div>
                </div>
              )}`;

if (normalize(content).includes(normalize(orderDetailModalTarget))) {
  content = normalize(content).replace(normalize(orderDetailModalTarget), '');
  console.log('Successfully removed orderDetailModal from inside positions tab');
} else {
  console.error('Order detail modal target not found inside positions tab');
}

// 10. Bug #20, #24, #29: Footer links buttons
const targetFooterLinks = `            {/* Legal Compliance */}
            <div className="flex items-center gap-3 text-[11px]">
              <a
                href={branding.termsUrl || branding.footerLinks?.termsUrl || '#terms'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-400 transition-colors underline"
              >
                Terms of Service
              </a>
              <span>•</span>
              <a
                href={branding.privacyUrl || branding.footerLinks?.privacyUrl || '#privacy'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-400 transition-colors underline"
              >
                Privacy Policy
              </a>
              <span>•</span>
              <a
                href={branding.footerLinks?.riskDisclosureUrl || '#risk'}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-400 transition-colors underline"
              >
                Risk Disclosure
              </a>
            </div>`;

const replacementFooterLinks = `            {/* Legal Compliance */}
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => setLegalDocModal('TERMS')}
                className="hover:text-amber-400 transition-colors underline cursor-pointer"
              >
                Terms of Service
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setLegalDocModal('PRIVACY')}
                className="hover:text-amber-400 transition-colors underline cursor-pointer"
              >
                Privacy Policy
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => setLegalDocModal('RISK')}
                className="hover:text-amber-400 transition-colors underline cursor-pointer"
              >
                Risk Disclosure
              </button>
            </div>`;

if (normalize(content).includes(normalize(targetFooterLinks))) {
  content = normalize(content).replace(normalize(targetFooterLinks), normalize(replacementFooterLinks));
  console.log('Successfully replaced footer links with modal triggers');
} else {
  console.error('Footer links target not found');
}

// 11. Append root modals: selectedOrderForDetail and legalDocModal
const targetRootEnd = `      {/* Market Closed Modal */}`;
const replacementRootEnd = `      {/* Bug #19: Root-level Order Detail & Audit Trail Modal (accessible from any tab) */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#0E1624] border border-slate-200 dark:border-[#1D2B40] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={\`px-2 py-0.5 rounded text-[10px] font-black uppercase \${
                    selectedOrderForDetail.type === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                  }\`}
                >
                  {selectedOrderForDetail.type}
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {selectedOrderForDetail.symbol}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#0A101C] border border-slate-200 dark:border-[#1A2638] rounded-xl text-xs font-mono space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Order Reference</span>
                <span className="font-bold text-slate-900 dark:text-white">#{selectedOrderForDetail.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Order Status</span>
                <span className="font-bold text-emerald-500">{selectedOrderForDetail.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Product Code</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{formatProduct(selectedOrderForDetail.product, selectedOrderForDetail.symbol)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Filled Lots / Qty</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetail.lots || 1} ({selectedOrderForDetail.qty} Qty)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Execution Price</span>
                <span className="font-bold text-slate-900 dark:text-white">₹{selectedOrderForDetail.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Order Timestamp</span>
                <span className="text-slate-500">{selectedOrderForDetail.time} · {selectedOrderForDetail.date}</span>
              </div>
            </div>

            {/* Execution Audit Trail Timeline */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Execution Audit Trail</span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Order received & placed by trader</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Pre-trade risk & margin validation passed</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Order routed to Matching Engine</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Trade execution confirmed & positions updated</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bug #20, #24, #29: Legal Document Modal */}
      {legalDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-[#0E1624] border border-slate-200 dark:border-[#1D2B40] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#1E2E44]">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {legalDocModal === 'TERMS' && 'Terms of Service'}
                {legalDocModal === 'PRIVACY' && 'Privacy Policy'}
                {legalDocModal === 'RISK' && 'Mandatory Risk Disclosure'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalDocModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 max-h-80 overflow-y-auto pr-1">
              {legalDocModal === 'TERMS' && (
                <>
                  <p>By accessing this trading platform provided by {branding.brandName}, you agree to adhere to all applicable exchange rules, margin terms, and statutory regulatory requirements.</p>
                  <p>All trades executed are simulated or routed in accordance with the user access level assigned. Capital protection, real-time risk evaluation, and pre-trade validations apply to every submitted order.</p>
                </>
              )}
              {legalDocModal === 'PRIVACY' && (
                <>
                  <p>Your privacy is important to us. {branding.brandName} collects and encrypts trading logs, authentication tokens, and account information solely for the purpose of executing orders and securing user assets.</p>
                  <p>We do not sell personal data to third parties. All financial data is processed in compliance with modern data privacy frameworks.</p>
                </>
              )}
              {legalDocModal === 'RISK' && (
                <>
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 dark:text-rose-400 font-bold">
                    SEBI Mandated Disclosure: 9 out of 10 individual traders in equity Futures and Options segment incur net losses.
                  </div>
                  <p>Trading in derivatives, leveraged equities, and commodities carries substantial financial risk. You should trade only with capital that you can afford to lose.</p>
                </>
              )}
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setLegalDocModal(null)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer"
              >
                Close Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Market Closed Modal */}`;

if (normalize(content).includes(normalize(targetRootEnd))) {
  content = normalize(content).replace(normalize(targetRootEnd), normalize(replacementRootEnd));
  console.log('Successfully appended root modals (order audit trail & legal document)');
} else {
  console.error('Target root end not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating Dashboard.tsx');
