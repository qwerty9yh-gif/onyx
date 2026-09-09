import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword, verifyPassword, signToken, generateDeviceId } from '../utils/helpers.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

const loginSchema = z.object({ email: z.string().email('Invalid email'), password: z.string().min(1, 'Password required') });
const cardLoginSchema = z.object({ userId: z.string().min(1, 'User required'), password: z.string().min(1, 'Password required') });
const registerSchema = z.object({ email: z.string().email('Invalid email'), username: z.string().min(3), password: z.string().min(8), firstName: z.string().min(1), lastName: z.string().min(1), role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF']).default('CASHIER'), phone: z.string().optional() });

// GET /api/auth/users - Public list of active users for the card login screen
router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true, email: true, username: true, firstName: true, lastName: true, role: true, status: true, avatar: true, lastLogin: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// POST /api/auth/card-login - Log in with a user card + password
router.post('/card-login', async (req, res, next) => {
  try {
    const { userId, password } = cardLoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new AppError('Invalid credentials', 401);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const token = signToken({ userId: user.id, email: user.email, role: user.role }, '7d');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.session.create({ data: { userId: user.id, token, expiresAt, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    const deviceId = req.headers['x-device-id'] as string || generateDeviceId();
    const device = await prisma.device.upsert({ where: { deviceId }, update: { name: req.headers['x-device-name'] as string || 'ONYX POS System', lastSeen: new Date(), onlineStatus: true }, create: { deviceId, name: req.headers['x-device-name'] as string || 'ONYX POS System', userId: user.id, onlineStatus: true } });
    const deviceToken = signToken({ deviceId, type: 'device' }, '30d');
    await prisma.session.create({ data: { userId: user.id, token: deviceToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), deviceId: device.id, ipAddress: req.ip, userAgent: 'Device' } });
    await prisma.auditLog.create({ data: { userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    res.json({ success: true, data: { user: { id: user.id, email: user.email, username: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status }, token, deviceToken, deviceId: device.id, expiresAt } });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') throw new AppError('Invalid credentials', 401);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const token = signToken({ userId: user.id, email: user.email, role: user.role }, '7d');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({ data: { userId: user.id, token, expiresAt, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    let deviceId = req.headers['x-device-id'] as string || generateDeviceId();
    const device = await prisma.device.upsert({ where: { deviceId }, update: { name: req.headers['x-device-name'] as string || 'ONYX POS System', lastSeen: new Date(), onlineStatus: true }, create: { deviceId, name: req.headers['x-device-name'] as string || 'ONYX POS System', userId: user.id, onlineStatus: true } });
    const deviceToken = signToken({ deviceId, type: 'device' }, '30d');
    await prisma.session.create({ data: { userId: user.id, token: deviceToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), deviceId: device.id, ipAddress: req.ip, userAgent: 'Device' } });
    await prisma.auditLog.create({ data: { userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    res.json({ success: true, data: { user: { id: user.id, email: user.email, username: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status }, token, deviceToken, deviceId: device.id, expiresAt } });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, username: true, firstName: true, lastName: true, role: true, status: true, phone: true, avatar: true, lastLogin: true, createdAt: true } });
    if (!u) throw new AppError('Not found', 404);
    res.json({ success: true, data: u });
  } catch (err) { next(err); }
});

router.post('/logout', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tok = req.headers.authorization?.split(' ')[1];
    if (tok) await prisma.session.deleteMany({ where: { token: tok, userId: req.user!.id } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'LOGOUT', entity: 'user', entityId: req.user!.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    res.json({ success: true, message: 'Logged out' });
  } catch (err) { next(err); }
});

router.post('/refresh', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const old = req.headers.authorization?.split(' ')[1];
    if (!old) throw new AppError('No token', 400);
    await prisma.session.deleteMany({ where: { token: old, userId: req.user!.id } });
    const token = signToken({ userId: req.user!.id, email: req.user!.email, role: req.user!.role }, '7d');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({ data: { userId: req.user!.id, token, expiresAt, ipAddress: req.ip, userAgent: req.headers['user-agent'] || null } });
    res.json({ success: true, data: { token, expiresAt } });
  } catch (err) { next(err); }
});

router.post('/change-password', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Both passwords required', 400);
    if (newPassword.length < 8) throw new AppError('New password must be 8+ chars', 400);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError('Not found', 404);
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new AppError('Current password incorrect', 401);
    const hash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash: hash } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'CHANGE_PASSWORD', entity: 'user', entityId: req.user!.id, ipAddress: req.ip } });
    res.json({ success: true, message: 'Password changed' });
  } catch (err) { next(err); }
});

export { router as authRouter };
