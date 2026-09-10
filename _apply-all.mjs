import fs from 'node:fs';

function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function write(p, c) {
  fs.writeFileSync(p, c);
}
function mustReplace(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error('pattern not found: ' + label);
  return content.split(search).join(replacement);
}

// 1) Copy new UI files into place
const copies = [
  ['_ui-new/Badge.tsx', 'apps/web/src/components/ui/Badge.tsx'],
  ['_ui-new/Button.tsx', 'apps/web/src/components/ui/Button.tsx'],
  ['_ui-new/Input.tsx', 'apps/web/src/components/ui/Input.tsx'],
  ['_ui-new/Select.tsx', 'apps/web/src/components/ui/Select.tsx'],
  ['_ui-new/Modal.tsx', 'apps/web/src/components/ui/Modal.tsx'],
  ['_ui-new/DataTable.tsx', 'apps/web/src/components/ui/DataTable.tsx'],
  ['_ui-new/SalesPage.tsx', 'apps/web/src/pages/sales/SalesPage.tsx'],
  ['_ui-new/TransactionsPage.tsx', 'apps/web/src/pages/transactions/TransactionsPage.tsx'],
  ['_ui-new/ReceiptPage.tsx', 'apps/web/src/pages/sales/ReceiptPage.tsx'],
  ['_ui-new/CustomersPage.tsx', 'apps/web/src/pages/customers/CustomersPage.tsx'],
  ['_ui-new/CustomerForm.tsx', 'apps/web/src/pages/customers/CustomerForm.tsx'],
  ['_ui-new/Navigation.tsx', 'apps/web/src/components/layout/Navigation.tsx'],
];
for (const [from, to] of copies) {
  write(to, read(from));
  console.log('copied', to);
}

// 2) types.ts patches
const typesPath = 'apps/web/src/lib/types.ts';
let types = read(typesPath);
types = types.split('\n').filter((line) => !line.includes('phoneLabel?')).join('\n');
types = types
  .split('  customerId?: string;')
  .join('  customerId?: string;\n  customerPhone?: string | null;\n  waiterId?: string;\n  waiter?: { id: string; firstName: string; lastName: string } | null;');
types = types
  .split('  refund?: Refund;\n  sendInvoiceBySms?: (phone?: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;')
  .join('  refund?: Refund;');
types = types.replace(/sendInvoiceBySms\?:[^\n]*\n/g, '');
if (!types.includes('SmsSendResult')) {
  types += '\nexport interface SmsSendResult {\n  success: boolean;\n  messageId?: string;\n  error?: string;\n}\n';
}
write(typesPath, types);
console.log('patched types.ts', 'sms-result?', types.includes('SmsSendResult'), 'phoneLabel?', types.includes('phoneLabel'), 'waiter?', types.includes('waiterId'));

// 3) api.ts append helpers
const apiPath = 'apps/web/src/lib/api.ts';
let apiSrc = read(apiPath);
if (!apiSrc.includes('export async function sendSmsInvoice')) {
  apiSrc += '\n\nexport interface SmsSendResult {\n  success: boolean;\n  messageId?: string;\n  error?: string;\n}\n\n' +
    'export async function sendSmsInvoice(saleId: string, phone?: string): Promise<SmsSendResult> {\n' +
    '  const res = await api.post(`/sales/${saleId}/sms-invoice`, { phone: phone || undefined });\n' +
    '  return res.data.data as SmsSendResult;\n}\n\n' +
    'export async function broadcastCustomerSms(title: string, message: string): Promise<{ sent: number; failed: number; total: number }> {\n' +
    '  const res = await api.post(\'/customers/broadcast\', { title, message });\n' +
    '  return res.data.data as { sent: number; failed: number; total: number };\n}\n\n' +
    'export async function messageCustomer(customerId: string, title: string, message: string): Promise<SmsSendResult> {\n' +
    '  const res = await api.post(`/customers/${customerId}/message`, { title, message });\n' +
    '  return res.data.data as SmsSendResult;\n}\n';
  write(apiPath, apiSrc);
  console.log('patched api.ts');
} else {
  console.log('api.ts already patched');
}

// 4) Layout.tsx dock + icon import
const layoutPath = 'apps/web/src/components/layout/Layout.tsx';
let layout = read(layoutPath);
layout = layout
  .split("import { Home, Receipt, ShoppingCart, Truck, Settings } from 'lucide-react';")
  .join("import { Home, Receipt, ShoppingCart, Truck, Settings, Users } from 'lucide-react';");
layout = layout
  .split('<NavLink to="/incoming"><Truck size={20} /><span>Incoming</span></NavLink>')
  .join('<NavLink to="/incoming"><Truck size={20} /><span>Incoming</span></NavLink>\n          <NavLink to="/customers"><Users size={20} /><span>Customers</span></NavLink>');
write(layoutPath, layout);
console.log('patched Layout.tsx', 'users?', layout.includes('Users size={20}'));

// 5) index.css dock grid 6 columns
const cssPath = 'apps/web/src/index.css';
let css = read(cssPath);
css = css.split('grid-template-columns: repeat(5, 1fr);').join('grid-template-columns: repeat(6, 1fr);');
write(cssPath, css);
console.log('patched index.css', '6col?', css.includes('repeat(6, 1fr)'));

console.log('ALL DONE');