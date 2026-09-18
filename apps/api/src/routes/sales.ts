import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { roundToTwoDecimals, calculateTotal, generateReceiptNumber, generateInvoiceNumber, generateIdempotencyKey, generateLocalId } from '../utils/helpers.js';

const router = Router();

interface SaleItemInput {
  productId: string;
  quantity: number;
  discount: number;
  discountType: string;
}

// Roles that may see and operate on every waiter's transactions (admin, manager,
// cashier and inventory staff). Normal workers/waiters are always limited to
// their own transactions, enforced here on the server.
const FULL_TRANSACTION_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'];
const canViewAllTransactions = (role?: string): boolean => !!role && FULL_TRANSACTION_ROLES.includes(role);

// Staff who can be attached to an order as the waiter/worker.
const ORDER_STAFF_ROLES = ['CASHIER', 'WAITER', 'WORKER'];

const saleListInclude = {
  cashier: { select: { id: true, firstName: true, lastName: true } },
  waiter: { select: { id: true, firstName: true, lastName: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: true,
  payments: true,
} as const;

/** Where-clause that limits a user to the transactions they own. */
function ownTransactionsFilter(userId: string) {
  return { OR: [{ cashierId: userId }, { waiterId: userId }] };
}

/** Sum of every payment recorded against a sale (falls back to amountReceived). */
function paidSoFar(sale: { amountReceived?: number | null; payments?: Array<{ amount: number }> }): number {
  const paymentsTotal = roundToTwoDecimals((sale.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0));
  return paymentsTotal > 0 ? paymentsTotal : roundToTwoDecimals(sale.amountReceived || 0);
}

/**
 * Attach `amountPaid` / `remaining` to a sale. Remaining is clamped at zero so
 * money still owed is never rendered as a negative amount.
 */
function withPaymentSummary<T extends { total: number; amountReceived?: number | null; payments?: Array<{ amount: number }> }>(sale: T) {
  const amountPaid = paidSoFar(sale);
  const remaining = roundToTwoDecimals(Math.max(roundToTwoDecimals(sale.total || 0) - amountPaid, 0));
  return { ...sale, amountPaid, remaining };
}

/** Build sale-item rows from the request payload (shared by create & append). */
function buildSaleLines(
  items: SaleItemInput[],
  products: Array<{ id: string; name: string; sku: string; sellingPrice: number; taxRate: number | null } | null>,
  fallbackTaxRate: number,
) {
  return items.map((item) => {
    const p = products.find((x) => x?.id === item.productId)!;
    const sp = item.quantity * p.sellingPrice;
    const discount = item.discountType === 'percentage'
      ? roundToTwoDecimals(sp * ((item.discount || 0) / 100))
      : Math.min(item.discount || 0, sp);
    const tax = roundToTwoDecimals((sp - discount) * (p.taxRate || fallbackTaxRate));
    return {
      productId: p.id, name: p.name, sku: p.sku, quantity: item.quantity, unitPrice: p.sellingPrice,
      discount, tax, subtotal: roundToTwoDecimals(sp), total: roundToTwoDecimals(sp - discount + tax),
    };
  });
}

// Archive pending work before resetting the active shift; historical rows remain queryable.
router.post('/daily-reset', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const pending = await prisma.sale.findMany({ where: { status: 'PENDING' }, select: { id: true, receiptNumber: true, total: true } });
    const result = await prisma.$transaction(async (tx) => {
      for (const sale of pending) {
        await tx.auditLog.create({ data: { userId: req.user!.id, action: 'ARCHIVE_DAILY_TRANSACTION', entity: 'sale', entityId: sale.id, details: { receiptNumber: sale.receiptNumber, total: sale.total } } });
        await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOIDED', voidedAt: new Date(), notes: 'Archived during daily reset' } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'DAILY_RESET', entity: 'sales', entityId: null, details: { archivedCount: pending.length } } });
      return pending.length;
    });
    res.json({ success: true, data: { archived: result, resetAt: new Date().toISOString() }, message: 'Pending transactions archived and active shift reset' });
  } catch (err) { next(err); }
});

// POST /api/sales - Create a new sale
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { customerId, paymentMethod, amountReceived, notes, markPaid = true, waiterId, customerPhone, customerNote } = req.body;
    const items = (req.body.items || []) as SaleItemInput[];
    if (!items.length) throw new AppError('Items required', 400);
    if (!paymentMethod) throw new AppError('Payment method required', 400);
    for (const item of items) {
      if (!item.productId) throw new AppError('Each line needs a product', 400);
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new AppError('Quantity must be a positive whole number', 400);
    }
    // Short physical-customer identifier, e.g. "Table 5" (kept separate from `notes`).
    const customerNoteFinal = typeof customerNote === 'string' && customerNote.trim() ? customerNote.trim().slice(0, 120) : null;
    const idempotencyKey = typeof req.body.idempotencyKey === 'string' ? req.body.idempotencyKey : generateIdempotencyKey();
    const localIdFinal = generateLocalId();
    const existing = await prisma.sale.findFirst({ where: { idempotencyKey } });
    if (existing?.status === 'COMPLETED') return res.json({ success: true, data: existing, message: 'Already processed' });
    const products = await Promise.all(items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })));
    for (const item of items) {
      const p = products.find((x) => x?.id === item.productId);
      if (!p || p.status !== 'ACTIVE') throw new AppError('Product unavailable', 400);
      if (markPaid && p.stockQuantity < item.quantity) throw new AppError('Insufficient stock', 400);
    }
    const business = await prisma.business.findFirst({ select: { taxRate: true } });
    const taxRate = business?.taxRate || 0;

    // Resolve customer: use provided ID, or find/create by phone
    let resolvedCustomerId = customerId;
    if (customerPhone && !resolvedCustomerId) {
      let c = await prisma.customer.findFirst({ where: { phone: customerPhone } });
      if (!c) {
        const localId = generateLocalId();
        const displayName = `CUST-${localId.slice(0, 8).toUpperCase()}`;
        c = await prisma.customer.create({
          data: { name: displayName, phone: customerPhone, localId },
        });
      }
      resolvedCustomerId = c.id;
    }
    const itemsSnap = buildSaleLines(items, products, taxRate);
    const rawSubtotal = roundToTwoDecimals(itemsSnap.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
    const totalDiscount = roundToTwoDecimals(itemsSnap.reduce((s, i) => s + i.discount, 0));
    const totalTax = roundToTwoDecimals(itemsSnap.reduce((s, i) => s + i.tax, 0));
    const grandTotal = calculateTotal(rawSubtotal, totalDiscount, totalTax);
    const received = markPaid ? Number(amountReceived || 0) : 0;
    if (markPaid && received < grandTotal) throw new AppError('Insufficient payment', 400);
    const change = markPaid ? roundToTwoDecimals(received - grandTotal) : 0;
    const receiptNumber = markPaid ? generateReceiptNumber() : generateInvoiceNumber();
    const now = new Date();
    const sale = await prisma.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          receiptNumber, cashierId: req.user!.id, customerId: resolvedCustomerId, waiterId, status: markPaid ? 'COMPLETED' : 'PENDING',
          syncStatus: 'PENDING', subtotal: rawSubtotal, discount: totalDiscount, discountType: 'percentage',
          tax: totalTax, total: grandTotal, paymentMethod, amountReceived: received, change, notes, customerPhone, customerNote: customerNoteFinal,
          deviceId: '', localId: localIdFinal, idempotencyKey, completedAt: markPaid ? now : null, createdAt: now
        }
      });
      await tx.saleItem.createMany({
        data: itemsSnap.map(i => ({
          saleId: createdSale.id, productId: i.productId, name: i.name, sku: i.sku, quantity: i.quantity,
          unitPrice: i.unitPrice, subtotal: i.subtotal, discount: i.discount, tax: i.tax, total: i.total
        }))
      });
      if (markPaid) {
        await tx.payment.create({ data: { saleId: createdSale.id, method: paymentMethod, amount: received } });
        for (const item of itemsSnap) {
          const product = await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
          await tx.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'SALE', quantity: -item.quantity, previousStock: product.stockQuantity + item.quantity, newStock: product.stockQuantity, referenceId: createdSale.id, notes: `Sale ${receiptNumber}` } });
        }
        if (customerId) await tx.customer.update({ where: { id: customerId }, data: { totalSpent: { increment: grandTotal }, lastPurchase: now } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: markPaid ? 'CREATE_SALE' : 'CREATE_INVOICE', entity: 'sale', entityId: createdSale.id, details: { receiptNumber, total: grandTotal, paymentMethod, status: createdSale.status } } });
      await tx.syncOperation.create({
        data: {
          userId: req.user!.id, entity: 'sale', entityId: createdSale.id, operationType: 'create',
          payload: { saleId: createdSale.id, items: itemsSnap, receiptNumber, subtotal: rawSubtotal, discount: totalDiscount, tax: totalTax, total: grandTotal, paymentMethod, amountReceived, change, notes, customerId },
          status: 'PENDING', localId: localIdFinal, serverId: createdSale.id, idempotencyKey
        }
      });
      return createdSale;
    });
    res.status(201).json({ success: true, data: { id: sale.id, receiptNumber, status: sale.status, total: grandTotal, change, paymentMethod, createdAt: sale.createdAt }, receiptNumber, message: markPaid ? 'Sale completed' : 'Invoice saved as unpaid' });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/mark-paid - Convert an unpaid invoice into a paid sale
