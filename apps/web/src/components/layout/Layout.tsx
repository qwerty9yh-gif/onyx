import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Receipt, ShoppingCart, Truck, Settings, Users } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Navigation } from './Navigation';
import { TopBar } from './TopBar';
import { MobileSidebar } from './MobileSidebar';
import { getUser } from '../../lib/auth';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const dailyReset = useMutation({ mutationFn: () => api.post('/sales/daily-reset') });
  const role = me?.role || getUser()?.role;
  const isWebView1 = typeof navigator !== 'undefined' && /WebView1/i.test(navigator.userAgent);
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-red-100 md:bg-white md:shadow-xl">
        <div className="flex h-16 items-center justify-center border-b border-red-100 bg-brand-700">
          <h1 className="text-lg font-extrabold tracking-wider text-white">ONYX POS</h1>
        </div>
        <Navigation />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6">
          {me?.role === 'ADMIN' && location.pathname === '/settings' && <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span><strong>Daily shift control:</strong> archive pending transactions before resetting.</span><button type="button" onClick={() => { if (window.confirm('Archive pending transactions and reset the active shift?')) dailyReset.mutate(); }} disabled={dailyReset.isPending} className="rounded-xl bg-red-600 px-3 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50">{dailyReset.isPending ? 'Resetting...' : 'Archive and reset'}</button></div>}
          <Outlet />
        </main>
      </div>
        {!isWebView1 && <nav className="cashier-dock" aria-label="Main navigation">
          <NavLink to="/dashboard"><Home size={20} /><span>Home</span></NavLink>
          <NavLink to="/transactions"><Receipt size={20} /><span>Transactions</span></NavLink>
          <NavLink to="/sales" className="cashier-dock-sale"><ShoppingCart size={24} /><span>Sales</span></NavLink>
          <NavLink to="/incoming"><Truck size={20} /><span>Incoming</span></NavLink>
          <NavLink to="/customers"><Users size={20} /><span>Customers</span></NavLink>
          <NavLink to="/settings"><Settings size={20} /><span>Settings</span></NavLink>
        </nav>}
    </div>
  );
};
