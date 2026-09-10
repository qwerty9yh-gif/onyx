import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/settings - Get all settings
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') throw new AppError('Forbidden', 403);
    const [business, settings] = await Promise.all([
      prisma.business.findFirst({ select: { id: true, name: true, phone: true, email: true, address: true, taxRate: true, currency: true, receiptPrefix: true, logo: true } }),
      prisma.settings.findFirst()
    ]);
    const receiptSettings = settings?.receiptSettings ? JSON.parse(settings.receiptSettings) : null;
    res.json({ success: true, data: { business, receiptSettings, taxRate: settings?.taxRate, currency: settings?.currency || 'GHS' } });
  } catch (err) { next(err); }
});

// PUT /api/settings - Update all settings
router.put('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') throw new AppError('Forbidden', 403);
    const { business, receiptSettings, taxRate, currency, defaultStore } = req.body;
    const existing = await prisma.business.findFirst();
    const bizId = existing?.id || 'default';
    await Promise.all([
      prisma.business.upsert({
        where: { id: bizId },
        update: {
          ...(business?.name && { name: business.name }),
          ...(business?.phone && { phone: business.phone }),
          ...(business?.email && { email: business.email }),
          ...(business?.address && { address: business.address }),
          ...(business?.taxRate !== undefined && { taxRate: business.taxRate }),
          ...(business?.currency && { currency: business.currency }),
          ...(business?.receiptPrefix && { receiptPrefix: business.receiptPrefix }),
          ...(business?.logo !== undefined && { logo: business.logo }),
        },
        create: {
          id: 'default',
          name: business?.name || 'Business',
          phone: business?.phone || '',
          email: business?.email || '',
          address: business?.address || '',
          taxRate: business?.taxRate || 0,
          currency: business?.currency || 'GHS',
          receiptPrefix: business?.receiptPrefix || 'REC',
          logo: business?.logo || null,
        }
      }),
      prisma.settings.upsert({
        where: { id: 'default' },
        update: {
          ...(receiptSettings !== undefined && { receiptSettings: JSON.stringify(receiptSettings) }),
          ...(taxRate !== undefined && { taxRate }),
          ...(currency && { currency }),
          ...(defaultStore !== undefined && { defaultStore }),
        },
        create: {
          id: 'default',
          receiptSettings: receiptSettings ? JSON.stringify(receiptSettings) : JSON.stringify({ printer: 'default', footer: '', showBarcode: true }),
          taxRate: taxRate || 0,
          currency: currency || 'GHS',
          defaultStore: defaultStore || 'main',
        }
      }),
    ]);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

// GET /api/settings/sync-status - Get sync status
router.get('/sync-status', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [pending, failed, lastSync] = await Promise.all([
      prisma.syncOperation.count({ where: { status: 'PENDING' } }),
      prisma.syncOperation.count({ where: { status: 'FAILED' } }),
      prisma.syncOperation.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, entity: true } })
    ]);
    res.json({ success: true, data: { pending, failed, lastSync } });
  } catch (err) { next(err); }
});

// POST /api/settings/trigger-sync - Manually trigger sync
router.post('/trigger-sync', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') throw new AppError('Forbidden', 403);
    const pending = await prisma.syncOperation.findMany({ where: { status: 'PENDING' }, take: 100, orderBy: { createdAt: 'asc' } });
    const processed = await Promise.all(pending.map(async (op) => {
      try {
        if (op.entity !== 'sale' || !op.serverId || !(await prisma.sale.findUnique({ where: { id: op.serverId }, select: { id: true } }))) {
          throw new AppError('Sync operation cannot be reconciled', 409);
        }
        await prisma.syncOperation.update({ where: { id: op.id }, data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() } });
        return { id: op.id, status: 'completed' };
      } catch (error) {
        await prisma.syncOperation.update({ where: { id: op.id }, data: { status: 'FAILED', updatedAt: new Date() } });
        return { id: op.id, status: 'failed' };
      }
    }));
    res.json({ success: true, data: { processed: processed.length, results: processed } });
  } catch (err) { next(err); }
});

export { router as settingsRouter };
