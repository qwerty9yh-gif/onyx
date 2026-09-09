import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// GET /api/reports/sales - Sales report
router.get('/sales', async (req: AuthenticatedRequest, res, next) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const sales = await prisma.sale.findMany({
      where: {
        status: { in: ['COMPLETED', 'REFUNDED'] },
        createdAt: { gte: start, lte: end },
      },
      include: {
        cashier: { select: { firstName: true, lastName: true } },
        items: true,
        payments: true,
        refund: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const summary = await prisma.sale.aggregate({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
      },
      _sum: { total: true, discount: true, tax: true, change: true },
      _count: true,
    });
    const byPayment = await prisma.payment.groupBy({
      by: ['method'],
      _sum: { amount: true },
      where: {
        sale: {
          status: 'COMPLETED',
          createdAt: { gte: start, lte: end },
        },
      },
      orderBy: { _sum: { amount: 'desc' } },
    });
    res.json({
      success: true,
      data: sales,
      meta: {
        totalSales: sales.length,
        totalRevenue: summary._sum.total || 0,
        totalDiscount: summary._sum.discount || 0,
        totalTax: summary._sum.tax || 0,
        totalChange: summary._sum.change || 0,
        transactionCount: summary._count,
        avgTransaction: summary._count > 0 ? (summary._sum.total || 0) / summary._count : 0,
        byPayment,
        period: { start, end },
      },
    });
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
    const summary = await prisma.product.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { stockQuantity: true, costPrice: true, sellingPrice: true },
      _count: true,
    });
    const lowStockProducts = products.filter((p) => p.stockQuantity < 10 && p.stockQuantity > 0);
    const outOfStockProducts = products.filter((p) => p.stockQuantity === 0);
    const totalValue = (summary._sum.sellingPrice || 0) * 1;
    const totalCost = (summary._sum.costPrice || 0) * 1;
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
    const summary = await prisma.product.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { stockQuantity: true, costPrice: true, sellingPrice: true },
      _count: true,
    });
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
        totalInventoryValue: summary._sum.sellingPrice || 0,
        totalCost: summary._sum.costPrice || 0,
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
