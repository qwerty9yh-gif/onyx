import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/users.js';
import { productRouter } from './routes/products.js';
import { categoryRouter } from './routes/categories.js';
import { saleRouter } from './routes/sales.js';
import { inventoryRouter } from './routes/inventory.js';
import { customerRouter } from './routes/customers.js';
import { supplierRouter } from './routes/suppliers.js';
import { purchaseRouter } from './routes/purchases.js';
import { reportRouter } from './routes/reports.js';
import { analyticsRouter } from './routes/analytics.js';
import { syncRouter } from './routes/sync.js';
import { settingsRouter } from './routes/settings.js';
import { healthRouter } from './routes/health.js';
import { maintenanceRouter } from './routes/maintenance.js';
import { prisma } from './utils/prisma.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API Routes
app.get('/', (_req, res) => {
  res.json({ name: 'ONYX POS', status: 'ok', health: '/api/health' });
});
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);
app.use('/api/maintenance', maintenanceRouter);
// Protected routes
app.use('/api/users', authenticate, requireRole('ADMIN'), userRouter);
app.use('/api/products', authenticate, productRouter);
app.use('/api/categories', authenticate, requireRole('ADMIN', 'MANAGER', 'INVENTORY_STAFF'), categoryRouter);
app.use('/api/sales', authenticate, saleRouter);
app.use('/api/inventory', authenticate, inventoryRouter);
app.use('/api/customers', authenticate, requireRole('ADMIN', 'MANAGER', 'CASHIER'), customerRouter);
app.use('/api/suppliers', authenticate, supplierRouter);
app.use('/api/purchases', authenticate, requireRole('ADMIN', 'MANAGER', 'INVENTORY_STAFF'), purchaseRouter);
app.use('/api/reports', authenticate, requireRole('ADMIN'), reportRouter);
app.use('/api/analytics', authenticate, requireRole('ADMIN'), analyticsRouter);
app.use('/api/sync', authenticate, requireRole('ADMIN'), syncRouter);
app.use('/api/settings', authenticate, requireRole('ADMIN'), settingsRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Database connected');

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`✓ Server running on port ${config.port}`);
      console.log(`✓ Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
