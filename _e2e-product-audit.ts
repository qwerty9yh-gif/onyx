const BASE = 'http://localhost:3001/api';
const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const step = (s: string, ok: boolean, detail: string) => results.push({ step: s, ok, detail });

async function call(path: string, init?: RequestInit, token?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(BASE + path, {
    ...(init || {}),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init && (init as any).headers) || {}),
    },
  });

  let body: any = { success: false };
  try {
    body = await res.json();
  } catch {
    // non-json
  }

  return { status: res.status, body };
}

async function login(email: string, password: string): Promise<{ token: string; userId: string }> {
  const usersRes = await call('/auth/users');
  const users = Array.isArray(usersRes.body?.data) ? usersRes.body.data : [];
  const user = users.find((u: any) => u.email === email);

  if (!user) {
    throw new Error('User not found: ' + email);
  }

  const r = await call('/auth/card-login', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, password }),
  });

  if (r.status !== 200) {
    throw new Error('Login failed: ' + r.status);
  }

  return { token: r.body.data.token, userId: user.id };
}

async function main(): Promise<void> {
  const { token, userId } = await login('qwerty9yh@gmail.com', '123456789');
  step('Admin login', true, userId);

  const listRes = await call('/products?limit=20', undefined, token);
  const products: any[] = listRes.body?.data || [];
  step('GET /products list', listRes.status === 200 && products.length > 0, 'Status ' + listRes.status + ', ' + products.length + ' products');
  if (products.length === 0) {
    step('Find seeded product', false, 'No products');
    return;
  }

  const target: any = products.find((p) => p.localId && p.localId.startsWith('catalog-')) || products[0];
  step('Found seeded product', true, target.name + ' (id=' + target.id + ', localId=' + target.localId + ')');

  const oneRes = await call('/products/' + target.id, undefined, token);
  step('GET /products/:id fetch', oneRes.status === 200 && !!oneRes.body?.data, 'Status ' + oneRes.status + ', name=' + (oneRes.body?.data && oneRes.body.data.name));

  const origName = target.name;
  const origPrice = target.sellingPrice;
  const origStock = target.stockQuantity;
  const newName = origName + ' [EDITED ' + Date.now() + ']';
  const newPrice = Math.round(Math.random() * 1000) / 100 + 0.01;
  const editRes = await call('/products/' + target.id, {
    method: 'PUT',
    body: JSON.stringify({ name: newName, sellingPrice: newPrice, stockQuantity: origStock + 1 }),
  }, token);
  step('PUT edit seeded product', editRes.status === 200 && editRes.body.success, 'Status ' + editRes.status + ' ' + (editRes.body.error || ''));

  const refetch = await call('/products/' + target.id, undefined, token);
  const rf: any = refetch.body?.data;
  const nameOk = rf && rf.name === newName;
  const priceOk = rf && rf.sellingPrice === newPrice;
  const stockOk = rf && rf.stockQuantity === origStock + 1;
  step('Verify edit persists', nameOk && priceOk && stockOk, 'Name:' + (nameOk ? 'MATCH' : 'MISMATCH') + ' Price:' + (priceOk ? 'MATCH' : 'MISMATCH') + ' Stock:' + (stockOk ? 'MATCH' : 'MISMATCH'));

  await call('/products/' + target.id, {
    method: 'PUT',
    body: JSON.stringify({ name: origName, sellingPrice: origPrice, stockQuantity: origStock }),
  }, token);
  step('Restore original values', true, 'Done');

  const emptyBc = await call('/products/' + target.id, {
    method: 'PUT',
    body: JSON.stringify({ barcode: '' }),
  }, token);
  step('PUT barcode empty -> NULL', emptyBc.status === 200 && emptyBc.body.success, 'Status ' + emptyBc.status + ' ' + (emptyBc.body.error || ''));

  const newSku = 'TEST-E2E-' + Date.now();
  const createRes = await call('/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E Test Product',
      sku: newSku,
      barcode: '',
      description: 'E2E test',
      sellingPrice: 99.99,
      costPrice: 50,
      stockQuantity: 10,
      minimumStock: 5,
      taxRate: 0.12,
      status: 'ACTIVE',
    }),
  }, token);
  const newProd: any = createRes.body?.data;
  step('POST create new product', createRes.status === 201 && createRes.body.success, 'Status ' + createRes.status + ' id=' + (newProd && newProd.id) + ' err=' + (createRes.body.error || 'none'));

  const searchRes = await call('/products?search=' + newSku, undefined, token);
  const inList = (searchRes.body?.data || []).some((p: any) => p && p.id === (newProd && newProd.id));
  step('New product in list', !!inList, 'Found: ' + inList);

  if (newProd && newProd.id) {
    const vRes = await call('/products/' + newProd.id, undefined, token);
    step('GET /:id returns new product', vRes.status === 200 && vRes.body?.data?.id === newProd.id, 'Status ' + vRes.status);
  }

  if (newProd && newProd.id) {
    const bc = newSku + '-BC';
    const assignRes = await call('/products/' + newProd.id, {
      method: 'PUT',
      body: JSON.stringify({ barcode: bc }),
    }, token);
    step('PUT assign barcode', assignRes.status === 200 && assignRes.body.success, 'Status ' + assignRes.status + ' ' + (assignRes.body.error || ''));
    const bcLookup = await call('/products/barcode/' + bc, undefined, token);
    step('GET /barcode/:barcode works', bcLookup.status === 200 && bcLookup.body.success, 'Status ' + bcLookup.status + ' name=' + (bcLookup.body.data && bcLookup.body.data.name));
  }

  if (newProd && newProd.id) {
    const dupRes = await call('/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup', sku: newSku, sellingPrice: 10 }),
    }, token);
    step('POST dup SKU -> 409', dupRes.status === 409, 'Status ' + dupRes.status + ' ' + (dupRes.body.error || ''));
  }

  if (newProd && newProd.id) {
    const delRes = await call('/products/' + newProd.id, { method: 'DELETE' }, token);
    step('DELETE test product', delRes.status === 200 && delRes.body.success, 'Status ' + delRes.status + ' ' + (delRes.body.error || ''));
    const gone = await call('/products/' + newProd.id, undefined, token);
    step('Deleted -> 404', gone.status === 404, 'Status ' + gone.status);
  }

  console.log('\n=== PRODUCT MANAGEMENT E2E AUDIT RESULTS ===');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      passed++;
    } else {
      failed++;
    }
    console.log('  [' + (r.ok ? 'PASS' : 'FAIL') + '] ' + r.step + ' - ' + r.detail);
  }
  console.log('=== Total: ' + (passed + failed) + ' | Passed: ' + passed + ' | Failed: ' + failed + ' ===');
  console.log(JSON.stringify(results, null, 2));

  if (failed > 0) {
    console.error('\nAUDIT FAILED');
    process.exit(1);
  } else {
    console.log('\nAUDIT PASSED');
    process.exit(0);
  }
}

main().catch((e: any) => {
  console.error('Crashed:', e.message);
  console.error(e.stack);
  process.exit(2);
});
