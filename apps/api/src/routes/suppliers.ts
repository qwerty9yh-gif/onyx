import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

// GET /api/suppliers - List suppliers
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { search, isActive, page = '1', limit = '50' } = req.query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { contactInfo: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive === 'true';
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 50;
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: { _count: { select: { products: true, purchases: true } } },
        orderBy: { name: 'asc' },
        skip: (p - 1) * l,
        take: l,
      }),
      prisma.supplier.count({ where }),
    ]);
    res.json({ success: true, data: suppliers, total, page: p, pageSize: l, totalPages: Math.ceil(total / l) });
  } catch (err) { next(err); }
});

// GET /api/suppliers/:id
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const s = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: { products: { select: { id: true, name: true, sku: true, stockQuantity: true, sellingPrice: true } }, purchases: { orderBy: { createdAt: 'desc' }, take: 10, include: { items: true } } },
    });
    if (!s) throw new AppError('Not found', 404);
    res.json({ success: true, data: s });
  } catch (err) { next(err); }
});

// POST /api/suppliers - Create supplier
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { name, email, phone, contactInfo, address, notes, isActive = true } = req.body;
    if (!name) throw new AppError('Name required', 400);
    const localId = generateLocalId();
    const s = await prisma.supplier.create({ data: { name, email, phone, contactInfo, address, notes, isActive, localId } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_SUPPLIER', entity: 'supplier', entityId: s.id, details: { name: s.name } } });
    res.status(201).json({ success: true, data: s });
  } catch (err) { next(err); }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { name, email, phone, contactInfo, address, notes, isActive } = req.body;
    const s = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!s) throw new AppError('Not found', 404);
    const u = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(contactInfo !== undefined && { contactInfo }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_SUPPLIER', entity: 'supplier', entityId: u.id, details: { supplierId: u.id } } });
    res.json({ success: true, data: u });
  } catch (err) { next(err); }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const s = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!s) throw new AppError('Not found', 404);
    await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'DELETE_SUPPLIER', entity: 'supplier', entityId: req.params.id, details: { name: s.name } } });
    res.json({ success: true, message: 'Supplier deactivated' });
  } catch (err) { next(err); }
});

export { router as supplierRouter };
