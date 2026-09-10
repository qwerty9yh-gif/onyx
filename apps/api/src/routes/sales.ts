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

// POST /api/sales - Create a new sale
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { customerId, paymentMethod, amountReceived, notes, markPaid = true } = req.body;
    const items = (req.body.items || []) as SaleItemInput[];
    if (!items.length) throw new AppError('Items required', 400);
    if (!paymentMethod) throw new AppError('Payment method required', 400);
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
    const itemsSnap = items.map((item) => {
      const p = products.find((x) => x?.id === item.productId)!;
      const sp = item.quantity * p.sellingPrice;
      const d = item.discountType === 'percentage' ? roundToTwoDecimals(sp * (item.discount / 100)) : Math.min(item.discount, sp);
      const t = roundToTwoDecimals((sp - d) * (p.taxRate || taxRate));
      return { productId: p.id, name: p.name, sku: p.sku, quantity: item.quantity, unitPrice: p.sellingPrice, discount: d, tax: t, subtotal: roundToTwoDecimals(sp), total: roundToTwoDecimals(sp - d + t) };
    });
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
          receiptNumber, cashierId: req.user!.id, customerId, status: markPaid ? 'COMPLETED' : 'PENDING',
          syncStatus: 'PENDING', subtotal: rawSubtotal, discount: totalDiscount, discountType: 'percentage',
          tax: totalTax, total: grandTotal, paymentMethod, amountReceived: received, change, notes,
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
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { paymentMethod, amountReceived } = req.body;
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true, customer: true } });
    if (!s) throw new AppError('Not found', 404);
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER' && s.cashierId !== req.user!.id) throw new AppError('Forbidden', 403);
    if (s.status === 'COMPLETED') return res.json({ success: true, data: s, message: 'Already paid' });
    if (s.status !== 'PENDING') throw new AppError('Cannot mark paid', 400);
    const received = Number(amountReceived || s.total);
    if (received < s.total) throw new AppError('Insufficient payment', 400);
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
      await tx.payment.create({ data: { saleId: s.id, method: paymentMethod || s.paymentMethod, amount: received } });
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
    if (req.query.status) where.status = req.query.status;
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') where.cashierId = req.user!.id;
    if ((req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER') && req.query.cashierId) where.cashierId = req.query.cashierId;
    if (req.query.search) {
      const s = req.query.search as string;
      where.OR = [
        { receiptNumber: { contains: s, mode: 'insensitive' } },
        { cashier: { is: { firstName: { contains: s, mode: 'insensitive' } } } },
        { cashier: { is: { lastName: { contains: s, mode: 'insensitive' } } } },
        { customer: { is: { name: { contains: s, mode: 'insensitive' } } } },
      ];
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where, include: {
          cashier: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, name: true } },
          items: true, payments: true
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit
      }),
      prisma.sale.count({ where })
    ]);
    res.json({ success: true, data: sales, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/sales/:id - Get sale by ID
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const where: { id: string; cashierId?: string } = { id: req.params.id };
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') where.cashierId = req.user!.id;
    const s = await prisma.sale.findFirst({
      where,
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        items: { include: { product: { select: { id: true, name: true, image: true } } } },
        payments: true, refund: true
      }
    });
    if (!s) throw new AppError('Not found', 404);
    res.json({ success: true, data: s });
  } catch (err) { next(err); }
});

// POST /api/sales/:id/void - Void a sale
router.post('/:id/void', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!s || s.status !== 'COMPLETED') throw new AppError('Cannot void', 400);
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role) && s.cashierId !== req.user!.id) throw new AppError('Forbidden', 403);
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
    if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { reason, amountRefunded, paymentMethod } = req.body;
    if (!reason) throw new AppError('Reason required', 400);
    const s = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!s || s.status !== 'COMPLETED') throw new AppError('Cannot refund', 400);
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role) && s.cashierId !== req.user!.id) throw new AppError('Forbidden', 403);
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

export { router as saleRouter };

