import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/analytics/dashboard - Dashboard stats
router.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [todaySales, weekSales, monthSales, todayRevenue, weekRevenue, monthRevenue, totalTransactions, avgTransaction, lowStock, outOfStock, pendingInvoices, topProducts, topCategories, recentActivity] = await Promise.all([
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfDay } } }),
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfWeek } } }),
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfDay } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfWeek } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
      prisma.sale.count({ where: { status: 'COMPLETED' } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED' }, _avg: { total: true } }),
      prisma.product.count({ where: { status: 'ACTIVE', stockQuantity: { lt: 10, gt: 0 } } }),
      prisma.product.count({ where: { status: 'ACTIVE', stockQuantity: 0 } }),
      prisma.sale.count({ where: { status: 'PENDING' } }),
      prisma.saleItem.groupBy({ by: ['productId'], _sum: { quantity: true, total: true }, orderBy: { _sum: { total: 'desc' } }, take: 10, where: { sale: { status: 'COMPLETED' } } }),
      prisma.saleItem.groupBy({ by: ['productId'], _count: true, orderBy: { _count: { productId: 'desc' } }, take: 10 }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { firstName: true, lastName: true } } } })
    ]);
    const topProductsData = await Promise.all(topProducts.map(async (item) => {
      const p = await prisma.product.findUnique({ where: { id: item.productId }, select: { id: true, name: true, image: true, sku: true } });
      return { ...p!, quantity: item._sum.quantity, total: item._sum.total };
    }));
    res.json({ success: true, data: {
      today: { sales: todaySales, revenue: todayRevenue._sum.total || 0 },
      week: { sales: weekSales, revenue: weekRevenue._sum.total || 0 },
      month: { sales: monthSales, revenue: monthRevenue._sum.total || 0 },
      totalTransactions,
      avgTransaction: avgTransaction._avg.total || 0,
      lowStock,
      outOfStock,
      pendingInvoices,
      topProducts: topProductsData,
      topCategories: topCategories.slice(0, 5),
      recentActivity
    } });
  } catch (err) { next(err); }
});

// GET /api/analytics/sales-summary - Sales summary by period
router.get('/sales-summary', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);
    const where: Prisma.SaleWhereInput = { status: 'COMPLETED', createdAt: { gte: start, lte: end } };
    const [sales, revenue, transactions, avg, byPayment] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true } }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _avg: { total: true } }),
      prisma.payment.groupBy({ by: ['method'], _sum: { amount: true }, where: { sale: { status: 'COMPLETED', createdAt: { gte: start, lte: end } } }, orderBy: { _sum: { amount: 'desc' } } })
    ]);
    res.json({ success: true, data: { sales, revenue: revenue._sum?.total || 0, transactions, avg: avg._avg?.total || 0, byPayment } });
  } catch (err) { next(err); }
});

// GET /api/analytics/inventory-summary - Inventory summary
router.get('/inventory-summary', async (req: AuthenticatedRequest, res, next) => {
  try {
    const [totalProducts, activeProducts, lowStock, outOfStock, totalStockValue, totalCostValue] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({ where: { status: 'ACTIVE', stockQuantity: { lt: 10, gt: 0 } } }),
      prisma.product.count({ where: { status: 'ACTIVE', stockQuantity: 0 } }),
      prisma.product.aggregate({ where: { status: 'ACTIVE' }, _sum: { stockQuantity: true } }),
      prisma.product.aggregate({ where: { status: 'ACTIVE' }, _sum: { costPrice: true } })
    ]);
    res.json({ success: true, data: { totalProducts, activeProducts, lowStock, outOfStock, totalStockValue: totalStockValue._sum.stockQuantity || 0, totalCostValue: totalCostValue._sum.costPrice || 0 } });
  } catch (err) { next(err); }
});

// GET /api/analytics/sales-trend - Daily completed-sale totals for charts.
router.get('/sales-trend', async (req: AuthenticatedRequest, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 2), 31);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const sales = await prisma.sale.findMany({ where: { status: 'COMPLETED', createdAt: { gte: start } }, select: { createdAt: true, total: true } });
    const trend = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      const matching = sales.filter((sale) => sale.createdAt.toISOString().slice(0, 10) === key);
      return { date: key, sales: matching.length, revenue: matching.reduce((sum, sale) => sum + sale.total, 0) };
    });
    res.json({ success: true, data: trend });
  } catch (err) { next(err); }
});

export { router as analyticsRouter };