router.post('/:id/mark-paid', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { paymentMethod, amountReceived } = req.body;
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true, customer: true, payments: true } });
    if (!s) throw new AppError('Not found', 404);
    if (!canViewAllTransactions(req.user?.role) && s.cashierId !== req.user!.id && s.waiterId !== req.user!.id) throw new AppError('Forbidden', 403);
    if (s.status === 'COMPLETED') return res.json({ success: true, data: withPaymentSummary(s), message: 'Already paid' });
    if (s.status !== 'PENDING') throw new AppError('Cannot mark paid', 400);
    const received = Number(amountReceived || s.total);
    if (received < s.total) throw new AppError('Insufficient payment', 400);
    // Only the outstanding part is recorded as a new payment so payments already
    // taken on this transaction are never counted twice.
    const alreadyPaid = paidSoFar(s);
    const paymentDelta = roundToTwoDecimals(Math.max(received - alreadyPaid, 0));
    const products = await Promise.all(s.items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })));
    for (const item of s.items) {
      const p = products.find((x) => x?.id === item.productId);
      if (!p || p.status !== 'ACTIVE') throw new AppError('Product unavailable', 400);
      if (p.stockQuantity < item.quantity) throw new AppError('Insufficient stock', 400);
    }
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const paid = await tx.sale.update({
        where: { id: s.id },
        data: { status: 'COMPLETED', paymentMethod: paymentMethod || s.paymentMethod, amountReceived: received, change: roundToTwoDecimals(received - s.total), completedAt: now },
      });
      if (paymentDelta > 0) {
        await tx.payment.create({ data: { saleId: s.id, method: paymentMethod || s.paymentMethod, amount: paymentDelta } });
      }
      for (const item of s.items) {
        const product = await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
        await tx.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'SALE', quantity: -item.quantity, previousStock: product.stockQuantity + item.quantity, newStock: product.stockQuantity, referenceId: s.id, notes: `Sale ${s.receiptNumber}` } });
      }
      if (s.customerId) await tx.customer.update({ where: { id: s.customerId }, data: { totalSpent: { increment: s.total }, lastPurchase: now } });
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'MARK_PAID', entity: 'sale', entityId: s.id, details: { receiptNumber: s.receiptNumber, total: s.total, paymentMethod } } });
      return paid;
    });
    res.json({ success: true, data: updated, message: 'Invoice marked as paid' });
  } catch (err) { next(err); }
});

