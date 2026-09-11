import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

// ── Batch receiving schemas ──
const batchItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100000),
});

const createBatchSchema = z.object({
  supplierId: z.string().min(1).optional().nullable(),
  clientBatchId: z.string().min(1).max(120).optional().nullable(),
  items: z.array(batchItemSchema).min(1).max(500),
});

const batchInclude = {
  cashier: { select: { id: true, firstName: true, lastName: true, username: true } },
  supplier: { select: { id: true, name: true } },
  items: {
    orderBy: { createdAt: 'asc' } as const,
    include: { product: { select: { id: true, name: true, sku: true } } },
  },
};

async function nextBatchNumber(tx: {
  inventoryBatch: { findFirst: (args: { orderBy: { batchNumber: 'desc' } }) => Promise<{ batchNumber: string } | null> };
}): Promise<string> {
  const last = await tx.inventoryBatch.findFirst({ orderBy: { batchNumber: 'desc' } });
  let seq = 0;
  if (last?.batchNumber) {
    const m = last.batchNumber.match(/(\d+)\s*$/);
    if (m) seq = parseInt(m[1], 10) || 0;
  }
  return `IG-${String(seq + 1).padStart(6, '0')}`;
}

// POST /api/inventory/batches — commit one receiving session as one batch.
router.post('/batches', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const body = createBatchSchema.parse(req.body);
    if (body.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
      if (!supplier) throw new AppError('Supplier not found', 404);
    }
    const merged = new Map<string, number>();
    for (const item of body.items) merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity);
    const lines = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    const found = await prisma.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
    if (found.length !== lines.length) throw new AppError('One or more products were not found', 404);
    const byId = new Map(found.map((p) => [p.id, p]));
    if (body.clientBatchId) {
      const dupe = await prisma.inventoryBatch.findUnique({ where: { clientBatchId: body.clientBatchId }, include: batchInclude });
      if (dupe) { res.json({ success: true, data: dupe, message: 'Batch already synced', deduped: true }); return; }
    }
    let attempt = 0;
    for (;;) {
      try {
        const batch = await prisma.$transaction(async (tx) => {
          const batchNumber = await nextBatchNumber(tx);
          const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);
          const created = await tx.inventoryBatch.create({
            data: {
              batchNumber, cashierId: req.user!.id, supplierId: body.supplierId || null,
              totalProducts: lines.length, totalUnits,
              clientBatchId: body.clientBatchId || null, syncStatus: 'SYNCED',
            },
          });
          for (const line of lines) {
            const product = byId.get(line.productId)!;
            const before = product.stockQuantity || 0;
            const updated = await tx.product.update({ where: { id: line.productId }, data: { stockQuantity: { increment: line.quantity } } });
            await tx.inventoryBatchItem.create({ data: { batchId: created.id, productId: line.productId, quantity: line.quantity, stockBefore: before, stockAfter: updated.stockQuantity } });
            await tx.inventoryMovement.create({
              data: {
                productId: line.productId, userId: req.user!.id, type: 'STOCK_IN',
                quantity: line.quantity, unitPrice: product.costPrice || 0,
                previousStock: before, newStock: updated.stockQuantity,
                reason: 'Incoming goods batch', referenceId: created.id,
              },
            });
          }
          await tx.auditLog.create({ data: { userId: req.user!.id, action: 'COMMIT_INCOMING_BATCH', entity: 'inventory_batch', entityId: created.id, details: { batchNumber, totalProducts: lines.length, totalUnits } } });
          return tx.inventoryBatch.findUniqueOrThrow({ where: { id: created.id }, include: batchInclude });
        });
        res.status(201).json({ success: true, data: batch, message: 'Batch committed to inventory' });
        return;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'P2002' || attempt >= 4) throw err;
        attempt += 1;
        if (body.clientBatchId) {
          const dupe = await prisma.inventoryBatch.findUnique({ where: { clientBatchId: body.clientBatchId }, include: batchInclude });
          if (dupe) { res.json({ success: true, data: dupe, message: 'Batch already synced', deduped: true }); return; }
        }
      }
    }
  } catch (err) { next(err); }
});

// GET /api/inventory/batches — one card per receiving session.
router.get('/batches', async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const where: Record<string, unknown> = {};
    if (req.query.search) {
      const s = req.query.search as string;
      where.OR = [
        { batchNumber: { contains: s, mode: 'insensitive' } },
        { cashier: { is: { firstName: { contains: s, mode: 'insensitive' } } } },
        { cashier: { is: { lastName: { contains: s, mode: 'insensitive' } } } },
      ];
    }
    const [batches, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        include: {
          cashier: { select: { id: true, firstName: true, lastName: true, username: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryBatch.count({ where }),
    ]);
    res.json({ success: true, data: batches, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/inventory/batches/:id — full batch detail with lines.
router.get('/batches/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: req.params.id }, include: batchInclude });
    if (!batch) throw new AppError('Batch not found', 404);
    res.json({ success: true, data: batch });
  } catch (err) { next(err); }
});

// POST /api/inventory/adjust - Adjust stock
router.post('/adjust', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { productId, quantity, reason, notes } = req.body;
    if (!productId || quantity === undefined) throw new AppError('Product ID and quantity required', 400);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);
    const newStock = Math.max(0, (product.stockQuantity || 0) + quantity);
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { stockQuantity: newStock } }),
      prisma.inventoryMovement.create({
        data: {
          productId, userId: req.user!.id, type: 'ADJUSTMENT',
          quantity, previousStock: product.stockQuantity || 0, newStock,
          reason: reason || 'Manual adjustment', notes, referenceId: null
        }
      })
    ]);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'ADJUST_STOCK', entity: 'inventory', entityId: productId, details: { productId, quantity, newStock, reason } } });
    res.json({ success: true, data: { productId, previousStock: product.stockQuantity, newStock, quantity }, message: 'Stock adjusted' });
  } catch (err) { next(err); }
});

