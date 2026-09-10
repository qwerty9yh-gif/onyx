import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import type { DashboardStats } from '../../lib/types';
import { money } from '../../lib/helpers';

interface InventorySummary {
  totalProducts: number;
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  totalStockValue: number;
  totalCostValue: number;
}

interface TrendPoint { date: string; sales: number; revenue: number }
interface PaymentSummary { method: string; _sum: { amount: number | null } }

export const AnalyticsPage: React.FC = () => {
  const { data: sales } = useQuery<Record<string, unknown>>({
    queryKey: ['analytics-sales-summary'],
    queryFn: () => api.get('/analytics/sales-summary').then((res) => res.data.data),
  });

  const { data: inventory } = useQuery<InventorySummary>({
    queryKey: ['analytics-inventory-summary'],
    queryFn: () => api.get('/analytics/inventory-summary').then((res) => res.data.data),
  });

  const { data: dashboard } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((res) => res.data.data),
  });
  const { data: trend = [] } = useQuery<TrendPoint[]>({
    queryKey: ['analytics-sales-trend'],
    queryFn: () => api.get('/analytics/sales-trend', { params: { days: 7 } }).then((res) => res.data.data),
  });
  const paymentSummary = (sales?.byPayment as PaymentSummary[] | undefined) || [];
  const maxRevenue = Math.max(...trend.map((point) => point.revenue), 1);

  const fmt = (n: number) => money(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-600 mt-1">Detailed business insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Sales Summary (Today)</h2>
          <dl className="space-y-3">
            <div className="flex justify-between"><dt className="text-gray-600">Transactions</dt><dd className="font-medium">{String(sales?.sales ?? '—')}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Revenue</dt><dd className="font-medium">{typeof sales?.revenue === 'number' ? fmt(sales.revenue) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Average</dt><dd className="font-medium">{typeof sales?.avg === 'number' ? fmt(sales.avg) : '—'}</dd></div>
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Inventory Health</h2>
          <dl className="space-y-3">
            <div className="flex justify-between"><dt className="text-gray-600">Total Products</dt><dd className="font-medium">{inventory?.totalProducts ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Active</dt><dd className="font-medium">{inventory?.activeProducts ?? '—'}</dd></div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Low Stock</dt>
              <dd><Badge variant="warning">{inventory?.lowStock ?? 0}</Badge></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Out of Stock</dt>
              <dd><Badge variant="danger">{inventory?.outOfStock ?? 0}</Badge></dd>
            </div>
            <div className="flex justify-between"><dt className="text-gray-600">Cost Value</dt><dd className="font-medium">{fmt(inventory?.totalCostValue ?? 0)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Sales trend</h2>
          <svg viewBox="0 0 700 220" className="h-56 w-full" role="img" aria-label="Seven day sales revenue trend">
            <polyline fill="none" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" points={trend.map((point, index) => `${index * (680 / Math.max(trend.length - 1, 1)) + 10},${205 - (point.revenue / maxRevenue) * 180}`).join(' ')} />
            {trend.map((point, index) => <circle key={point.date} cx={index * (680 / Math.max(trend.length - 1, 1)) + 10} cy={205 - (point.revenue / maxRevenue) * 180} r="5" fill="#dc2626"><title>{point.date}: {fmt(point.revenue)}</title></circle>)}
          </svg>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">{trend.map((point) => <span key={point.date}>{point.date.slice(5)}</span>)}</div>
        </section>
        <section className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Payment mix</h2>
          <div className="flex flex-wrap items-center gap-6"><div className="h-36 w-36 rounded-full" style={{ background: `conic-gradient(${paymentSummary.map((item, index) => { const total = paymentSummary.reduce((sum, entry) => sum + (entry._sum.amount || 0), 0) || 1; const start = paymentSummary.slice(0, index).reduce((sum, entry) => sum + (entry._sum.amount || 0), 0) / total * 100; const end = start + ((item._sum.amount || 0) / total * 100); const color = ['#dc2626', '#0284c7', '#059669', '#d97706', '#7c3aed'][index % 5]; return `${color} ${start}% ${end}%`; }).join(', ')})` }} aria-label="Payment method breakdown" role="img" /> <div className="space-y-2">{paymentSummary.map((item, index) => <div key={item.method} className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: ['#dc2626', '#0284c7', '#059669', '#d97706', '#7c3aed'][index % 5] }} />{item.method}: {fmt(item._sum.amount || 0)}</div>)}</div></div>
          {!paymentSummary.length && <p className="text-sm text-gray-500">No payment data yet.</p>}
        </section>
      </div>

      <section className="rounded-lg bg-white p-6 shadow"><h2 className="mb-4 text-lg font-semibold">Daily sales volume</h2><div className="flex h-44 items-end gap-3">{trend.map((point) => <div key={point.date} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-sky-600" style={{ height: `${Math.max((point.sales / Math.max(...trend.map((entry) => entry.sales), 1)) * 140, point.sales ? 8 : 2)}px` }} title={`${point.sales} sales`} /><span className="text-[10px] text-gray-500">{point.date.slice(5)}</span></div>)}</div></section>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Top Products (All Time)</h2>
        {dashboard?.topProducts?.length ? (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-gray-500">
                <th className="py-2">Product</th>
                <th className="py-2">SKU</th>
                <th className="py-2 text-center">Units Sold</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dashboard.topProducts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-gray-500">{p.sku}</td>
                  <td className="py-2 text-center">{p.quantity}</td>
                  <td className="py-2 text-right font-medium">{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No sales data yet.</p>
        )}
      </div>
    </div>
  );
};