// GET /api/sales - List sales
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const where: Record<string, unknown> = {};
    const andClauses: Record<string, unknown>[] = [];
    const rawStatus = (req.query.status as string | undefined) || '';
    const statuses = rawStatus.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where.status = statuses[0];
    } else if (statuses.length > 1) {
      andClauses.push({ status: { in: statuses } });
    }
    const staffId = (req.query.staffId || req.query.waiterId || req.query.cashierId) as string | undefined;
    if (canViewAllTransactions(req.user?.role)) {
      // Full-access roles (admin, manager, cashier, inventory staff) may filter by
      // any waiter/worker; without a filter they see everything.
      if (staffId) andClauses.push({ OR: [{ waiterId: staffId }, { cashierId: staffId }] });
    } else {
      // Normal workers/waiters only ever see their own transactions — enforced
      // server-side, not just hidden in the UI.
      andClauses.push(ownTransactionsFilter(req.user!.id));
    }
    if (req.query.search) {
      const s = req.query.search as string;
      andClauses.push({
        OR: [
          { receiptNumber: { contains: s, mode: 'insensitive' } },
          { customerNote: { contains: s, mode: 'insensitive' } },
          { cashier: { is: { firstName: { contains: s, mode: 'insensitive' } } } },
          { cashier: { is: { lastName: { contains: s, mode: 'insensitive' } } } },
          { waiter: { is: { firstName: { contains: s, mode: 'insensitive' } } } },
          { waiter: { is: { lastName: { contains: s, mode: 'insensitive' } } } },
          { customer: { is: { name: { contains: s, mode: 'insensitive' } } } },
        ],
      });
    }
    if (andClauses.length) where.AND = andClauses;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: saleListInclude,
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit
      }),
      prisma.sale.count({ where })
    ]);
    res.json({ success: true, data: sales.map((sale) => withPaymentSummary(sale)), total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/sales/stats - Quick stats for dashboard
router.get('/stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [todaySales, todayRevenue, weekSales, monthSales, totalTransactions] = await Promise.all([
      prisma.sale.count({ where: { status: 'COMPLETED', completedAt: { gte: today } } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: today } }, _sum: { total: true } }),
      prisma.sale.count({ where: { status: 'COMPLETED', completedAt: { gte: new Date(today.getTime() - 7 * 86400000) } } }),
      prisma.sale.count({ where: { status: 'COMPLETED', completedAt: { gte: new Date(today.getTime() - 30 * 86400000) } } }),
      prisma.sale.count({ where: { status: 'COMPLETED' } }),
    ]);
    res.json({ success: true, data: {
      todaySales, todayRevenue: todayRevenue._sum.total || 0,
      weekSales, monthSales, totalTransactions
    }});
  } catch (err) { next(err); }
});


