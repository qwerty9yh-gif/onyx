const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const API = 'http://localhost:3001/api';
const UID = process.argv[2]; // argv[1] is the script path

async function request(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const login = await request('POST', '/auth/card-login', null, { userId: UID, password: 'Onyx@2026' });
  const token = login.data.token;
  console.log('Logged in as', login.data.user.email);

  // Stock in two products
  const prods = await request('GET', '/products?limit=3&status=ACTIVE', token);
  for (const prod of prods.data.slice(0, 2)) {
    await request('POST', '/inventory/stock-in', token, { productId: prod.id, quantity: 50, unitPrice: prod.sellingPrice, notes: 'ONYX demo stock' });
    console.log('Stocked', prod.name, 'x50');
  }

  const p1 = prods.data[0];
  // Create unpaid invoice
  const inv = await request('POST', '/sales', token, {
    items: [{ productId: p1.id, quantity: 2, discount: 0, discountType: 'fixed' }],
    paymentMethod: 'CASH', amountReceived: 0, markPaid: false, notes: 'ONYX test invoice',
  });
  console.log('Invoice created:', inv.data.receiptNumber, 'status=', inv.data.status, 'total=', inv.data.total);

  // Mark it paid
  const paid = await request('POST', `/sales/${inv.data.id}/mark-paid`, token, { paymentMethod: 'CASH', amountReceived: inv.data.total });
  console.log('Marked paid:', paid.data.status);

  // Create a straight paid sale
  const sale = await request('POST', '/sales', token, {
    items: [{ productId: p1.id, quantity: 1, discount: 0, discountType: 'fixed' }],
    paymentMethod: 'CARD', amountReceived: 100, markPaid: true,
  });
  console.log('Paid sale:', sale.data.receiptNumber, 'status=', sale.data.status);

  // Search
  const invSearch = await request('GET', '/sales?search=INV-', token);
  console.log('Invoice search count:', invSearch.data.length);
  const dash = await request('GET', '/analytics/dashboard', token);
  console.log('Dashboard: pendingInvoices=', dash.data.pendingInvoices, 'lowStock=', dash.data.lowStock, 'recentActivity=', dash.data.recentActivity.filter(x => x.action === 'CREATE_INVOICE').length, 'entries');
  await p.$disconnect();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });