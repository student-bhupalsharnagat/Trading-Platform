const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Dashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

const target = `interface DashboardProps {`;
const replacement = `// Helper to format product display (CNC, MIS, NRML)
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

interface DashboardProps {`;

if (normalize(content).includes(normalize(target))) {
  content = normalize(content).replace(normalize(target), normalize(replacement));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully added helpers to Dashboard.tsx');
} else {
  console.error('Target not found in Dashboard.tsx');
}
