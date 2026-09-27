import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Eye, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { money, paymentMethodLabel } from '../../lib/helpers';
import { printDailyReport, printReport, type DailyReportPrintData, type ReportData } from '../../lib/printer';

type ReportsView = 'summary' | 'daily' | 'detail';

function formatBusinessDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Accra',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export const ReportsPage: React.FC = () => {
  const [view, setView] = useState<ReportsView>('summary');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [printingDate, setPrintingDate] = useState<string | null>(null);

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales'],
    queryFn: () => api.get('/reports/sales').then((res) => res.data),
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get('/reports/inventory').then((res) => res.data),
    staleTime: 1000 * 60 * 5,
  });

  const { data: dailyReports = [], isLoading: dailyReportsLoading } = useQuery({
    queryKey: ['report-daily'],
    queryFn: () => api.get('/reports/daily').then((res) => res.data.data),
    enabled: view === 'daily',
    refetchInterval: 60_000,
  });

  const { data: selectedArchive, isLoading: selectedArchiveLoading } = useQuery({
    queryKey: ['report-daily', selectedDate],
    queryFn: () => api.get(`/reports/daily/${selectedDate}`).then((res) => res.data.data),
    enabled: view === 'detail' && Boolean(selectedDate),
  });

  const isLoading = salesLoading || invLoading;

  // --- Sales summary ---
  const salesMeta = salesData?.meta || {};
  const grossSales = Number(salesMeta.grossSales || 0);
  const totalRevenue = Number(salesMeta.totalRevenue || 0);
  const unpaidTotal = Number(salesMeta.unpaidTotal || 0);
  const cashTotal = Number(salesMeta.cashTotal || 0);
  const momoTotal = Number(salesMeta.momoTotal || 0);
  const bankTransferTotal = Number(salesMeta.bankTransferTotal || 0);
  const totalDiscount = Number(salesMeta.totalDiscount || 0);
  const totalItemsSold = Number(salesMeta.totalItemsSold || 0);
  const transactionCount = Number(salesMeta.transactionCount || 0);
  const paidCount = Number(salesMeta.paidCount || 0);
  const unpaidCount = Number(salesMeta.unpaidCount || 0);
  const voidCount = Number(salesMeta.voidCount || 0);
  const refundedCount = Number(salesMeta.refundedCount || 0);
  const avgTransaction = Number(salesMeta.avgTransaction || 0);

  // --- Inventory summary ---
  const invMeta = invData?.data?.summary || {};
  const alerts: {
    lowStock: number;
    outOfStock: number;
    lowStockProducts?: Array<{ id: string; name: string; stockQuantity: number; minStockLevel?: number; reorderLevel?: number }>;
    outOfStockProducts?: Array<{ id: string; name: string; stockQuantity: number }>;
  } = invData?.data?.alerts || {};
  const totalProducts = Number(invMeta.totalProducts || 0);
  const totalStock = Number(invMeta.totalStock || 0);
  const totalValue = Number(invMeta.totalValue || 0);
  const lowStock = Number(alerts.lowStock || 0);
  const outOfStock = Number(alerts.outOfStock || 0);

  // --- Payment summary ---
  const byPayment = salesMeta.byPayment || [];
  const paymentsList: Array<{ method: string; amount: number }> = byPayment.map((p: any) => ({
    method: paymentMethodLabel(p.method || 'UNKNOWN'),
    amount: Number(p._sum?.amount || 0),
  }));

  // --- Top products ---
  const topProducts: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = (salesMeta.topProducts || []).map((product: any) => ({
    name: product.name,
    quantity: Number(product.quantity || 0),
    unitPrice: Number(product.unitPrice || 0),
    total: Number(product.revenue || 0),
  }));

  const reportData: ReportData = {
    storeName: 'ONYX LOUNGE / PUB',
    venueName: 'ONYX LOUNGE / PUB',
    venueLocation: 'Mallam Gbawe',
    venuePhone: '0555554167',
    title: 'Business Report',
    date: new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', dateStyle: 'medium' }).format(new Date()),
    sales: { totalSales: grossSales, totalRevenue, transactionCount, paidCount, unpaidCount, refundedCount, avgTransaction },
    inventory: { totalProducts, totalStock, totalValue, lowStock, outOfStock },
    payments: paymentsList,
    topProducts: topProducts as any,
  };

  // Count-only card: plain number, NO GHS
  const CountCard = ({ label, value }: { label: string; value: number | string }) => (
    <div className="rounded-xl border border-red-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
  // Money card: shows GHS
  const MoneyCard = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-xl border border-red-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{money(value)}</p>
    </div>
  );
  const handlePrint = () => { printReport(reportData); };
  const handlePrintArchived = async (businessDate: string) => {
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    setPrintingDate(businessDate);
    try {
      const response = await api.get(`/reports/daily/${businessDate}`);
      const archive = response.data.data;
      printDailyReport({ ...archive.details, generatedAt: archive.generatedAt }, printWindow);
    } catch {
      printWindow?.close();
    } finally {
      setPrintingDate(null);
    }
  };

  const archivedDetails = selectedArchive?.details as Omit<DailyReportPrintData, 'generatedAt'> | undefined;
  const selectedPrintData: DailyReportPrintData | undefined = archivedDetails && selectedArchive
    ? { ...archivedDetails, generatedAt: selectedArchive.generatedAt }
    : undefined;

  return (
    <div className="space-y-6">
      <div className="onyx-print-hide flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{view === 'summary' ? 'Reports & Summary' : view === 'daily' ? 'Daily Reports' : 'Daily Business Report'}</h1>
          <p className="text-sm text-slate-500 mt-1">{view === 'summary' ? 'Business analysis and performance' : view === 'detail' && selectedDate ? formatBusinessDate(selectedDate) : 'Completed business days'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {view === 'summary' ? (
            <>
              <Button variant="secondary" onClick={() => setView('daily')}>
                <CalendarDays size={16} /> View Daily Reports
              </Button>
              <Button variant="secondary" onClick={handlePrint}>
                <Printer size={16} /> Print Report
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => { setView('summary'); setSelectedDate(null); }}>
              <ArrowLeft size={16} /> Back to Reports
            </Button>
          )}
        </div>
      </div>

      {view === 'daily' && (
        <section className="space-y-4">
          {dailyReportsLoading ? (
            <div className="h-20 animate-pulse rounded-md bg-slate-100" />
          ) : dailyReports.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">No completed business days have been archived yet.</p>
          ) : (
            <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
              {dailyReports.map((report: any) => (
                <article key={report.businessDate} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{formatBusinessDate(report.businessDate)}</h2>
                      <p className="text-xs text-slate-500">5:00 AM – 4:59 AM · Africa/Accra</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { setSelectedDate(report.businessDate); setView('detail'); }}>
                        <Eye size={14} /> View Report
                      </Button>
                      <Button size="sm" variant="outline" loading={printingDate === report.businessDate} onClick={() => void handlePrintArchived(report.businessDate)}>
                        <Printer size={14} /> Print Report
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div><p className="text-xs text-slate-500">Total Sales</p><p className="font-semibold">{money(report.grossSales)}</p></div>
                    <div><p className="text-xs text-slate-500">Paid Total</p><p className="font-semibold">{money(report.paidTotal)}</p></div>
                    <div><p className="text-xs text-slate-500">Unpaid Total</p><p className="font-semibold">{money(report.unpaidTotal)}</p></div>
                    <div><p className="text-xs text-slate-500">Cash</p><p className="font-semibold">{money(report.cashTotal)}</p></div>
                    <div><p className="text-xs text-slate-500">MoMo</p><p className="font-semibold">{money(report.momoTotal)}</p></div>
                    <div><p className="text-xs text-slate-500">Bank Transfer</p><p className="font-semibold">{money(report.bankTransferTotal)}</p></div>
                    <div><p className="text-xs text-slate-500">Paid Transactions</p><p className="font-semibold">{report.paidCount}</p></div>
                    <div><p className="text-xs text-slate-500">Unpaid Transactions</p><p className="font-semibold">{report.unpaidCount}</p></div>
                    <div><p className="text-xs text-slate-500">Total Items Sold</p><p className="font-semibold">{report.itemCount}</p></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'detail' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => setView('daily')}><ArrowLeft size={14} /> Daily Reports</Button>
            {selectedPrintData && <Button variant="secondary" onClick={() => printDailyReport(selectedPrintData)}><Printer size={16} /> Print A4 Report</Button>}
          </div>
          {selectedArchiveLoading ? (
            <div className="h-32 animate-pulse rounded-md bg-slate-100" />
          ) : selectedPrintData ? (
            <>
              <header className="border-b border-slate-200 pb-4">
                <h2 className="text-xl font-bold text-slate-900">ONYX LOUNGE / PUB</h2>
                <p className="text-sm text-slate-600">Daily Business Report · {formatBusinessDate(selectedPrintData.businessDate)}</p>
                <p className="text-xs text-slate-500">5:00 AM → 4:59:59 AM · Africa/Accra</p>
              </header>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <MoneyCard label="Gross Sales" value={selectedPrintData.summary.grossSales} />
                <MoneyCard label="Paid Sales" value={selectedPrintData.summary.paidTotal} />
                <MoneyCard label="Outstanding Unpaid" value={selectedPrintData.summary.unpaidTotal} />
                <MoneyCard label="Cash" value={selectedPrintData.summary.cashTotal} />
                <MoneyCard label="MoMo" value={selectedPrintData.summary.momoTotal} />
                <MoneyCard label="Bank Transfer" value={selectedPrintData.summary.bankTransferTotal} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard label="Paid Count" value={selectedPrintData.summary.paidCount} />
                <CountCard label="Unpaid Count" value={selectedPrintData.summary.unpaidCount} />
                <CountCard label="Void Count" value={selectedPrintData.summary.voidCount} />
                <CountCard label="Total Orders" value={selectedPrintData.summary.transactionCount} />
                <CountCard label="Items Sold" value={selectedPrintData.summary.itemCount} />
              </div>
              <section className="space-y-2">
                <h3 className="font-bold text-slate-800">Product Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200"><th className="py-2 text-left">Product</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Revenue</th></tr></thead>
                    <tbody>{selectedPrintData.products.map((product) => <tr key={product.productId} className="border-b border-slate-100"><td className="py-2">{product.name}</td><td className="py-2 text-right">{product.quantity}</td><td className="py-2 text-right">{money(product.revenue)}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="font-bold text-slate-800">Waiter Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200"><th className="py-2 text-left">Waiter Name</th><th className="py-2 text-right">Orders</th><th className="py-2 text-right">Revenue</th></tr></thead>
                    <tbody>{selectedPrintData.waiters.map((waiter) => <tr key={waiter.waiterId || 'unassigned'} className="border-b border-slate-100"><td className="py-2">{waiter.name}</td><td className="py-2 text-right">{waiter.orders}</td><td className="py-2 text-right">{money(waiter.revenue)}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="font-bold text-slate-800">Payment Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200"><th className="py-2 text-left">Method</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Share</th></tr></thead>
                    <tbody>{selectedPrintData.payments.map((payment) => <tr key={payment.method} className="border-b border-slate-100"><td className="py-2">{paymentMethodLabel(payment.method)}</td><td className="py-2 text-right">{money(payment.amount)}</td><td className="py-2 text-right">{payment.percentage.toFixed(2)}%</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <p className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">This archived report could not be loaded.</p>
          )}
        </section>
      )}

      {view === 'summary' && (isLoading ? (
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (<div key={i} className="h-6 bg-slate-200 animate-pulse rounded-xl" />))}
        </div>
      ) : (
        <>
          {/* A. SALES SUMMARY */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3">A. Sales Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MoneyCard label="Total Sales" value={grossSales} />
              <MoneyCard label="Total Revenue" value={totalRevenue} />
              <MoneyCard label="Outstanding Unpaid" value={unpaidTotal} />
              <MoneyCard label="Cash Total" value={cashTotal} />
              <MoneyCard label="MoMo Total" value={momoTotal} />
              <MoneyCard label="Bank Transfer Total" value={bankTransferTotal} />
              <MoneyCard label="Discounts" value={totalDiscount} />
              <CountCard label="Transactions" value={transactionCount} />
              <MoneyCard label="Avg / Transaction" value={avgTransaction} />
              <CountCard label="Paid" value={paidCount} />
              <CountCard label="Unpaid" value={unpaidCount} />
              <CountCard label="Voids" value={voidCount} />
              <CountCard label="Refunded" value={refundedCount} />
              <CountCard label="Items Sold" value={totalItemsSold} />
            </div>
          </section>

          {/* B. INVENTORY SUMMARY */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3">B. Inventory Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <CountCard label="Total Products" value={totalProducts} />
              <CountCard label="Total Stock" value={totalStock} />
              <MoneyCard label="Inventory Value" value={totalValue} />
              <CountCard label="Low Stock" value={lowStock} />
              <CountCard label="Out of Stock" value={outOfStock} />
            </div>
            {alerts.lowStockProducts && alerts.lowStockProducts.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Low Stock Items</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-red-100"><th className="text-left py-2">Product</th><th className="text-right py-2">Current Stock</th><th className="text-right py-2">Reorder Level</th></tr></thead>
                  <tbody>
                    {alerts.lowStockProducts.map((p) => (<tr key={p.id} className="border-b border-red-50"><td className="py-2">{p.name}</td><td className="text-right py-2">{p.stockQuantity}</td><td className="text-right py-2">{p.minStockLevel || p.reorderLevel || '-'}</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}
            {alerts.outOfStockProducts && alerts.outOfStockProducts.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Out of Stock Items</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-red-100"><th className="text-left py-2">Product</th><th className="text-right py-2">Stock</th></tr></thead>
                  <tbody>
                    {alerts.outOfStockProducts.map((p) => (<tr key={p.id} className="border-b border-red-50"><td className="py-2">{p.name}</td><td className="text-right py-2">0</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* C. PAYMENT SUMMARY */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3">C. Payment Summary</h2>
            {paymentsList.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {paymentsList.map((p) => (<MoneyCard key={p.method} label={p.method} value={p.amount} />))}
                <MoneyCard label="Total Payments" value={Number(salesMeta.totalPayments || 0)} />
              </div>
            ) : (<p className="text-sm text-slate-400">No payment data for this period.</p>)}
          </section>

          {/* D. TOP PRODUCTS */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3">D. Top Products</h2>
            {topProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-red-100"><th className="text-left py-2">Item</th><th className="text-center py-2">Qty</th><th className="text-right py-2">Unit Price</th><th className="text-right py-2">Total</th></tr></thead>
                  <tbody>
                    {topProducts.map((item) => (<tr key={item.name} className="border-b border-red-50"><td className="py-2">{item.name}</td><td className="text-center py-2">{item.quantity}</td><td className="text-right py-2">{money(item.unitPrice)}</td><td className="text-right py-2">{money(item.total)}</td></tr>))}
                  </tbody>
                </table>
              </div>
            ) : (<p className="text-sm text-slate-400">No product sales data available.</p>)}
          </section>
        </>
      ))}
    </div>
  );
};
