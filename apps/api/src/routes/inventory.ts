import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

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
