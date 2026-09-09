import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import type { DashboardStats } from '../../lib/types';

interface InventorySummary {
  totalProducts: number;
  activeProducts: number;
  lowStock: number;
  outOfStock: number;
  totalStockValue: number;
  totalCostValue: number;
}

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

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

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
