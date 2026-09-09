import { Router } from 'express';
import { prisma } from '../utils/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', uptime: process.uptime() });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

export { router as healthRouter };