// GET /api/sales/waiters - Staff eligible to serve an order (waiter/worker/cashier).
// Full-access roles receive every staff member; normal workers only receive
// themselves so they can never pick (or view) another worker's orders.
router.get('/waiters', async (req: AuthenticatedRequest, res, next) => {
  try {
    const where: Record<string, unknown> = { status: 'ACTIVE', role: { in: ORDER_STAFF_ROLES } };
    if (!canViewAllTransactions(req.user?.role)) where.id = req.user!.id;
    const waiters = await prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ success: true, data: waiters });
  } catch (err) { next(err); }
});

// GET /api/sales/open-orders - OPEN (unpaid) transactions that can be continued.
// Used by the Sales "Order" picker: only the selected waiter's own open orders.
router.get('/open-orders', async (req: AuthenticatedRequest, res, next) => {
  try {
    const staffId = req.query.staffId as string | undefined;
    const where: Record<string, unknown> = { status: 'PENDING' };
    if (canViewAllTransactions(req.user?.role)) {
      if (staffId) where.OR = [{ waiterId: staffId }, { cashierId: staffId }];
    } else {
      where.OR = ownTransactionsFilter(req.user!.id).OR;
    }
    const orders = await prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        waiter: { select: { id: true, firstName: true, lastName: true } },
        items: { select: { id: true, quantity: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: orders.map((order) => withPaymentSummary(order)) });
  } catch (err) { next(err); }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    // Full-access roles can open any transaction; everyone else only their own.
    const where: Record<string, unknown> = canViewAllTransactions(req.user?.role)
      ? { id: req.params.id }
      : { id: req.params.id, OR: ownTransactionsFilter(req.user!.id).OR };
    const s = await prisma.sale.findFirst({
      where,
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        waiter: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, image: true } } } },
        payments: true, refund: true
      }
    });
    if (!s) throw new AppError('Not found', 404);
    res.json({ success: true, data: withPaymentSummary(s) });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/items - Append products to an OPEN (unpaid) transaction.
