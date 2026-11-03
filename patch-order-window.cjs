const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'OrderWindow.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 0. Import DEFAULT_INSTRUMENTS
if (!content.includes('DEFAULT_INSTRUMENTS')) {
  content = `import { DEFAULT_INSTRUMENTS } from '../data/defaultInstruments.ts';\n` + content;
  console.log('Added DEFAULT_INSTRUMENTS import');
}

// 1. Bug #07: Reject non-lot multiples instead of silently rounding
const target1 = `    const rawQty = inputMode === 'QTY' ? quantity : effectiveLots * (activeInstrument.lotSize || 1);
    const normalizedQty = (activeInstrument.lotSize && activeInstrument.lotSize > 1)
      ? Math.max(activeInstrument.lotSize, Math.round(rawQty / activeInstrument.lotSize) * activeInstrument.lotSize)
      : rawQty;`;

const replacement1 = `    const rawQty = inputMode === 'QTY' ? quantity : effectiveLots * (activeInstrument.lotSize || 1);
    // Bug #07: Commodity/derivative lot inputs must not be silently changed
    if (inputMode === 'QTY' && activeInstrument.lotSize && activeInstrument.lotSize > 1) {
      if (rawQty % activeInstrument.lotSize !== 0) {
        showToast({
          type: 'error',
          title: 'Invalid Lot Quantity',
          description: \`Quantity must be an exact multiple of lot size (\${activeInstrument.lotSize}).\`,
        });
        return;
      }
    }
    const normalizedQty = rawQty;`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully patched Bug #07');
} else {
  console.error('Target 1 not found in OrderWindow.tsx');
}

// 2. Bug #14: Trailing stop validation in handleExecuteOrder
const target2 = `    if (!normalizedQty || normalizedQty <= 0) {
      showToast({
        type: 'error',
        title: 'Invalid Quantity',
        description: 'Order quantity must be greater than 0',
      });
      return;
    }`;

const replacement2 = `    if (!normalizedQty || normalizedQty <= 0) {
      showToast({
        type: 'error',
        title: 'Invalid Quantity',
        description: 'Order quantity must be greater than 0',
      });
      return;
    }

    // Bug #14: Reject negative trailing stop-loss values
    if (enableSLTarget && trailingSL && parseFloat(trailingSL) < 0) {
      showToast({
        type: 'error',
        title: 'Invalid Trailing Stop',
        description: 'Trailing stop-loss distance cannot be negative.',
      });
      return;
    }`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched Bug #14 validation');
} else {
  console.error('Target 2 not found in OrderWindow.tsx');
}

// 3. Bug #14: Trailing stop input attributes
const target3 = `                      <input
                        type="number"
                        placeholder="e.g. 50.00"
                        value={trailingSL}
                        onChange={(e) => setTrailingSL(e.target.value)}
                        className="w-full bg-white dark:bg-[#080E18] border border-slate-300 dark:border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-amber-500"
                      />`;

const replacement3 = `                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 50.00"
                        value={trailingSL}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (e.target.value === '' || (!isNaN(v) && v >= 0)) {
                            setTrailingSL(e.target.value);
                          }
                        }}
                        className="w-full bg-white dark:bg-[#080E18] border border-slate-300 dark:border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-amber-500"
                      />`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched Bug #14 input field');
} else {
  console.error('Target 3 not found in OrderWindow.tsx');
}

// 4. Bug #22: Fix 12 lots replacement bug
const target4 = `                  {inputMode === 'LOTS' ? (
                    <input
                      type="number"
                      min={1}
                      max={instrument.maxLots || 1000}
                      value={lots}
                      onChange={(e) => handleLotChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  )}`;

const replacement4 = `                  {inputMode === 'LOTS' ? (
                    <input
                      type="number"
                      min={1}
                      max={instrument.maxLots || 1000}
                      value={lots}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleLotChange(1);
                        } else {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            handleLotChange(parsed);
                          }
                        }
                      }}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleQtyChange(1);
                        } else {
                          const parsed = parseInt(val, 10);
                          if (!isNaN(parsed) && parsed > 0) {
                            handleQtyChange(parsed);
                          }
                        }
                      }}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  )}`;

