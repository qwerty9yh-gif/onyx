import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { calculateReportRange } from '../services/dailyReports.js';
import { getBusinessDate, getBusinessDayRange } from '../utils/businessDay.js';

const router = Router();

async function getInventoryValuation(): Promise<{ totalValue: number; totalCost: number }> {
  const [valuation] = await prisma.$queryRaw<Array<{ totalValue: number; totalCost: number }>>`
    SELECT
      ROUND(COALESCE(SUM(p."stockQuantity"::numeric * p."sellingPrice"::numeric), 0), 2)::float8 AS "totalValue",
      ROUND(COALESCE(SUM(p."stockQuantity"::numeric * p."costPrice"::numeric), 0), 2)::float8 AS "totalCost"
    FROM "Product" p
    WHERE p.status = 'ACTIVE'
  `;
  return valuation;
}

// GET /api/reports/sales - Sales report
router.get('/sales', async (req: AuthenticatedRequest, res, next) => {
  try {
    const now = new Date();
    const businessDate = getBusinessDate(now);
    const monthStartDate = `${businessDate.slice(0, 7)}-01`;
    const { startTime } = getBusinessDayRange(monthStartDate);
    const report = await calculateReportRange(monthStartDate, startTime, now);
    const sales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: startTime, lt: now },
      },
      include: {
        cashier: { select: { firstName: true, lastName: true } },
        waiter: { select: { firstName: true, lastName: true } },
        items: true,
        payments: true,
        refund: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const summary = report.summary;
    res.json({
      success: true,
      data: sales,
      meta: {
        totalSales: summary.grossSales,
        grossSales: summary.grossSales,
        paidTotal: summary.paidTotal,
        unpaidTotal: summary.unpaidTotal,
        cashTotal: summary.cashTotal,
        momoTotal: summary.momoTotal,
        otherPaidTotal: summary.otherPaidTotal,
        totalPayments: summary.paymentTotal,
        totalDiscount: summary.totalDiscount,
        totalTax: summary.totalTax,
        totalChange: summary.totalChange,
        totalRevenue: summary.paidTotal,
        transactionCount: summary.transactionCount,
        paidCount: summary.paidCount,
        unpaidCount: summary.unpaidCount,
        voidCount: summary.voidCount,
        refundedCount: summary.refundedCount,
        totalItemsSold: summary.itemCount,
        avgTransaction: summary.averageSale,
        byPayment: report.payments.map((payment) => ({ method: payment.method, _sum: { amount: payment.amount } })),
        topProducts: report.products.slice(0, 10),
        period: { start: startTime, end: now },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/daily', async (_req: AuthenticatedRequest, res, next) => {
  try {
    const reports = await prisma.dailyReport.findMany({
      orderBy: { businessDate: 'desc' },
      select: {
        id: true,
        businessDate: true,
        startTime: true,
        endTime: true,
        grossSales: true,
        paidTotal: true,
        unpaidTotal: true,
        cashTotal: true,
        momoTotal: true,
        transactionCount: true,
        paidCount: true,
        unpaidCount: true,
        itemCount: true,
        generatedAt: true,
      },
    });
    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
});

router.get('/daily/:businessDate', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.businessDate)) {
      res.status(400).json({ success: false, error: 'businessDate must use YYYY-MM-DD' });
      return;
    }
    const report = await prisma.dailyReport.findUnique({ where: { businessDate: req.params.businessDate } });
    if (!report) {
      res.status(404).json({ success: false, error: 'Daily report not found' });
      return;
    }
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/inventory - Inventory report
router.get('/inventory', async (req: AuthenticatedRequest, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { stockQuantity: 'asc' },
    });
    const [summary, valuation] = await Promise.all([
      prisma.product.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { stockQuantity: true },
        _count: true,
      }),
      getInventoryValuation(),
    ]);
    const lowStockProducts = products.filter((p) => p.stockQuantity < 10 && p.stockQuantity > 0);
    const outOfStockProducts = products.filter((p) => p.stockQuantity === 0);
    const totalValue = valuation.totalValue;
    const totalCost = valuation.totalCost;
    res.json({
      success: true,
      data: {
        products,
        summary: {
          totalProducts: summary._count,
          totalStock: summary._sum.stockQuantity || 0,
          totalValue,
          totalCost,
          potentialProfit: totalValue - totalCost,
        },
        alerts: {
          lowStock: lowStockProducts.length,
          outOfStock: outOfStockProducts.length,
          lowStockProducts: lowStockProducts.slice(0, 20),
          outOfStockProducts: outOfStockProducts.slice(0, 20),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/products - Products report
router.get('/products', async (req: AuthenticatedRequest, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        category: { select: { id: true, name: true, image: true } },
        supplier: { select: { id: true, name: true, email: true, contactInfo: true } },
      },
      orderBy: { name: 'asc' },
    });
    const [summary, valuation] = await Promise.all([prisma.product.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { stockQuantity: true },
      _count: true,
    }), getInventoryValuation()]);
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        products: { select: { stockQuantity: true } },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
    const categoryStats = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      image: cat.image,
      productCount: cat._count.products,
      totalStock: cat.products.reduce((sum, product) => sum + (product.stockQuantity || 0), 0),
    }));
    res.json({
      success: true,
      data: products,
      meta: {
        totalProducts: summary._count,
        totalStock: summary._sum.stockQuantity || 0,
        totalInventoryValue: valuation.totalValue,
        totalCost: valuation.totalCost,
        categories: categoryStats,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/cashiers - Cashier performance report
router.get('/cashiers', async (req: AuthenticatedRequest, res, next) => {
  try {
    const cashiers = await prisma.sale.groupBy({
      by: ['cashierId'],
      _sum: { total: true, discount: true },
      _count: { id: true },
      where: { status: 'COMPLETED' },
      orderBy: { _sum: { total: 'desc' } },
    });
    const cashierDetails = await Promise.all(
      cashiers.map(async (c) => {
        if (!c.cashierId) return null;
        const user = await prisma.user.findUnique({
          where: { id: c.cashierId },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        });
        if (!user) return null;
        return {
          id: c.cashierId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          salesCount: c._count.id,
          totalRevenue: c._sum.total || 0,
          totalDiscount: c._sum.discount || 0,
          avgSale: c._count.id > 0 ? (c._sum.total || 0) / c._count.id : 0,
        };
      })
    );
    const validCashiers = cashierDetails.filter((c): c is NonNullable<typeof c> => c !== null);
    const totalRevenue = validCashiers.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
    const topCashier = validCashiers[0];
    const avgPerCashier = validCashiers.length > 0 ? totalRevenue / validCashiers.length : 0;
    res.json({
      success: true,
      data: validCashiers,
      meta: {
        totalCashiers: validCashiers.length,
        totalRevenue,
        avgPerCashier,
        topCashier,
      },
    });
  } catch (err) {
    next(err);
  }
});



// GET /api/reports/customers - Customer purchasing report
router.get('/customers', async (req: AuthenticatedRequest, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        _count: { select: { purchases: true } },
        purchases: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { sale: { include: { items: true } } },
        },
      },
      orderBy: { totalSpent: 'desc' },
    });
    const summary = await prisma.customer.aggregate({
      _sum: { totalSpent: true },
      _count: true,
    });
    const totalCustomers = summary._count;
    const totalSpent = summary._sum.totalSpent || 0;
    const avgSpent = totalCustomers > 0 ? totalSpent / totalCustomers : 0;
    const topCustomers = customers.slice(0, 10);
    res.json({
      success: true,
      data: customers,
      meta: {
        totalCustomers,
        totalSpent,
        avgSpent,
        topCustomers,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as reportRouter };
