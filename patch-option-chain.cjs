const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'OptionChain.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Strike calculation and forex support
const target1 = `  const [selectedExpiry, setSelectedExpiry] = useState<string>(instrument.expiry || '31 Aug');
  const basePrice = instrument.lastPrice || 1000;

  // Generate strike step based on instrument price
  const step = basePrice > 50000 ? 500 : basePrice > 10000 ? 100 : basePrice > 1000 ? 50 : 5;
  const atmStrike = Math.round(basePrice / step) * step;

  // Generate strikes around ATM
  const strikes = [];
  for (let i = -6; i <= 6; i++) {
    const strike = atmStrike + i * step;
    const diff = strike - basePrice;
    
    // Call pricing model approx (Black-Scholes heuristic for UI simulation)
    const callIntrinsic = Math.max(0, basePrice - strike);
    const timeValue = Math.max(10, step * 0.45 * Math.exp(-Math.abs(diff) / (step * 3)));
    const callPrice = Number((callIntrinsic + timeValue).toFixed(2));
    
    // Put pricing
    const putIntrinsic = Math.max(0, strike - basePrice);
    const putPrice = Number((putIntrinsic + timeValue).toFixed(2));

    const callOI = Math.floor(12000 + Math.random() * 45000 - Math.abs(diff) * 15);
    const putOI = Math.floor(14000 + Math.random() * 48000 - Math.abs(diff) * 15);

    const callIV = Number((14.2 + (Math.abs(diff) / step) * 0.3).toFixed(1));
    const putIV = Number((15.1 + (Math.abs(diff) / step) * 0.3).toFixed(1));

    strikes.push({
      strike,
      isATM: i === 0,
      call: {
        price: Math.max(0.5, callPrice),
        change: Number(((callPrice * (instrument.change >= 0 ? 0.05 : -0.05))).toFixed(2)),
        changePercent: instrument.change >= 0 ? 4.2 : -5.1,
        oi: Math.max(1000, callOI),
        iv: callIV,
      },
      put: {
        price: Math.max(0.5, putPrice),
        change: Number(((putPrice * (instrument.change >= 0 ? -0.05 : 0.05))).toFixed(2)),
        changePercent: instrument.change >= 0 ? -4.8 : 5.4,
        oi: Math.max(1000, putOI),
        iv: putIV,
      },
    });
  }`;

const replacement1 = `  const [selectedExpiry, setSelectedExpiry] = useState<string>(instrument.expiry || '31 Aug');
  // Bug #33: Detect forex / currency exchange rates and generate positive decimal strike steps
  const isForex = (instrument.lastPrice || 0) < 10 || instrument.category === 'FOREX';
  const basePrice = instrument.lastPrice || (isForex ? 1.0850 : 1000);

  // Generate strike step based on instrument price (Forex EUR/USD ~1.08 uses 0.005 steps)
  const step = isForex ? 0.005 : (basePrice > 50000 ? 500 : basePrice > 10000 ? 100 : basePrice > 1000 ? 50 : 5);
  const atmStrike = isForex
    ? Number((Math.round(basePrice / step) * step).toFixed(4))
    : Math.round(basePrice / step) * step;

  // Generate strikes around ATM
  const strikes = [];
  for (let i = -6; i <= 6; i++) {
    const rawStrike = isForex ? Number((atmStrike + i * step).toFixed(4)) : (atmStrike + i * step);
    const strike = isForex ? Math.max(0.005, rawStrike) : Math.max(step, rawStrike);
    const diff = strike - basePrice;
    
    // Call pricing model approx (Black-Scholes heuristic for UI simulation)
    const callIntrinsic = Math.max(0, basePrice - strike);
    const timeValue = isForex
      ? Math.max(0.0005, step * 0.45 * Math.exp(-Math.abs(diff) / (step * 3)))
      : Math.max(10, step * 0.45 * Math.exp(-Math.abs(diff) / (step * 3)));
    const callPrice = Number((callIntrinsic + timeValue).toFixed(isForex ? 4 : 2));
    
    // Put pricing
    const putIntrinsic = Math.max(0, strike - basePrice);
    const putPrice = Number((putIntrinsic + timeValue).toFixed(isForex ? 4 : 2));

    const callOI = Math.floor(12000 + Math.random() * 45000 - Math.abs(diff) * 15);
    const putOI = Math.floor(14000 + Math.random() * 48000 - Math.abs(diff) * 15);

    const callIV = Number((14.2 + (Math.abs(diff) / (step || 1)) * 0.3).toFixed(1));
    const putIV = Number((15.1 + (Math.abs(diff) / (step || 1)) * 0.3).toFixed(1));

    strikes.push({
      strike,
      isATM: i === 0,
      call: {
        price: Math.max(isForex ? 0.001 : 0.5, callPrice),
        change: Number(((callPrice * (instrument.change >= 0 ? 0.05 : -0.05))).toFixed(isForex ? 4 : 2)),
        changePercent: instrument.change >= 0 ? 4.2 : -5.1,
        oi: Math.max(1000, callOI),
        iv: callIV,
      },
      put: {
        price: Math.max(isForex ? 0.001 : 0.5, putPrice),
        change: Number(((putPrice * (instrument.change >= 0 ? -0.05 : 0.05))).toFixed(isForex ? 4 : 2)),
        changePercent: instrument.change >= 0 ? -4.8 : 5.4,
        oi: Math.max(1000, putOI),
        iv: putIV,
      },
    });
  }`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully patched strike generation in OptionChain.tsx');
} else {
  console.error('Target 1 not found in OptionChain.tsx');
}

// 2. Format strike display in table
const target2 = `                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {row.strike.toLocaleString('en-IN')}
                        {row.isATM && <span className="ml-1 text-[9px] text-amber-400">ATM</span>}
                      </span>`;

const replacement2 = `                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {isForex ? row.strike.toFixed(4) : row.strike.toLocaleString('en-IN')}
                        {row.isATM && <span className="ml-1 text-[9px] text-amber-400">ATM</span>}
                      </span>`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched strike formatting in OptionChain.tsx');
} else {
  console.error('Target 2 not found in OptionChain.tsx');
}

// 3. Format Call/Put prices
const target3 = `                    <td className={\`py-2 px-3 font-bold text-emerald-400 \${isITMCall ? 'bg-emerald-950/15' : ''}\`}>
                      ₹{row.call.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>`;

const replacement3 = `                    <td className={\`py-2 px-3 font-bold text-emerald-400 \${isITMCall ? 'bg-emerald-950/15' : ''}\`}>
                      {isForex ? \`$\${row.call.price.toFixed(4)}\` : \`₹\${row.call.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`}
                    </td>`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched call price formatting');
} else {
  console.error('Target 3 not found in OptionChain.tsx');
}

const target4 = `                    <td className={\`py-2 px-3 text-right font-bold text-rose-400 \${isITMPut ? 'bg-rose-950/15' : ''}\`}>
                      ₹{row.put.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>`;

const replacement4 = `                    <td className={\`py-2 px-3 text-right font-bold text-rose-400 \${isITMPut ? 'bg-rose-950/15' : ''}\`}>
                      {isForex ? \`$\${row.put.price.toFixed(4)}\` : \`₹\${row.put.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`}
                    </td>`;

if (normalize(content).includes(normalize(target4))) {
  content = normalize(content).replace(normalize(target4), normalize(replacement4));
  console.log('Successfully patched put price formatting');
} else {
  console.error('Target 4 not found in OptionChain.tsx');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating OptionChain.tsx');
