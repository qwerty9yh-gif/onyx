import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/sync/operations - Get sync operations
router.get('/operations', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { limit = '50', offset = '0', status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const l = parseInt(limit as string) || 50;
    const o = parseInt(offset as string) || 0;
    const [ops, total] = await Promise.all([
      prisma.syncOperation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: o, take: l, include: { user: { select: { id: true, firstName: true, lastName: true } } } }),
      prisma.syncOperation.count({ where })
    ]);
    res.json({ success: true, data: ops, total, limit: l, offset: o });
  } catch (err) { next(err); }
});

// PUT /api/sync/retry/:id - Retry a failed sync
router.put('/retry/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user!.role !== 'ADMIN') throw new AppError('Forbidden', 403);
    const op = await prisma.syncOperation.findUnique({ where: { id: req.params.id } });
    if (!op) throw new AppError('Not found', 404);
    await prisma.syncOperation.update({ where: { id: req.params.id }, data: { status: 'PENDING', retryCount: { increment: 1 }, updatedAt: new Date() } });
    res.json({ success: true, message: 'Retry queued' });
  } catch (err) { next(err); }
});

// DELETE /api/sync/:id - Delete a sync operation
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user!.role !== 'ADMIN') throw new AppError('Forbidden', 403);
    await prisma.syncOperation.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

// GET /api/sync/queue - Get sync queue count
router.get('/queue', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [pending, failed, processing] = await Promise.all([
      prisma.syncOperation.count({ where: { status: 'PENDING' } }),
      prisma.syncOperation.count({ where: { status: 'FAILED' } }),
      prisma.syncOperation.count({ where: { status: 'PROCESSING' } })
    ]);
    res.json({ success: true, data: { pending, failed, processing } });
  } catch (err) { next(err); }
});

// GET /api/sync/status - Sync status
router.get('/status', async (req: AuthenticatedRequest, res, next) => {
  try {
    const lastSync = await prisma.syncOperation.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, entity: true } });
    res.json({ success: true, data: { lastSync, online: true } });
  } catch (err) { next(err); }
});

export { router as syncRouter };