// Append-only: the same transaction/invoice is reused, existing line items are
// never removed, reduced or rewritten, and no new invoice is created.
router.post('/:id/items', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const items = (req.body.items || []) as SaleItemInput[];
    if (!items.length) throw new AppError('Add at least one product to continue this order', 400);
    for (const item of items) {
      if (!item.productId) throw new AppError('Each line needs a product', 400);
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new AppError('Quantity must be a positive whole number', 400);
    }
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true, payments: true } });
    if (!sale) throw new AppError('Not found', 404);
    if (sale.status === 'COMPLETED') throw new AppError('This transaction is already paid and locked', 400);
    if (sale.status !== 'PENDING') throw new AppError('Only open (unpaid) transactions can be continued', 400);
    if (!canViewAllTransactions(req.user?.role) && sale.cashierId !== req.user!.id && sale.waiterId !== req.user!.id) throw new AppError('Forbidden', 403);

    const products = await Promise.all(items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })));
    for (const item of items) {
      const p = products.find((x) => x?.id === item.productId);
      if (!p || p.status !== 'ACTIVE') throw new AppError('Product unavailable', 400);
    }
    const business = await prisma.business.findFirst({ select: { taxRate: true } });
    const newLines = buildSaleLines(items, products, business?.taxRate || 0);

    // Recalculate from every line already stored plus the newly appended ones.
    const allLines = [...sale.items.map((i) => ({ subtotal: i.subtotal, discount: i.discount, tax: i.tax })), ...newLines];
    const subtotal = roundToTwoDecimals(allLines.reduce((sum, i) => sum + i.subtotal, 0));
    const discount = roundToTwoDecimals(allLines.reduce((sum, i) => sum + i.discount, 0));
    const tax = roundToTwoDecimals(allLines.reduce((sum, i) => sum + i.tax, 0));
    const total = calculateTotal(subtotal, discount, tax);
    const noteInput = typeof req.body.customerNote === 'string' ? req.body.customerNote.trim().slice(0, 120) : '';
    const alreadyPaid = paidSoFar(sale);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.saleItem.createMany({ data: newLines.map((line) => ({ saleId: sale.id, ...line })) });
      const saved = await tx.sale.update({
        where: { id: sale.id },
        data: {
          subtotal, discount, tax, total,
          // The existing note is preserved unless a new note is supplied.
          ...(noteInput ? { customerNote: noteInput } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'APPEND_SALE_ITEMS',
          entity: 'sale',
          entityId: sale.id,
          details: { receiptNumber: sale.receiptNumber, addedLines: newLines.length, total, amountPaid: alreadyPaid, remaining: roundToTwoDecimals(Math.max(total - alreadyPaid, 0)) },
        },
      });
      return saved;
    });
    const fresh = await prisma.sale.findUnique({ where: { id: updated.id }, include: saleListInclude });
    res.json({ success: true, data: withPaymentSummary(fresh!), message: 'Products added to the open transaction' });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/payment - Record an ADDITIONAL (possibly partial) payment.
