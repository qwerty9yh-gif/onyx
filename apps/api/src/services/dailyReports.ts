import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { getBusinessDate, getBusinessDayRange, getNextBusinessDayStart, shiftBusinessDate } from '../utils/businessDay.js';

const TIMEZONE = 'Africa/Accra';
const CUTOFF_HOUR = 5;

interface SummaryRow {
  transactionCount: number;
  paidCount: number;
  unpaidCount: number;
  voidCount: number;
  refundedCount: number;
  grossSales: number;
  paidTotal: number;
  unpaidTotal: number;
  voidTotal: number;
  refundedTotal: number;
  totalDiscount: number;
  totalTax: number;
  totalChange: number;
  averageSale: number;
}

interface PaymentRow {
  method: string;
  amount: number;
}

interface ProductRow {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
}

interface WaiterRow {
  waiterId: string | null;
  name: string;
  orders: number;
  revenue: number;
}

export interface DailyReportDetails {
  businessDate: string;
  startTime: string;
  endTime: string;
  summary: SummaryRow & { cashTotal: number; momoTotal: number; otherPaidTotal: number; paymentTotal: number; itemCount: number };
  payments: Array<{ method: string; amount: number; percentage: number }>;
  products: ProductRow[];
  waiters: WaiterRow[];
}

function cents(value: number): number {
  return Math.round((Number(value) || 0) * 100);
}

function amount(value: number): number {
  return cents(value) / 100;
}

