const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'TradingViewChart.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

const target = `  // Crypto
  if (clean.includes('BTC') || clean.includes('BITCOIN')) return 'BINANCE:BTCUSDT';
  if (clean.includes('ETH') || clean.includes('ETHEREUM')) return 'BINANCE:ETHUSDT';
  if (clean.includes('SOL') || clean.includes('SOLANA')) return 'BINANCE:SOLUSDT';
  if (clean.includes('BNB')) return 'BINANCE:BNBUSDT';
  if (clean.includes('XRP') || clean.includes('RIPPLE')) return 'BINANCE:XRPUSDT';
  if (clean.includes('DOGE')) return 'BINANCE:DOGEUSDT';
  if (clean.includes('ADA') || clean.includes('CARDANO')) return 'BINANCE:ADAUSDT';
  if (clean.includes('MATIC') || clean.includes('POLYGON')) return 'BINANCE:MATICUSDT';

  // Indian Equities
  if (clean.includes('RELIANCE')) return 'NSE:RELIANCE';
  if (clean.includes('HDFC')) return 'NSE:HDFCBANK';`;

const replacement = `  // Crypto (Spot & Perpetuals)
  if (clean.includes('BTC') || clean.includes('BITCOIN')) return (clean.includes('USDT') || clean.includes('PERP')) ? 'BINANCE:BTCUSDTPERP' : 'BINANCE:BTCUSDT';
  if (clean.includes('ETH') || clean.includes('ETHEREUM')) return (clean.includes('USDT') || clean.includes('PERP')) ? 'BINANCE:ETHUSDTPERP' : 'BINANCE:ETHUSDT';
  if (clean.includes('SOL') || clean.includes('SOLANA')) return (clean.includes('USDT') || clean.includes('PERP')) ? 'BINANCE:SOLUSDTPERP' : 'BINANCE:SOLUSDT';
  if (clean.includes('BNB')) return 'BINANCE:BNBUSDT';
  if (clean.includes('XRP') || clean.includes('RIPPLE')) return 'BINANCE:XRPUSDT';
  if (clean.includes('DOGE')) return 'BINANCE:DOGEUSDT';
  if (clean.includes('ADA') || clean.includes('CARDANO')) return 'BINANCE:ADAUSDT';
  if (clean.includes('MATIC') || clean.includes('POLYGON')) return 'BINANCE:MATICUSDT';

  // Indian Equities
  if (clean.includes('RELIANCE')) return 'NSE:RELIANCE';
  if (clean.includes('HDFCLIFE')) return 'NSE:HDFCLIFE';
  if (clean.includes('HDFCBANK') || clean.includes('HDFC')) return 'NSE:HDFCBANK';`;

if (normalize(content).includes(normalize(target))) {
  content = normalize(content).replace(normalize(target), normalize(replacement));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched TradingViewChart.tsx');
} else {
  console.error('Target not found in TradingViewChart.tsx');
}
