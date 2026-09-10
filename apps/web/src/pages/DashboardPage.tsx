import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DashboardStats } from '../lib/types';
import { Badge } from '../components/ui/Badge';
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp, AlertTriangle,
  DollarSign, ShoppingBag, Clock, FileText,
} from 'lucide-react';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: string;
  tone?: 'red' | 'white' | 'dark';
}> = ({ title, value, icon, change, tone = 'white' }) => {
  const tones = {
    red: 'bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow-red',
    white: 'bg-white border border-slate-200 text-slate-900 shadow-glass-sm',
    dark: 'bg-gradient-to-br from-brand-700 to-brand-900 text-white shadow-glow-red',
  };
  return (
    <div className={`rounded-3xl p-5 ${tones[tone]} transition hover:-translate-y-0.5 hover:shadow-glass animate-fade-in`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest ${tone === 'white' ? 'text-slate-500' : 'text-white/70'}`}>{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          {change && <p className={`mt-1 text-xs font-semibold ${tone === 'white' ? 'text-emerald-600' : 'text-emerald-300'}`}>{change}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone === 'white' ? 'bg-brand-50 text-brand-600' : 'bg-white/15 text-white'}`}>{icon}</div>
      </div>
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then((res) => res.data.data),
  });

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="rounded-3xl bg-white/70 p-5 h-28 animate-pulse">
            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            <div className="mt-3 h-6 bg-slate-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">ONYX POS</p>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your business performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={stats.today.sales} icon={<ShoppingCart size={20} />} change="+12%" tone="red" />
        <StatCard title="Today's Revenue" value={fmt(stats.today.revenue)} icon={<DollarSign size={20} />} tone="white" />
        <StatCard title="This Week" value={stats.week.sales} icon={<ShoppingBag size={20} />} tone="white" />
        <StatCard title="Week Revenue" value={fmt(stats.week.revenue)} icon={<TrendingUp size={20} />} tone="dark" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Month Sales" value={stats.month.sales} icon={<LayoutDashboard size={20} />} tone="white" />
        <StatCard title="Month Revenue" value={fmt(stats.month.revenue)} icon={<Package size={20} />} tone="white" />
        <StatCard title="Pending Invoices" value={stats.pendingInvoices || 0} icon={<FileText size={20} />} tone="white" />
        <StatCard title="Avg. Transaction" value={fmt(stats.avgTransaction)} icon={<DollarSign size={20} />} tone="white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-glass backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Low Stock Alerts</h2>
            <Badge variant="warning"><AlertTriangle size={14} /> {stats.lowStock} items</Badge>
          </div>
          {stats.lowStock === 0 ? (
            <p className="text-sm text-slate-500">All products are well stocked</p>
          ) : (
            <p className="text-sm text-slate-600">{stats.lowStock} products are running low on stock</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-glass backdrop-blur-xl">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Top Products</h2>
          <div className="space-y-3">
            {stats.topProducts?.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{p.name}</span>
                <Badge variant="outline">{p.quantity} sold</Badge>
              </div>
            )) || <p className="text-sm text-slate-500">No data</p>}
          </div>
        </div>
      </div>

      {stats.recentActivity && stats.recentActivity.length > 0 && (
        <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-glass backdrop-blur-xl">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {stats.recentActivity.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{log.user?.firstName} {log.user?.lastName} — {log.action}</span>
                <span className="text-slate-400"><Clock size={12} className="inline mr-1" />{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