if (normalize(content).includes(normalize(target4))) {
  content = normalize(content).replace(normalize(target4), normalize(replacement4));
  console.log('Successfully patched Bug #22 lots input');
} else {
  console.error('Target 4 not found in OrderWindow.tsx');
}

// 5. Bug #16 & #18: Correct underlying mapping for OptionChain
const target5 = `      {/* Option Chain Modal */}
      {showOptionChain && (
        <OptionChain
          instrument={activeInstrument}
          onClose={() => setShowOptionChain(false)}
          onSelectOption={(optSymbol, strike, type, price, expiry) => {
            setShowOptionChain(false);
            const optExpiry = expiry || '31 Aug';
            const optContract: Instrument = {
              ...activeInstrument,
              id: \`opt_\${activeInstrument.symbol}_\${optExpiry}_\${strike}_\${type}\`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              symbol: \`\${activeInstrument.symbol} \${optExpiry.toUpperCase()} \${strike} \${type}\`,
              name: \`\${activeInstrument.name || activeInstrument.symbol} \${optExpiry.toUpperCase()} \${strike} \${type}\`,
              lastPrice: price,
              change: Number((price * 0.02).toFixed(2)),
              changePercent: 2.0,
              lotSize: activeInstrument.lotSize || 1,
              category: 'OPTIONS' as any,
              sectionName: 'Options',
              expiry: optExpiry,
              strike,
              optionType: type,
            };
            setActiveInstrument(optContract);
            setLimitPrice(price.toString());
            onSelectInstrument?.(optContract);
            showToast({
              type: 'info',
              title: \`\${optContract.symbol} Selected\`,
              description: \`Loaded strike ₹\${strike} \${type} at LTP ₹\${price.toFixed(2)}\`,
            });
          }}
        />
      )}`;

const replacement5 = `      {/* Option Chain Modal */}
      {showOptionChain && (
        <OptionChain
          instrument={(() => {
            if (activeInstrument.category !== 'OPTIONS' && !activeInstrument.optionType) return activeInstrument;
            const rootSymbol = (activeInstrument.symbol || '').split(' ')[0];
            const foundUnderlying = DEFAULT_INSTRUMENTS.find(
              (i) => i.symbol === rootSymbol || i.name === rootSymbol
            );
            return foundUnderlying || (instrument.category !== 'OPTIONS' ? instrument : activeInstrument);
          })()}
          onClose={() => setShowOptionChain(false)}
          onSelectOption={(optSymbol, strike, type, price, expiry) => {
            setShowOptionChain(false);
            const rootUnderlying = (() => {
              if (activeInstrument.category !== 'OPTIONS' && !activeInstrument.optionType) return activeInstrument;
              const root = (activeInstrument.symbol || '').split(' ')[0];
              return DEFAULT_INSTRUMENTS.find((i) => i.symbol === root) || instrument;
            })();
            const optExpiry = expiry || '31 Aug';
            const optContract: Instrument = {
              ...rootUnderlying,
              id: \`opt_\${rootUnderlying.symbol}_\${optExpiry}_\${strike}_\${type}\`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              symbol: \`\${rootUnderlying.symbol} \${optExpiry.toUpperCase()} \${strike} \${type}\`,
              name: \`\${rootUnderlying.name || rootUnderlying.symbol} \${optExpiry.toUpperCase()} \${strike} \${type}\`,
              lastPrice: price,
              change: Number((price * 0.02).toFixed(2)),
              changePercent: 2.0,
              lotSize: rootUnderlying.lotSize || 1,
              category: 'OPTIONS' as any,
              sectionName: 'Options',
              expiry: optExpiry,
              strike,
              optionType: type,
            };
            setActiveInstrument(optContract);
            setLimitPrice(price.toString());
            onSelectInstrument?.(optContract);
            showToast({
              type: 'info',
              title: \`\${optContract.symbol} Selected\`,
              description: \`Loaded strike ₹\${strike} \${type} at LTP ₹\${price.toFixed(2)}\`,
            });
          }}
        />
      )}`;

if (normalize(content).includes(normalize(target5))) {
  content = normalize(content).replace(normalize(target5), normalize(replacement5));
  console.log('Successfully patched Bug #16 & #18');
} else {
  console.error('Target 5 not found in OrderWindow.tsx');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating OrderWindow.tsx');