// Payments accumulate: the amount already paid is never reset to zero. The
// transaction only becomes PAID once amountPaid reaches the total.
router.post('/:id/payment', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true, payments: true } });
    if (!sale) throw new AppError('Not found', 404);
    if (!canViewAllTransactions(req.user?.role) && sale.cashierId !== req.user!.id && sale.waiterId !== req.user!.id) throw new AppError('Forbidden', 403);
    if (sale.status === 'COMPLETED') throw new AppError('This transaction is already fully paid', 400);
    if (sale.status !== 'PENDING') throw new AppError('Cannot take a payment for this transaction', 400);

    const method = (typeof req.body.paymentMethod === 'string' && req.body.paymentMethod) || sale.paymentMethod || 'CASH';
    const previouslyPaid = paidSoFar(sale);
    const outstanding = roundToTwoDecimals(Math.max(roundToTwoDecimals(sale.total) - previouslyPaid, 0));
    const rawAmount = req.body.amount;
    const requested = rawAmount === undefined || rawAmount === null || rawAmount === '' ? outstanding : Number(rawAmount);
    if (!Number.isFinite(requested) || requested <= 0) throw new AppError('Enter a payment amount greater than 0', 400);
    const amount = roundToTwoDecimals(requested);
    if (amount - outstanding > 0.001) throw new AppError(`Payment exceeds the remaining balance of ${outstanding.toFixed(2)}`, 400);
    const totalPaid = roundToTwoDecimals(previouslyPaid + amount);
    const fullyPaid = totalPaid >= roundToTwoDecimals(sale.total);
    const now = new Date();

    if (fullyPaid) {
      // Stock is only deducted from inventory once the transaction is fully paid.
      const products = await Promise.all(sale.items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })));
      for (const item of sale.items) {
        const p = products.find((x) => x?.id === item.productId);
        if (!p || p.status !== 'ACTIVE') throw new AppError('Product unavailable', 400);
        if (p.stockQuantity < item.quantity) throw new AppError('Insufficient stock', 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { saleId: sale.id, method, amount } });
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          amountReceived: totalPaid,
          change: roundToTwoDecimals(Math.max(totalPaid - sale.total, 0)),
          paymentMethod: method,
          ...(fullyPaid ? { status: 'COMPLETED', completedAt: now } : {}),
        },
      });
      if (fullyPaid) {
        for (const item of sale.items) {
          const product = await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
          await tx.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'SALE', quantity: -item.quantity, previousStock: product.stockQuantity + item.quantity, newStock: product.stockQuantity, referenceId: sale.id, notes: `Sale ${sale.receiptNumber}` } });
        }
        if (sale.customerId) await tx.customer.update({ where: { id: sale.customerId }, data: { totalSpent: { increment: sale.total }, lastPurchase: now } });
      }
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: fullyPaid ? 'MARK_PAID' : 'PARTIAL_PAYMENT',
          entity: 'sale',
          entityId: sale.id,
          details: { receiptNumber: sale.receiptNumber, amount, totalPaid, remaining: roundToTwoDecimals(Math.max(roundToTwoDecimals(sale.total) - totalPaid, 0)), paymentMethod: method },
        },
      });
    });

    const fresh = await prisma.sale.findUnique({ where: { id: sale.id }, include: saleListInclude });
    res.json({ success: true, data: withPaymentSummary(fresh!), message: fullyPaid ? 'Transaction fully paid' : 'Partial payment recorded' });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/void - Void a pending (open) transaction.
