import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DashboardStats } from '../lib/types';
import { Badge } from '../components/ui/Badge';
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp, AlertTriangle,
  DollarSign, ShoppingBag,
} from 'lucide-react';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
}> = ({ title, value, icon, change }) => (
  <div className="bg-white rounded-lg shadow p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {change && <p className={`text-xs ${change.startsWith('+') ? 'text-green-600' : 'text-gray-500'}`}>{change}</p>}
      </div>
      <div className="text-gray-400">{icon}</div>
    </div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((res) => res.data.data),
  });

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 h-24 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">Overview of your business performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={stats.today.sales} icon={<ShoppingCart />} change="+12%" />
        <StatCard title="Today's Revenue" value={fmt(stats.today.revenue)} icon={<DollarSign />} />
        <StatCard title="This Week Sales" value={stats.week.sales} icon={<ShoppingBag />} />
        <StatCard title="Week Revenue" value={fmt(stats.week.revenue)} icon={<TrendingUp />} />
        <StatCard title="Month Sales" value={stats.month.sales} icon={<LayoutDashboard />} />
        <StatCard title="Month Revenue" value={fmt(stats.month.revenue)} icon={<Package />} />
        <StatCard title="Total Transactions" value={stats.totalTransactions} icon={<ShoppingBag />} />
        <StatCard title="Avg. Transaction" value={fmt(stats.avgTransaction)} icon={<DollarSign />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Low Stock Alert</h2>
            <Badge variant="warning"><AlertTriangle size={14} /> {stats.lowStock} items</Badge>
          </div>
          {stats.lowStock === 0 ? (
            <p className="text-sm text-gray-500">No low stock items</p>
          ) : (
            <p className="text-sm text-gray-600">{stats.lowStock} products are running low on stock</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Top Products</h2>
          <div className="space-y-2">
            {stats.topProducts?.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm">{p.name}</span>
                <Badge variant="outline">{p.quantity} sold</Badge>
              </div>
            )) || <p className="text-sm text-gray-500">No data</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
