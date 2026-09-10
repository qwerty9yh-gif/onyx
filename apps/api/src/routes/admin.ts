import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest } from '../types/index.js';
import { hashPassword } from '../utils/helpers.js';

const router = Router();

const resetPasswordSchema = z.object({
  restoreDefault: z.boolean().optional().default(false),
  temporaryPassword: z.string().min(8).max(128).optional(),
}).refine((value) => value.restoreDefault || Boolean(value.temporaryPassword), {
  message: 'Choose the default password or provide a temporary password',
});

router.get('/workers', async (_req: AuthenticatedRequest, res, next) => {
  try {
    const workers = await prisma.user.findMany({
      where: { role: { in: ['WORKER', 'WAITER', 'CASHIER'] } },
      select: { id: true, firstName: true, lastName: true, username: true, email: true, role: true, status: true, mustChangePassword: true, lastLogin: true, createdAt: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ success: true, data: workers });
  } catch (error) { next(error); }
});

router.post('/workers/:id/reset-password', async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const worker = await prisma.user.findFirst({ where: { id: req.params.id, role: { in: ['WORKER', 'WAITER', 'CASHIER'] } } });
    if (!worker) throw new AppError('Worker not found', 404);

    const defaultPassword = `123456789${worker.firstName.trim().charAt(0).toUpperCase()}`;
    const password = input.restoreDefault ? defaultPassword : input.temporaryPassword!;
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: worker.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, username: true, email: true, status: true, mustChangePassword: true },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'PASSWORD_RESET',
          entity: 'user',
          entityId: worker.id,
          details: {
            adminName: `${req.user!.firstName} ${req.user!.lastName}`,
            workerName: `${worker.firstName} ${worker.lastName}`,
            workerId: worker.id,
            resetAt: new Date().toISOString(),
            mode: input.restoreDefault ? 'DEFAULT' : 'CUSTOM',
          },
        },
      });
      return user;
    });

    res.json({ success: true, data: updated, message: 'Worker password reset. The worker must change it after login.' });
  } catch (error) { next(error); }
});

export { router as adminRouter };