export async function calculateReportRange(
  businessDate: string,
  startTime: Date,
  endTime: Date,
): Promise<DailyReportDetails> {
  const [summaryRows, paymentRows, refundRows, productRows, waiterRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COUNT(*)::int AS "transactionCount",
        COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "paidCount",
        COUNT(*) FILTER (WHERE s.status = 'PENDING')::int AS "unpaidCount",
        COUNT(*) FILTER (WHERE s.status = 'VOIDED')::int AS "voidCount",
        COUNT(*) FILTER (WHERE s.status = 'REFUNDED')::int AS "refundedCount",
        ROUND(COALESCE(SUM(ROUND(s.total::numeric, 2)) FILTER (WHERE s.status IN ('COMPLETED', 'PENDING')), 0), 2)::float8 AS "grossSales",
        ROUND(COALESCE(SUM(GREATEST(ROUND(s.total::numeric, 2) - COALESCE(refunds.amount, 0), 0)) FILTER (WHERE s.status = 'COMPLETED'), 0), 2)::float8 AS "paidTotal",
        ROUND(COALESCE(SUM(GREATEST(ROUND(s.total::numeric, 2) - LEAST(ROUND(s.total::numeric, 2), COALESCE(payments.amount, 0)), 0)) FILTER (WHERE s.status = 'PENDING'), 0), 2)::float8 AS "unpaidTotal",
        ROUND(COALESCE(SUM(ROUND(s.total::numeric, 2)) FILTER (WHERE s.status = 'VOIDED'), 0), 2)::float8 AS "voidTotal",
        ROUND(COALESCE(SUM(refunds.amount), 0), 2)::float8 AS "refundedTotal",
        ROUND(COALESCE(SUM(ROUND(s.discount::numeric, 2)) FILTER (WHERE s.status IN ('COMPLETED', 'PENDING')), 0), 2)::float8 AS "totalDiscount",
        ROUND(COALESCE(SUM(ROUND(s.tax::numeric, 2)) FILTER (WHERE s.status IN ('COMPLETED', 'PENDING')), 0), 2)::float8 AS "totalTax",
        ROUND(COALESCE(SUM(ROUND(s.change::numeric, 2)) FILTER (WHERE s.status = 'COMPLETED'), 0), 2)::float8 AS "totalChange",
        ROUND((COALESCE(SUM(ROUND(s.total::numeric, 2)) FILTER (WHERE s.status IN ('COMPLETED', 'PENDING')), 0) /
          NULLIF(COUNT(*) FILTER (WHERE s.status IN ('COMPLETED', 'PENDING')), 0))::numeric, 2)::float8 AS "averageSale"
      FROM "Sale" s
      LEFT JOIN LATERAL (
        SELECT SUM(ROUND(p.amount::numeric, 2)) AS amount FROM "Payment" p WHERE p."saleId" = s.id
      ) payments ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(ROUND(r."amountRefunded"::numeric, 2)) AS amount
        FROM "Refund" r WHERE r."originalSaleId" = s.id AND r.status = 'COMPLETED'
      ) refunds ON TRUE
      WHERE s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
    `,
    prisma.$queryRaw<PaymentRow[]>`
      WITH allocated AS (
        SELECT p.method, ROUND(p.amount::numeric, 2) AS amount, ROUND(s.total::numeric, 2) AS total,
          COALESCE(SUM(ROUND(p.amount::numeric, 2)) OVER (
            PARTITION BY p."saleId" ORDER BY p."createdAt", p.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS previouslyAllocated
        FROM "Payment" p
        JOIN "Sale" s ON s.id = p."saleId"
        WHERE s.status = 'COMPLETED'
          AND s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
      ), payment_totals AS (
        SELECT method, SUM(GREATEST(LEAST(amount, total - previouslyAllocated), 0)) AS amount
        FROM allocated GROUP BY method
      ), refund_totals AS (
        SELECT r."paymentMethod" AS method, SUM(ROUND(r."amountRefunded"::numeric, 2)) AS amount
        FROM "Refund" r
        JOIN "Sale" s ON s.id = r."originalSaleId"
        WHERE r.status = 'COMPLETED' AND s.status = 'COMPLETED'
          AND s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
        GROUP BY r."paymentMethod"
      )
      SELECT methods.method,
        ROUND(GREATEST(COALESCE(payment_totals.amount, 0) - COALESCE(refund_totals.amount, 0), 0), 2)::float8 AS amount
      FROM (
        SELECT method FROM payment_totals UNION SELECT method FROM refund_totals
      ) methods
      LEFT JOIN payment_totals USING (method)
      LEFT JOIN refund_totals USING (method)
      ORDER BY methods.method
    `,
    prisma.$queryRaw<Array<{ amount: number }>>`
      SELECT ROUND(COALESCE(SUM(ROUND(r."amountRefunded"::numeric, 2)), 0), 2)::float8 AS amount
      FROM "Refund" r
      JOIN "Sale" s ON s.id = r."originalSaleId"
      WHERE r.status = 'COMPLETED' AND s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
    `,
    prisma.$queryRaw<ProductRow[]>`
      WITH refunded_items AS (
        SELECT ri."saleItemId", SUM(ri.quantity)::int AS quantity, SUM(ROUND(ri.total::numeric, 2)) AS revenue
        FROM "RefundItem" ri
        JOIN "Refund" r ON r.id = ri."refundId"
        WHERE r.status = 'COMPLETED' AND ri."saleItemId" IS NOT NULL
        GROUP BY ri."saleItemId"
      )
      SELECT si."productId", si.name,
        GREATEST(SUM(si.quantity - COALESCE(ri.quantity, 0)), 0)::int AS quantity,
        ROUND((SUM(ROUND(si."unitPrice"::numeric, 2) * (si.quantity - COALESCE(ri.quantity, 0))) /
          NULLIF(SUM(si.quantity - COALESCE(ri.quantity, 0)), 0))::numeric, 2)::float8 AS "unitPrice",
        ROUND(GREATEST(SUM(ROUND(si.total::numeric, 2) - COALESCE(ri.revenue, 0)), 0), 2)::float8 AS revenue
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN refunded_items ri ON ri."saleItemId" = si.id
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
      GROUP BY si."productId", si.name
      HAVING SUM(si.quantity - COALESCE(ri.quantity, 0)) > 0
        OR SUM(si.total - COALESCE(ri.revenue, 0)) > 0
      ORDER BY quantity DESC, revenue DESC, si.name ASC
    `,
    prisma.$queryRaw<WaiterRow[]>`
      SELECT s."waiterId",
        COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''), 'Unassigned') AS name,
        COUNT(*)::int AS orders,
        ROUND(COALESCE(SUM(GREATEST(ROUND(s.total::numeric, 2) - COALESCE(refunds.amount, 0), 0)), 0), 2)::float8 AS revenue
      FROM "Sale" s
      LEFT JOIN "User" u ON u.id = s."waiterId"
      LEFT JOIN LATERAL (
        SELECT SUM(ROUND(r."amountRefunded"::numeric, 2)) AS amount
        FROM "Refund" r WHERE r."originalSaleId" = s.id AND r.status = 'COMPLETED'
      ) refunds ON TRUE
      WHERE s.status = 'COMPLETED' AND s."createdAt" >= ${startTime} AND s."createdAt" < ${endTime}
      GROUP BY s."waiterId", u."firstName", u."lastName"
      ORDER BY revenue DESC, name ASC
    `,
  ]);

  const summary = summaryRows[0];
  const refundsTotal = amount(refundRows[0]?.amount || 0);
  const payments = paymentRows.map((payment) => ({
    method: payment.method,
    amount: amount(payment.amount),
  }));
  const paymentTotalCents = payments.reduce((total, payment) => total + cents(payment.amount), 0);
  const paymentBreakdown = payments.map((payment) => ({
    ...payment,
    percentage: paymentTotalCents > 0 ? Math.round((cents(payment.amount) / paymentTotalCents) * 10000) / 100 : 0,
  }));
  const products = productRows.map((product) => ({
    ...product,
    quantity: Number(product.quantity),
    revenue: amount(product.revenue),
  }));
  const itemCount = products.reduce((total, product) => total + product.quantity, 0);
  const cashTotal = amount(payments.filter((payment) => payment.method === 'CASH').reduce((total, payment) => total + cents(payment.amount), 0) / 100);
  const momoTotal = amount(payments.filter((payment) => payment.method === 'MOMO').reduce((total, payment) => total + cents(payment.amount), 0) / 100);
  const paidTotal = amount(summary.paidTotal);
  const normalizedSummary = {
    ...summary,
    grossSales: amount(summary.grossSales),
    paidTotal,
    unpaidTotal: amount(summary.unpaidTotal),
    voidTotal: amount(summary.voidTotal),
    refundedTotal: refundsTotal,
    totalDiscount: amount(summary.totalDiscount),
    totalTax: amount(summary.totalTax),
    totalChange: amount(summary.totalChange),
    averageSale: amount(summary.averageSale),
    cashTotal,
    momoTotal,
    otherPaidTotal: amount(Math.max(cents(paidTotal) - cents(cashTotal) - cents(momoTotal), 0) / 100),
    paymentTotal: amount(paymentTotalCents / 100),
    itemCount,
  };

  return {
    businessDate,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    summary: normalizedSummary,
    payments: paymentBreakdown,
    products,
    waiters: waiterRows.map((waiter) => ({ ...waiter, revenue: amount(waiter.revenue) })),
  };
}

export async function createDailyReportIfMissing(businessDate: string): Promise<void> {
  const { startTime, endTime } = getBusinessDayRange(businessDate, TIMEZONE, CUTOFF_HOUR);
  const details = await calculateReportRange(businessDate, startTime, endTime);
  const now = new Date();

  await prisma.dailyReport.createMany({
    data: [{
      businessDate,
      startTime,
      endTime,
      grossSales: details.summary.grossSales,
      paidTotal: details.summary.paidTotal,
      unpaidTotal: details.summary.unpaidTotal,
      cashTotal: details.summary.cashTotal,
      momoTotal: details.summary.momoTotal,
      transactionCount: details.summary.transactionCount,
      paidCount: details.summary.paidCount,
      unpaidCount: details.summary.unpaidCount,
      itemCount: details.summary.itemCount,
      generatedAt: now,
      details: details as unknown as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  });
}

export async function archiveCompletedBusinessDays(now = new Date()): Promise<void> {
  const earliestSale = await prisma.sale.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!earliestSale) {
    const lastCompletedDate = shiftBusinessDate(getBusinessDate(now, TIMEZONE, CUTOFF_HOUR), -1);
    await createDailyReportIfMissing(lastCompletedDate);
    return;
  }

  let businessDate = getBusinessDate(earliestSale.createdAt, TIMEZONE, CUTOFF_HOUR);
  while (businessDate <= shiftBusinessDate(getBusinessDate(new Date(), TIMEZONE, CUTOFF_HOUR), -1)) {
    await createDailyReportIfMissing(businessDate);
    businessDate = shiftBusinessDate(businessDate, 1);
  }
}

export function startDailyReportScheduler(retrySoon = false): void {
  const scheduleNextClose = (retry = false) => {
    const nextClose = getNextBusinessDayStart(new Date(), TIMEZONE, CUTOFF_HOUR);
    const delay = retry ? 60_000 : Math.max(nextClose.getTime() - Date.now(), 1);
    const timer = setTimeout(async () => {
      try {
        await archiveCompletedBusinessDays();
        scheduleNextClose();
      } catch (error) {
        console.error('Daily report close failed; retrying in one minute:', error);
        scheduleNextClose(true);
      }
    }, delay);
    timer.unref();
  };

  scheduleNextClose(retrySoon);
}

export function currentBusinessDayRange(now = new Date()): { businessDate: string; startTime: Date; endTime: Date } {
  const businessDate = getBusinessDate(now, TIMEZONE, CUTOFF_HOUR);
  return { businessDate, ...getBusinessDayRange(businessDate, TIMEZONE, CUTOFF_HOUR) };
}