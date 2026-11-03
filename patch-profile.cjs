const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'ProfileDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

const target = `<span className="font-mono text-slate-200">+{user.countryCode || '91'} {user.mobile || '9876543210'}</span>`;
const replacement = `<span className="font-mono text-slate-200">{(user.countryCode ? (user.countryCode.startsWith('+') ? user.countryCode : \`+\${user.countryCode}\`) : '+91')} {user.mobile || '9876543210'}</span>`;

if (normalize(content).includes(normalize(target))) {
  content = normalize(content).replace(normalize(target), normalize(replacement));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched ProfileDashboard.tsx (Bug #32 duplicate ++91)');
} else {
  console.error('Target not found in ProfileDashboard.tsx');
}
