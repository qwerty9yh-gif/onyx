import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { money } from '../../lib/helpers';
import { printReport, type ReportData } from '../../lib/printer';

export const ReportsPage: React.FC = () => {
  const [printDisabled, setPrintDisabled] = useState(false);

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales'],
    queryFn: () => api.get('/reports/sales').then((res) => res.data),
    staleTime: 1000 * 60 * 5,
  });

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get('/reports/inventory').then((res) => res.data),
    staleTime: 1000 * 60 * 5,
  });

      const isLoading = salesLoading || invLoading;

  // --- Sales summary ---
  const salesMeta = salesData?.meta || {};
  const salesList = salesData?.data || [];
  const completedSales = salesList.filter((s: any) => s.status === 'COMPLETED');
  const pendingSales = salesList.filter((s: any) => s.status === 'PENDING' || s.status === 'UNPAID');
  const refundedSales = salesList.filter((s: any) => s.status === 'REFUNDED');

  const totalRevenue = Number(salesMeta.totalRevenue || 0);
  const transactionCount = Number(salesMeta.transactionCount || salesList.length);
  const paidCount = completedSales.length;
  const unpaidCount = pendingSales.length;
  const refundedCount = refundedSales.length;
  const avgTransaction = transactionCount > 0 ? totalRevenue / transactionCount : 0;

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
    method: (p.method || 'UNKNOWN').replace(/_/g, ' '),
    amount: Number(p._sum?.amount || 0),
  }));

  // --- Top products ---
  const topProducts: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];
  const productAgg: Record<string, { quantity: number; total: number; unitPrice: number }> = {};
  for (const sale of completedSales) {
    for (const item of (sale.items || [])) {
      const key = item.name || item.productId || 'Unknown';
      if (!productAgg[key]) productAgg[key] = { quantity: 0, total: 0, unitPrice: item.unitPrice || 0 };
      productAgg[key].quantity += item.quantity || 0;
      productAgg[key].total += item.total || (item.quantity * (item.unitPrice || 0));
      if (!productAgg[key].unitPrice && item.unitPrice) productAgg[key].unitPrice = item.unitPrice;
    }
  }
  const sortedProducts = Object.entries(productAgg).sort(([, a], [, b]) => b.total - a.total).slice(0, 10);
  for (const [name, data] of sortedProducts) topProducts.push({ name, quantity: data.quantity, unitPrice: data.unitPrice, total: data.total });

  const reportData: ReportData = {
    storeName: 'ONYX LOUNGE / PUB',
    venueName: 'ONYX LOUNGE / PUB',
    venueLocation: 'Mallam Gbawe',
    venuePhone: '0555554167',
    title: 'Business Report',
    date: new Date().toLocaleString(),
    sales: { totalSales: totalRevenue, totalRevenue, transactionCount, paidCount, unpaidCount, refundedCount, avgTransaction },
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

  return (
    <div className="space-y-6">
      <div className="onyx-print-hide flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reports &amp; Summary</h1>
          <p className="text-sm text-slate-500 mt-1">Business analysis and performance</p>
        </div>
        <Button variant="secondary" onClick={handlePrint} disabled={printDisabled}>
          <Printer size={16} className="mr-2" /> Print Report
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (<div key={i} className="h-6 bg-slate-200 animate-pulse rounded-xl" />))}
        </div>
      ) : (
        <>
          {/* A. SALES SUMMARY */}
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-3">A. Sales Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MoneyCard label="Total Sales" value={totalRevenue} />
              <MoneyCard label="Total Revenue" value={totalRevenue} />
              <CountCard label="Transactions" value={transactionCount} />
              <MoneyCard label="Avg / Transaction" value={avgTransaction} />
              <CountCard label="Paid" value={paidCount} />
              <CountCard label="Unpaid" value={unpaidCount} />
              <CountCard label="Refunded" value={refundedCount} />
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
                <MoneyCard label="Total Payments" value={paymentsList.reduce((sum, p) => sum + p.amount, 0)} />
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
      )}
    </div>
  );
};
