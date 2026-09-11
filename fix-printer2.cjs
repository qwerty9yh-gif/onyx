const fs = require('fs');
const p = 'c:/Users/user/Downloads/SYSTEM/new-project/apps/web/src/lib/printer.ts';
let raw = fs.readFileSync(p, 'utf8');
let lines = raw.split('\n');
// lines[98] is line 99 (0-based 98): the corrupted header. Replace it + insert interfaces before it.
console.log('line99:', JSON.stringify(lines[98]));
console.log('line100:', JSON.stringify(lines[99]));
if (!lines[99].includes('report.batchNumber')) { console.log('unexpected content'); process.exit(2); }
const insert = [
  'export interface ReceivingLine {',
  '  name: string;',
  '  quantity: number;',
  '}',
  '',
  'export interface ReceivingReport {',
  '  storeName: string;',
  '  batchNumber: string;',
  '  createdAt: string;',
  '  time: string;',
  '  cashier: string;',
  '  lines: ReceivingLine[];',
  '  totalProducts: number;',
  '  totalUnits: number;',
  '}',
  '',
  'export function buildEscPosReceivingReport(report: ReceivingReport): Uint8Array {',
];
lines.splice(98, 1, ...insert);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
const s = lines.join('\n');
const count = (n) => (s.split(n).length - 1);
console.log('receiving:', count('buildEscPosReceivingReport'), 'receipt:', count('buildEscPosReceipt'), 'invoice:', count('buildEscPosInvoice'));
