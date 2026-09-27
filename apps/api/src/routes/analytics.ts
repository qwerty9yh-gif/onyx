import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { calculateReportRange } from '../services/dailyReports.js';
import { getBusinessDate, getBusinessDayRange, shiftBusinessDate } from '../utils/businessDay.js';

const router = Router();

function startOfBusinessWeek(businessDate: string): string {
  const [year, month, day] = businessDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return shiftBusinessDate(businessDate, -weekday);
}

function requestedBusinessDate(value: unknown, fallback: string): string {
  const date = typeof value === 'string' ? value : '';
  if (!date) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return getBusinessDate(new Date(date));
}

// GET /api/analytics/dashboard - Dashboard stats
router.get('/dashboard', async (req: AuthenticatedRequest, res, next) => {
  try {
    const now = new Date();
    const businessDate = getBusinessDate(now);
    const dayRange = getBusinessDayRange(businessDate);
    const weekRange = getBusinessDayRange(startOfBusinessWeek(businessDate));
    const monthRange = getBusinessDayRange(`${businessDate.slice(0, 7)}-01`);
    const todayWhere = { status: 'COMPLETED' as const, createdAt: { gte: dayRange.startTime, lt: now } };
    const weekWhere = { status: 'COMPLETED' as const, createdAt: { gte: weekRange.startTime, lt: now } };
    const monthWhere = { status: 'COMPLETED' as const, createdAt: { gte: monthRange.startTime, lt: now } };
    const [todaySales, weekSales, monthSales, todayRevenue, weekRevenue, monthRevenue, totalTransactions, avgTransaction, lowStock, outOfStock, pendingInvoices, topProducts, topCategories, recentActivity] = await Promise.all([
      prisma.sale.count({ where: todayWhere }),
      prisma.sale.count({ where: weekWhere }),
      prisma.sale.count({ where: monthWhere }),
      prisma.sale.aggregate({ where: todayWhere, _sum: { total: true } }),
      prisma.sale.aggregate({ where: weekWhere, _sum: { total: true } }),
      prisma.sale.aggregate({ where: monthWhere, _sum: { total: true } }),
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
    const period = String(req.query.period || 'day');
    const currentBusinessDate = getBusinessDate(new Date());
    const endBusinessDate = requestedBusinessDate(req.query.endDate, currentBusinessDate);
    const startBusinessDate = requestedBusinessDate(
      req.query.startDate,
      period === 'week' ? startOfBusinessWeek(endBusinessDate)
        : period === 'month' ? `${endBusinessDate.slice(0, 7)}-01`
          : endBusinessDate,
    );
    const start = getBusinessDayRange(startBusinessDate).startTime;
    const end = req.query.endDate
      ? getBusinessDayRange(shiftBusinessDate(endBusinessDate, 1)).startTime
      : new Date();
    const where: Prisma.SaleWhereInput = { status: 'COMPLETED', createdAt: { gte: start, lt: end } };
    const [sales, revenue, transactions, avg, report] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true } }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _avg: { total: true } }),
      calculateReportRange(startBusinessDate, start, end),
    ]);
    const byPayment = report.payments.map((payment) => ({ method: payment.method, _sum: { amount: payment.amount } }));
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
      prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { stockQuantity: true, costPrice: true } })
    ]);
    const totalCost = totalCostValue.reduce((sum, product) => sum + product.stockQuantity * product.costPrice, 0);
    res.json({ success: true, data: { totalProducts, activeProducts, lowStock, outOfStock, totalStockValue: totalStockValue._sum.stockQuantity || 0, totalCostValue: totalCost } });
  } catch (err) { next(err); }
});

// GET /api/analytics/sales-trend - Daily completed-sale totals for charts.
router.get('/sales-trend', async (req: AuthenticatedRequest, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 2), 31);
    const lastBusinessDate = getBusinessDate(new Date());
    const firstBusinessDate = shiftBusinessDate(lastBusinessDate, -(days - 1));
    const { startTime } = getBusinessDayRange(firstBusinessDate);
    const now = new Date();
    const sales = await prisma.$queryRaw<Array<{ date: string; sales: number; revenue: number }>>`
      SELECT
        ((s."createdAt" AT TIME ZONE 'Africa/Accra' - INTERVAL '5 hours')::date)::text AS date,
        COUNT(*)::int AS sales,
        ROUND(COALESCE(SUM(ROUND(s.total::numeric, 2)), 0), 2)::float8 AS revenue
      FROM "Sale" s
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${startTime} AND s."createdAt" < ${now}
      GROUP BY date
      ORDER BY date
    `;
    const salesByDate = new Map(sales.map((row) => [row.date, row]));
    const trend = Array.from({ length: days }, (_, index) => {
      const key = shiftBusinessDate(firstBusinessDate, index);
      const dailyTotals = salesByDate.get(key);
      return { date: key, sales: dailyTotals?.sales || 0, revenue: dailyTotals?.revenue || 0 };
    });
    res.json({ success: true, data: trend });
  } catch (err) { next(err); }
});

export { router as analyticsRouter };
