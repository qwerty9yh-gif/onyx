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
    const [todaySales, weekSales, monthSales, todayRevenue, weekRevenue, monthRevenue, totalTransactions, avgTransaction, lowStock, topProducts, topCategories] = await Promise.all([
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfDay } } }),
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfWeek } } }),
      prisma.sale.count({ where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfDay } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfWeek } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
      prisma.sale.count({ where: { status: 'COMPLETED' } }),
      prisma.sale.aggregate({ where: { status: 'COMPLETED' }, _avg: { total: true } }),
      prisma.product.count({ where: { status: 'ACTIVE', stockQuantity: { lt: 10, gt: 0 } } }),
      prisma.saleItem.groupBy({ by: ['productId'], _sum: { quantity: true, total: true }, orderBy: { _sum: { total: 'desc' } }, take: 10, where: { sale: { status: 'COMPLETED' } } }),
      prisma.saleItem.groupBy({ by: ['productId'], _count: true, orderBy: { _count: { productId: 'desc' } }, take: 10 })
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
      topProducts: topProductsData,
      topCategories: topCategories.slice(0, 5)
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

export { router as analyticsRouter };
