import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { hashPassword } from '../utils/helpers.js';
import { z } from 'zod';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER', 'INVENTORY_STAFF']).default('CASHIER'),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'INVITED']).default('ACTIVE'),
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const { search, role, status, page = '1', limit = '50' } = req.query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;
    const p = parseInt(page as string) || 1;
    const l = parseInt(limit as string) || 50;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, username: true, firstName: true, lastName: true, role: true, status: true, mustChangePassword: true, phone: true, lastLogin: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: users, total, page: p, pageSize: l, totalPages: Math.ceil(total / l) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const u = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        phone: true,
        lastLogin: true,
        createdAt: true,
        _count: { select: { sessions: true, devices: true } },
      },
    });
    if (!u) throw new AppError('Not found', 404);
    res.json({ success: true, data: u });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user!.role !== 'ADMIN') throw new AppError('Admin only', 403);
    const d = createUserSchema.parse(req.body);
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: d.email }, { username: d.username }] } });
    if (existing) throw new AppError('Email or username exists', 409);
    const hash = await hashPassword(d.password);
    const u = await prisma.user.create({ data: { email: d.email, username: d.username, passwordHash: hash, firstName: d.firstName, lastName: d.lastName, role: d.role, status: d.status, phone: d.phone } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CREATE_USER', entity: 'user', entityId: u.id, details: { email: u.email, role: u.role } } });
    res.status(201).json({ success: true, data: { id: u.id, email: u.email, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role, status: u.status, createdAt: u.createdAt } });
  } catch (err) { next(err); }
});

router.put('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) throw new AppError('Forbidden', 403);
    const d = createUserSchema.partial().parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Not found', 404);
    if (d.email && d.email !== existing.email && await prisma.user.findUnique({ where: { email: d.email } })) throw new AppError('Email exists', 409);
    if (d.username && d.username !== existing.username && await prisma.user.findUnique({ where: { username: d.username } })) throw new AppError('Username exists', 409);
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(d.email && { email: d.email }),
        ...(d.username && { username: d.username }),
        ...(d.firstName && { firstName: d.firstName }),
        ...(d.lastName && { lastName: d.lastName }),
        ...(d.role && { role: d.role }),
        ...(d.status && { status: d.status }),
        ...(d.phone !== undefined && { phone: d.phone }),
      },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'UPDATE_USER', entity: 'user', entityId: u.id, details: { changes: d } } });
    res.json({ success: true, data: { id: u.id, email: u.email, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role, status: u.status, phone: u.phone, updatedAt: u.updatedAt } });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user!.role !== 'ADMIN') throw new AppError('Admin only', 403);
    if (req.params.id === req.user!.id) throw new AppError('Cannot disable yourself', 400);
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) throw new AppError('Not found', 404);
    await prisma.user.update({ where: { id: req.params.id }, data: { status: 'DISABLED' } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'DISABLE_USER', entity: 'user', entityId: req.params.id, details: { email: u.email } } });
    res.json({ success: true, message: 'User disabled' });
  } catch (err) { next(err); }
});

export { router as userRouter };