// POST /api/inventory/stock-in - Stock in
router.post('/stock-in', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { productId, quantity, unitPrice, supplierId, purchaseOrder, notes } = req.body;
    if (!productId || !quantity || quantity <= 0) throw new AppError('Valid product and quantity required', 400);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);
    const newStock = (product.stockQuantity || 0) + quantity;
    const unitPriceFinal = unitPrice || product.costPrice || 0;
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { stockQuantity: newStock, costPrice: unitPriceFinal } }),
      prisma.inventoryMovement.create({
        data: {
          productId, userId: req.user!.id, type: 'STOCK_IN',
          quantity, unitPrice: unitPriceFinal, previousStock: product.stockQuantity || 0, newStock,
          reason: 'Stock in', notes, referenceId: purchaseOrder || null
        }
      })
    ]);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'STOCK_IN', entity: 'inventory', entityId: productId, details: { productId, quantity, newStock, unitPrice: unitPriceFinal, supplierId, purchaseOrder } } });
    res.json({ success: true, data: { productId, previousStock: product.stockQuantity, newStock, quantity, unitPrice: unitPriceFinal }, message: 'Stock added' });
  } catch (err) { next(err); }
});

// POST /api/inventory/receive - Record a simple incoming-goods receipt.
router.post('/receive', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { supplierId, productId, quantity } = req.body;
    const parsedQuantity = Number(quantity);
    if (!supplierId || !productId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      throw new AppError('Supplier, product, and a positive quantity are required', 400);
    }
    const [supplier, product] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: supplierId } }),
      prisma.product.findUnique({ where: { id: productId } }),
    ]);
    if (!supplier) throw new AppError('Supplier not found', 404);
    if (!product) throw new AppError('Product not found', 404);
    const now = new Date();
    const orderNumber = `IN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          supplierId,
          status: 'RECEIVED',
          subtotal: product.costPrice * parsedQuantity,
          total: product.costPrice * parsedQuantity,
          orderNumber,
          localId: generateLocalId(),
          items: { create: [{ productId, quantity: parsedQuantity, unitPrice: product.costPrice, subtotal: product.costPrice * parsedQuantity, total: product.costPrice * parsedQuantity }] },
        },
      });
      const updatedProduct = await tx.product.update({ where: { id: productId }, data: { stockQuantity: { increment: parsedQuantity } } });
      await tx.inventoryMovement.create({
        data: { productId, userId: req.user!.id, type: 'STOCK_IN', quantity: parsedQuantity, unitPrice: product.costPrice, previousStock: product.stockQuantity, newStock: updatedProduct.stockQuantity, reason: 'Incoming goods', referenceId: purchase.id },
      });
      await tx.auditLog.create({ data: { userId: req.user!.id, action: 'RECEIVE_INCOMING_GOODS', entity: 'purchase', entityId: purchase.id, details: { supplierId, productId, quantity: parsedQuantity } } });
      return { purchase, product: updatedProduct };
    });
    res.status(201).json({ success: true, data: result, message: 'Incoming goods saved' });
  } catch (err) { next(err); }
});

// POST /api/inventory/stock-out - Stock out
router.post('/stock-out', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { productId, quantity, reason, notes } = req.body;
    if (!productId || !quantity || quantity <= 0) throw new AppError('Valid product and quantity required', 400);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);
    if ((product.stockQuantity || 0) < quantity) throw new AppError('Insufficient stock', 400);
    const newStock = (product.stockQuantity || 0) - quantity;
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { stockQuantity: newStock } }),
      prisma.inventoryMovement.create({
        data: { productId, userId: req.user!.id, type: 'STOCK_OUT', quantity, previousStock: product.stockQuantity || 0, newStock, reason: reason || 'Stock out', notes, referenceId: null }
      })
    ]);
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'STOCK_OUT', entity: 'inventory', entityId: productId, details: { productId, quantity, newStock, reason } } });
    res.json({ success: true, data: { productId, previousStock: product.stockQuantity, newStock, quantity }, message: 'Stock removed' });
  } catch (err) { next(err); }
});


// Stock history
router.get('/movements', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { productId, type, page = '1', limit = '50' } = req.query;
    const where: Record<string, unknown> = {};
    if (productId) where.productId = productId;
    if (type) where.type = type;
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 50;
    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'desc' }, skip: (p - 1) * l, take: l
      }),
      prisma.inventoryMovement.count({ where })
    ]);
    res.json({ success: true, data: movements, total, page: p, pageSize: l, totalPages: Math.ceil(total / l) });
  } catch (err) { next(err); }
});

// Low stock
router.get('/low-stock', async (req: AuthenticatedRequest, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE', stockQuantity: { lt: 10, gt: 0 } },
      select: { id: true, name: true, sku: true, barcode: true, stockQuantity: true, minimumStock: true, sellingPrice: true, image: true }
    });
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

// Out of stock
router.get('/out-of-stock', async (req: AuthenticatedRequest, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE', stockQuantity: 0 },
      select: { id: true, name: true, sku: true, barcode: true, stockQuantity: true, minimumStock: true, sellingPrice: true, image: true }
    });
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

export { router as inventoryRouter };
