import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});
const createSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  orderNumber: z.string().optional(),
  items: z.array(itemSchema).min(1),
});
const updateSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  status: z.enum(['PENDING','ORDERED','RECEIVED','PARTIAL','CANCELLED']).optional(),
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { supplierId, status, page = '1', limit = '50' } = req.query;
    const where: Record<string, unknown> = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    const p = parseInt(page as string) || 1;
    const l = Math.min(parseInt(limit as string) || 50, 200);
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, email: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      prisma.purchase.count({ where }),
    ]);
    res.json({ success: true, data: purchases, total, page: p, pageSize: l, totalPages: Math.ceil(total / l) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const pur = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: { include: { product: { select: { id: true, name: true, sku: true, image: true } } } },
      },
    });
    if (!pur) throw new AppError('Not found', 404);
    res.json({ success: true, data: pur });
  } catch (err) { next(err); }
});

// POST /api/purchases
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER','INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = createSchema.parse(req.body);
    if (d.supplierId) { const s = await prisma.supplier.findUnique({ where: { id: d.supplierId } }); if (!s) throw new AppError('Supplier not found', 404); }
    const products = await Promise.all(d.items.map((i) => prisma.product.findUnique({ where: { id: i.productId } })));
    for (const it of d.items) { if (!products.find((p) => p?.id === it.productId)) throw new AppError('Product not found: ' + it.productId, 404); }
    const subtotal = d.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const pur = await prisma.purchase.create({
      data: {
        supplierId: d.supplierId || null, notes: d.notes, orderNumber: d.orderNumber,
        status: 'PENDING', subtotal, tax: 0, total: subtotal, localId: generateLocalId(),
        items: { create: d.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.quantity * i.unitPrice, total: i.quantity * i.unitPrice })) },
      },
      include: { items: true, supplier: true },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_PURCHASE', entity: 'purchase', entityId: pur.id, details: { total: subtotal, itemCount: d.items.length } } });
    res.status(201).json({ success: true, data: pur });
  } catch (err) { next(err); }
});

// PUT /api/purchases/:id
router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER','INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = updateSchema.parse(req.body);
    const existing = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Not found', 404);
    if (existing.status === 'RECEIVED') throw new AppError('Cannot edit received purchase', 400);
    const pur = await prisma.purchase.update({ where: { id: req.params.id }, data: { ...(d.supplierId !== undefined && { supplierId: d.supplierId }), ...(d.notes !== undefined && { notes: d.notes }), ...(d.status && { status: d.status }) }, include: { items: true, supplier: true } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_PURCHASE', entity: 'purchase', entityId: pur.id, details: { changes: d } } });
    res.json({ success: true, data: pur });
  } catch (err) { next(err); }
});

// POST /api/purchases/:id/receive
router.post('/:id/receive', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER','INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const pur = await prisma.purchase.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!pur) throw new AppError('Not found', 404);
    if (pur.status === 'RECEIVED') throw new AppError('Already received', 400);
    if (pur.status === 'CANCELLED') throw new AppError('Cannot receive cancelled purchase', 400);
    for (const item of pur.items) {
      const prod = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!prod) continue;
      const newStock = (prod.stockQuantity || 0) + item.quantity;
      await prisma.$transaction([
        prisma.product.update({ where: { id: item.productId }, data: { stockQuantity: newStock } }),
        prisma.inventoryMovement.create({ data: { productId: item.productId, userId: req.user!.id, type: 'STOCK_IN', quantity: item.quantity, unitPrice: item.unitPrice, previousStock: prod.stockQuantity || 0, newStock, reason: 'Purchase received', referenceId: pur.id } }),
      ]);
    }
    const updated = await prisma.purchase.update({ where: { id: pur.id }, data: { status: 'RECEIVED' }, include: { items: true, supplier: true } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'RECEIVE_PURCHASE', entity: 'purchase', entityId: pur.id, details: { total: pur.total } } });
    res.json({ success: true, data: updated, message: 'Purchase received, stock updated' });
  } catch (err) { next(err); }
});

// DELETE /api/purchases/:id (cancel)
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const existing = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Not found', 404);
    if (existing.status === 'RECEIVED') throw new AppError('Cannot cancel received purchase', 400);
    await prisma.purchase.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CANCEL_PURCHASE', entity: 'purchase', entityId: req.params.id, details: {} } });
    res.json({ success: true, message: 'Purchase cancelled' });
  } catch (err) { next(err); }
});
export { router as purchaseRouter };
