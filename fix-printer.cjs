const fs = require('fs');
const p = 'c:/Users/user/Downloads/SYSTEM/new-project/apps/web/src/lib/printer.ts';
let s = fs.readFileSync(p, 'utf8');
// Replace the corrupted first receipt function header with correct receiving-report block + restore receipt header
const corruptedHeader = "export function buildEscPosReceipt(receipt: ReceiptData): Uint8Array {\n  const qr = qrMatrix(`ONYX|${report.batchNumber}|${report.totalUnits}`);";
if (!s.includes(corruptedHeader)) { console.log('corrupted header NOT found'); process.exit(2); }
const fixedBlock = "export interface ReceivingLine {\n  name: string;\n  quantity: number;\n}\n\nexport interface ReceivingReport {\n  storeName: string;\n  batchNumber: string;\n  createdAt: string;\n  time: string;\n  cashier: string;\n  lines: ReceivingLine[];\n  totalProducts: number;\n  totalUnits: number;\n}\n\nexport function buildEscPosReceivingReport(report: ReceivingReport): Uint8Array {\n  const qr = qrMatrix(`ONYX|${report.batchNumber}|${report.totalUnits}`);";
s = s.replace(corruptedHeader, fixedBlock);
// The second duplicate header "export function buildEscPosReceipt(receipt..." should remain once.
// After fix there should be exactly 1 buildEscPosReceivingReport and 1 buildEscPosReceipt and 1 buildEscPosInvoice
fs.writeFileSync(p, s, 'utf8');
const count = (n) => (s.match(new RegExp(n, 'g')) || []).length;
console.log('receiving:', count('buildEscPosReceivingReport'), 'receipt:', count('buildEscPosReceipt'), 'invoice:', count('buildEscPosInvoice'));