// Paid transactions are historical records and can only be VOIDED with manager
// approval; they are never deleted or rewritten by this route.
router.post('/:id/void', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!s) throw new AppError('Not found', 404);
    // Paid transactions are locked history: only ADMIN/MANAGER may void them,
    // and only through this explicit approval route.
    if (s.status === 'COMPLETED' && !['ADMIN', 'MANAGER'].includes(req.user!.role)) {
      throw new AppError('Paid transactions are locked. Ask a manager to void this order.', 403);
    }
    if (s.status !== 'PENDING' && s.status !== 'COMPLETED') throw new AppError('Cannot void', 400);
    if (!canViewAllTransactions(req.user?.role) && s.cashierId !== req.user!.id && s.waiterId !== req.user!.id) throw new AppError('Forbidden', 403);
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id: s.id }, data: { status: 'VOIDED', voidedAt: new Date() } });
      for (const item of s.items) {
        const product = await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        await tx.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'ADJUSTMENT', quantity: item.quantity, previousStock: product.stockQuantity - item.quantity, newStock: product.stockQuantity, referenceId: s.id, notes: `Void ${s.receiptNumber}` } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'VOID_SALE', entity: 'sale', entityId: s.id, details: { receiptNumber: s.receiptNumber, total: s.total } } });
    });
    res.json({ success: true, message: 'Voided' });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/refund - Refund a sale
router.post('/:id/refund', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { reason, amountRefunded, paymentMethod } = req.body;
    if (!reason) throw new AppError('Reason required', 400);
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!s || s.status !== 'COMPLETED') throw new AppError('Cannot refund', 400);
    if (!canViewAllTransactions(req.user?.role) && s.cashierId !== req.user!.id && s.waiterId !== req.user!.id) throw new AppError('Forbidden', 403);
    if (s.refundId) throw new AppError('Already refunded', 400);
    const refundAmount = amountRefunded || s.total;
    if (refundAmount > s.total) throw new AppError('Refund exceeds total', 400);
    const refund = await prisma.$transaction(async (tx) => {
      const createdRefund = await tx.refund.create({
        data: {
          originalSaleId: s.id, cashierId: req.user!.id, reason,
          subtotal: s.subtotal, discount: s.discount, tax: s.tax,
          total: refundAmount, paymentMethod: paymentMethod || s.paymentMethod,
          amountRefunded: refundAmount, status: 'COMPLETED', completedAt: new Date()
        }
      });
      await tx.sale.update({ where: { id: s.id }, data: { status: 'REFUNDED', refundedAt: new Date(), refundId: createdRefund.id } });
      await tx.refundItem.createMany({ data: s.items.map(i => ({ refundId: createdRefund.id, saleItemId: i.id, productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, tax: i.tax, total: i.total })) });
      await tx.payment.create({ data: { saleId: s.id, method: paymentMethod || s.paymentMethod, amount: refundAmount, reference: 'Refund' } });
      for (const item of s.items) {
        const product = await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        await tx.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'REFUND', quantity: item.quantity, previousStock: product.stockQuantity - item.quantity, newStock: product.stockQuantity, referenceId: s.id, notes: 'Refund' } });
      }
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'REFUND_SALE', entity: 'sale', entityId: s.id, details: { receiptNumber: s.receiptNumber, refundAmount, reason } } });
      return createdRefund;
    });
    res.json({ success: true, data: refund, message: 'Refunded' });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/sms-invoice - Send SMS invoice to customer
router.post('/:id/sms-invoice', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { phone } = req.body;
    const { sendInvoiceSms } = await import('../services/sms.js');
    const result = await sendInvoiceSms(req.params.id, phone || undefined);
    if (!result.success) throw new AppError(result.error || 'SMS send failed', 500);
    res.json({ success: true, data: { messageId: result.messageId }, message: 'SMS invoice sent' });
  } catch (err) { next(err); }
});

export { router as saleRouter };

