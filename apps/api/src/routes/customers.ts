import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateLocalId } from '../utils/helpers.js';

const router = Router();

// GET /api/customers - List customers
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search as string, mode: 'insensitive' } },
        { email: { contains: req.query.search as string, mode: 'insensitive' } },
        { phone: { contains: req.query.search as string, mode: 'insensitive' } },
        { barcode: { contains: req.query.search as string, mode: 'insensitive' } },
      ];
    }
    if (req.query.status) where.status = req.query.status;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: { _count: { select: { purchases: true } } },
        orderBy: { totalSpent: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);
    res.json({ success: true, data: customers, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        purchases: {
          include: { sale: { include: { items: true, cashier: { select: { firstName: true, lastName: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!c) throw new AppError('Not found', 404);
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

// POST /api/customers - Create customer
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, email, phone, address, notes, barcode } = req.body;
    if (!name) throw new AppError('Name required', 400);
    if (email && await prisma.customer.findFirst({ where: { email } })) throw new AppError('Email exists', 409);
    if (barcode && await prisma.customer.findFirst({ where: { barcode } })) throw new AppError('Barcode exists', 409);
    const localId = generateLocalId();
    const c = await prisma.customer.create({
      data: { name, email, phone, address, notes, barcode, localId },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_CUSTOMER', entity: 'customer', entityId: c.id, details: { name: c.name } } });
    res.status(201).json({ success: true, data: c });
  } catch (err) { next(err); }
});

// PUT /api/customers/:id
router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const c = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError('Not found', 404);
    const { name, email, phone, address, notes, barcode, status } = req.body;
    if (email && email !== c.email && await prisma.customer.findFirst({ where: { email, id: { not: req.params.id } } })) throw new AppError('Email exists', 409);
    if (barcode && barcode !== c.barcode && await prisma.customer.findFirst({ where: { barcode, id: { not: req.params.id } } })) throw new AppError('Barcode exists', 409);
    const u = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...(barcode !== undefined && { barcode }),
        ...(status && { status }),
      },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_CUSTOMER', entity: 'customer', entityId: u.id, details: { customerId: u.id } } });
    res.json({ success: true, data: u });
  } catch (err) { next(err); }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const c = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError('Not found', 404);
    await prisma.customer.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'DELETE_CUSTOMER', entity: 'customer', entityId: req.params.id, details: { name: c.name } } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

// GET /api/customers/barcode/:barcode
router.get('/barcode/:barcode', async (req: AuthenticatedRequest, res, next) => {
  try {
    const c = await prisma.customer.findFirst({ where: { barcode: req.params.barcode } });
    if (!c) throw new AppError('Not found', 404);
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

export { router as customerRouter };
