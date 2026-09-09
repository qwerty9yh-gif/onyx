import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0),
  stockQuantity: z.number().int().min(0).default(0),
  minimumStock: z.number().int().min(0).default(0),
  taxRate: z.number().min(0).max(1).optional().nullable(),
  status: z.enum(['ACTIVE','INACTIVE','DISCONTINUED','OUT_OF_STOCK']).default('ACTIVE'),
});
const updateSchema = createSchema.partial();

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { search, categoryId, supplierId, status, lowStock, outOfStock } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const where: Record<string, unknown> = { deletedAt: null };
    if (search) {
      const s = search as string;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { sku: { contains: s, mode: 'insensitive' } },
        { barcode: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { localId: { contains: s, mode: 'insensitive' } },
        { category: { is: { name: { contains: s, mode: 'insensitive' } } } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (outOfStock === 'true') where.stockQuantity = 0;
    else if (lowStock === 'true') where.stockQuantity = { lt: 10, gt: 0 };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);
    res.json({ success: true, data: products, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const prod = await prisma.product.findFirst({
      where: { barcode: req.params.barcode, deletedAt: null },
      include: { category: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } },
    });
    if (!prod) throw new AppError('Not found', 404);
    res.json({ success: true, data: prod });
  } catch (err) { next(err); }
});

router.get('/sku/:sku', async (req, res, next) => {
  try {
    const prod = await prisma.product.findUnique({
      where: { sku: req.params.sku },
      include: { category: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true } } },
    });
    if (!prod || prod.deletedAt) throw new AppError('Not found', 404);
    res.json({ success: true, data: prod });
  } catch (err) { next(err); }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const prod = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true, email: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!prod || prod.deletedAt) throw new AppError('Not found', 404);
    res.json({ success: true, data: prod });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER','INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = createSchema.parse(req.body);
    if (await prisma.product.findUnique({ where: { sku: d.sku } })) throw new AppError('SKU exists', 409);
    if (d.barcode && await prisma.product.findFirst({ where: { barcode: d.barcode } })) throw new AppError('Barcode exists', 409);
    if (d.categoryId) { const c = await prisma.category.findUnique({ where: { id: d.categoryId } }); if (!c) throw new AppError('Category not found', 404); }
    if (d.supplierId) { const s = await prisma.supplier.findUnique({ where: { id: d.supplierId } }); if (!s) throw new AppError('Supplier not found', 404); }
    const prod = await prisma.product.create({ data: { ...d, categoryId: d.categoryId || null, supplierId: d.supplierId || null, localId: generateLocalId() } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_PRODUCT', entity: 'product', entityId: prod.id, details: { name: prod.name, sku: prod.sku } } });
    res.status(201).json({ success: true, data: prod });
  } catch (err) { next(err); }
});

// PUT /api/products/:id
router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER','INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = updateSchema.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) throw new AppError('Not found', 404);
    if (d.sku && d.sku !== existing.sku && await prisma.product.findUnique({ where: { sku: d.sku } })) throw new AppError('SKU exists', 409);
    if (d.barcode && d.barcode !== existing.barcode && await prisma.product.findFirst({ where: { barcode: d.barcode, id: { not: req.params.id } } })) throw new AppError('Barcode exists', 409);
    const prod = await prisma.product.update({ where: { id: req.params.id }, data: { ...d } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_PRODUCT', entity: 'product', entityId: prod.id, details: { changes: d } } });
    res.json({ success: true, data: prod });
  } catch (err) { next(err); }
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN','MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) throw new AppError('Not found', 404);
    await prisma.product.update({ where: { id: req.params.id }, data: { status: 'INACTIVE', deletedAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'DELETE_PRODUCT', entity: 'product', entityId: req.params.id, details: { name: existing.name, sku: existing.sku } } });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
});

export { router as productRouter };

