import fs from 'node:fs';

const salesPath = 'apps/api/src/routes/sales.ts';
let sales = fs.readFileSync(salesPath, 'utf8');

// 1) GET / list include -> add waiter + customer phone
const listIncludeOld = `      prisma.sale.findMany({
        where, include: {
          cashier: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, name: true } },
          items: true, payments: true
        },`;
const listIncludeNew = `      prisma.sale.findMany({
        where, include: {
          cashier: { select: { id: true, firstName: true, lastName: true } },
          waiter: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, name: true, phone: true } },
          items: true, payments: true
        },`;
if (!sales.includes(listIncludeOld)) throw new Error('list include block not found');
sales = sales.replace(listIncludeOld, listIncludeNew);

// 2) GET /:id include -> add waiter
const detailIncludeOld = `      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, image: true } } } },
        payments: true, refund: true
      }`;
const detailIncludeNew = `      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        waiter: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, image: true } } } },
        payments: true, refund: true
      }`;
if (!sales.includes(detailIncludeOld)) throw new Error('detail include block not found');
sales = sales.replace(detailIncludeOld, detailIncludeNew);

// 3) Insert GET /waiters route before GET /:id
const waitersRoute = `
// GET /api/sales/waiters - Active staff eligible as waiters (any authenticated role)
router.get('/waiters', async (req: AuthenticatedRequest, res, next) => {
  try {
    const waiters = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: 'CASHIER' },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ success: true, data: waiters });
  } catch (err) { next(err); }
});

// GET /api/sales/:id - Get sale by ID`;
const marker = `// GET /api/sales/:id - Get sale by ID`;
if (!sales.includes(marker)) throw new Error('detail marker not found');
sales = sales.replace(marker, waitersRoute);

fs.writeFileSync(salesPath, sales);
console.log('sales.ts updated');