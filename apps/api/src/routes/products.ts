import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

// ── Payload normalization ────────────────────────────────────────────────────
// The product form submits every field. Optional <select>s submit "" when they
// are left untouched and empty <input type="number"> fields arrive as null
// (NaN does not survive JSON). The database treats these columns as optional /
// defaulted, so the API must normalize instead of rejecting them.

/** "" / null / undefined / NaN -> fallback, numeric strings -> number. */
function normalizeNumber(value: unknown, fallback: number): unknown {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isNaN(value) ? fallback : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    return Number(trimmed);
  }
  return value;
}

/** "" / null / undefined -> null, everything else passes through. */
function emptyToNull(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

const optionalId = z.preprocess(
  emptyToNull,
  z.string()
    .trim()
    .max(120, 'Must be 120 characters or fewer')
    .nullable()
    .optional(),
);

const optionalText = z.preprocess(
  emptyToNull,
  z.string().max(5000, 'Must be 5000 characters or fewer').nullable().optional(),
);

const optionalNumber = (fallback: number, integer = false) => {
  const base = z
    .number({ invalid_type_error: 'Must be a valid number' })
    .min(0, 'Must be 0 or more');
  return z.preprocess(
    (value) => normalizeNumber(value, fallback),
    integer ? base.int('Must be a whole number') : base,
  );
};

const optionalTaxRate = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : Number(trimmed);
    }
    return value;
  },
  z
    .number({ invalid_type_error: 'Must be a valid number' })
    .min(0, 'Must be 0 or more')
    .max(100, 'Must be 100 or less')
    .nullable(),
);

const statusSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK'], {
    errorMap: () => ({ message: 'Invalid product status' }),
  }).default('ACTIVE'),
);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
  sku: z.string().trim().min(1, 'SKU is required').max(120, 'SKU is too long'),
  barcode: z.preprocess(emptyToNull, z.string().trim().max(120, 'Barcode is too long').nullable().optional()),
  description: optionalText,
  image: optionalText,
  categoryId: optionalId,
  supplierId: optionalId,
  costPrice: optionalNumber(0),
  sellingPrice: optionalNumber(0),
  stockQuantity: optionalNumber(0, true),
  minimumStock: optionalNumber(0, true),
  taxRate: optionalTaxRate,
  status: statusSchema,
});
const updateSchema = createSchema.partial();

/** Normalize a validated payload so the values match the Prisma schema exactly. */
function normalizeBarcode(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}


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
    // Normalize empty barcode strings to NULL so multiple products without a
    // barcode never collide on the DB unique constraint.
    const barcode = normalizeBarcode(d.barcode);
    if (await prisma.product.findUnique({ where: { sku: d.sku } })) throw new AppError('SKU exists', 409);
    if (barcode && await prisma.product.findFirst({ where: { barcode } })) throw new AppError('Barcode exists', 409);
    if (d.categoryId) { const c = await prisma.category.findUnique({ where: { id: d.categoryId } }); if (!c) throw new AppError('Category not found', 404); }
    if (d.supplierId) { const s = await prisma.supplier.findUnique({ where: { id: d.supplierId } }); if (!s) throw new AppError('Supplier not found', 404); }
    const prod = await prisma.product.create({
      data: {
        name: d.name,
        sku: d.sku,
        barcode,
        description: d.description ?? null,
        image: d.image ?? null,
        categoryId: d.categoryId ?? null,
        supplierId: d.supplierId ?? null,
        costPrice: d.costPrice,
        sellingPrice: d.sellingPrice,
        stockQuantity: d.stockQuantity,
        minimumStock: d.minimumStock,
        taxRate: d.taxRate ?? null,
        status: d.status,
        localId: generateLocalId(),
      },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_PRODUCT', entity: 'product', entityId: prod.id, details: { name: prod.name, sku: prod.sku, barcode } } });
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
    // Normalize empty barcode strings to NULL; an empty string sent from the
    // form means "no barcode" and must not violate the unique constraint.
    const barcode = d.barcode === undefined ? (existing.barcode ?? null) : normalizeBarcode(d.barcode);
    if (d.sku && d.sku !== existing.sku && await prisma.product.findUnique({ where: { sku: d.sku } })) throw new AppError('SKU exists', 409);
    if (barcode && barcode !== existing.barcode && await prisma.product.findFirst({ where: { barcode, id: { not: req.params.id } } })) throw new AppError('Barcode exists', 409);
    // Validate the referenced rows before writing so validation failures return a
    // useful message instead of a raw foreign-key error.
    if (d.categoryId !== undefined && d.categoryId !== null && d.categoryId !== existing.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: d.categoryId } });
      if (!c) throw new AppError('Category not found', 404);
    }
    if (d.supplierId !== undefined && d.supplierId !== null && d.supplierId !== existing.supplierId) {
      const s = await prisma.supplier.findUnique({ where: { id: d.supplierId } });
      if (!s) throw new AppError('Supplier not found', 404);
    }
    const prod = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        barcode,
        ...(d.name !== undefined && { name: d.name }),
        ...(d.sku !== undefined && { sku: d.sku }),
        ...(d.description !== undefined && { description: d.description ?? null }),
        ...(d.image !== undefined && { image: d.image ?? null }),
        ...(d.categoryId !== undefined && { categoryId: d.categoryId ?? null }),
        ...(d.supplierId !== undefined && { supplierId: d.supplierId ?? null }),
        ...(d.costPrice !== undefined && { costPrice: d.costPrice }),
        ...(d.sellingPrice !== undefined && { sellingPrice: d.sellingPrice }),
        ...(d.stockQuantity !== undefined && { stockQuantity: d.stockQuantity }),
        ...(d.minimumStock !== undefined && { minimumStock: d.minimumStock }),
        ...(d.taxRate !== undefined && { taxRate: d.taxRate ?? null }),
        ...(d.status !== undefined && { status: d.status }),
      },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_PRODUCT', entity: 'product', entityId: prod.id, details: { changes: d, barcode } } });
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

