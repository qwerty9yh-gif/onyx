import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { z } from 'zod';

const router = Router();

const createSchema = z.object({ name: z.string().min(1), description: z.string().optional(), image: z.string().optional(), parentId: z.string().uuid().optional() });
const updateSchema = createSchema.partial();

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cats = await prisma.category.findMany({ where: { deletedAt: null }, include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const c = await prisma.category.findUnique({ where: { id: req.params.id }, include: { parent: { select: { id: true, name: true } }, children: { select: { id: true, name: true } } } });
    if (!c) throw new AppError('Not found', 404);
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = createSchema.parse(req.body);
    if (d.parentId) { const p = await prisma.category.findUnique({ where: { id: d.parentId } }); if (!p) throw new AppError('Parent not found', 404); }
    const c = await prisma.category.create({ data: { name: d.name, description: d.description, image: d.image, parentId: d.parentId || null } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_CATEGORY', entity: 'category', entityId: c.id, details: { name: c.name } } });
    res.status(201).json({ success: true, data: c });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = updateSchema.parse(req.body);
    const e = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!e) throw new AppError('Not found', 404);
    const c = await prisma.category.update({ where: { id: req.params.id }, data: d });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_CATEGORY', entity: 'category', entityId: c.id, details: { name: c.name } } });
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const c = await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'DELETE_CATEGORY', entity: 'category', entityId: c.id, details: { name: c.name } } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

export { router as categoryRouter };
