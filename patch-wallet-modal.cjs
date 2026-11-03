const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'WalletModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Scoped historyStorageKey
const target1 = `  const { user, showToast } = useAuth();

  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW' | 'HISTORY'>(initialTab);`;

const replacement1 = `  const { user, showToast } = useAuth();
  // Bug #15: Isolate client state so newly created accounts do not inherit previous demo/shared history
  const activeUserId = user?.userId || (user as any)?.user_id || user?.id;
  const historyStorageKey = activeUserId ? \`vtx_wallet_history_\${activeUserId}\` : 'vtx_wallet_history';

  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW' | 'HISTORY'>(initialTab);`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully added historyStorageKey definition');
} else {
  console.error('Target 1 not found in WalletModal.tsx');
}

// Replace localStorage.getItem('vtx_wallet_history')
content = content.replace(/localStorage\.getItem\('vtx_wallet_history'\)/g, "localStorage.getItem(historyStorageKey)");
content = content.replace(/localStorage\.setItem\('vtx_wallet_history'/g, "localStorage.setItem(historyStorageKey");

// 2. Bug #34: Functional QR code image
const target2 = `                          <div className="w-48 h-48 bg-white p-2.5 rounded-2xl flex items-center justify-center shadow-2xl relative">
                            {paymentSettings?.qr_code_url ? (
                              <img
                                src={paymentSettings.qr_code_url}
                                alt="Admin Deposit QR Code"
                                className="w-full h-full object-contain rounded-lg"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                  const fallback = document.getElementById('manual-qr-fallback');
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              id="manual-qr-fallback"
                              style={{ display: paymentSettings?.qr_code_url ? 'none' : 'flex' }}
                              className="w-full h-full flex flex-col items-center justify-center text-slate-900 text-center p-2"
                            >
                              <QrCode className="w-20 h-20 text-slate-900 mb-1" />
                              <span className="text-[10px] font-mono font-black">{paymentSettings?.upi_id || 'vertex.clearing@hdfcbank'}</span>
                            </div>
                          </div>`;

const replacement2 = `                          <div className="w-48 h-48 bg-white p-2.5 rounded-2xl flex items-center justify-center shadow-2xl relative">
                            <img
                              src={paymentSettings?.qr_code_url || \`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=\${encodeURIComponent(\`upi://pay?pa=\${paymentSettings?.upi_id || 'vertex.clearing@hdfcbank'}&pn=VERTEX+Trading&am=\${depositAmount || '50000'}&cu=INR\`)}\`}
                              alt="Official Deposit UPI QR Code"
                              className="w-full h-full object-contain rounded-lg"
                            />
                          </div>`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched Bug #34 functional QR code');
} else {
  console.error('Target 2 not found in WalletModal.tsx');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating WalletModal.tsx');
