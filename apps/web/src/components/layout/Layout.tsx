import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Receipt, ShoppingCart, Truck, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Navigation } from './Navigation';
import { TopBar } from './TopBar';
import { MobileSidebar } from './MobileSidebar';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const isCashier = me?.role === 'CASHIER';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="hidden md:flex md:flex-col md:w-64 md:bg-gray-900 md:text-white">
        <div className="flex items-center justify-center h-14 border-b border-gray-800">
          <h1 className="text-xl font-bold">POS System</h1>
        </div>
        <Navigation />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className={`flex-1 overflow-y-auto p-4 pb-24 md:p-6 ${isCashier ? 'cashier-surface' : ''}`}>
          <Outlet />
        </main>
      </div>
      {isCashier && (
        <nav className="cashier-dock md:hidden" aria-label="Cashier navigation">
          <NavLink to="/dashboard"><Home size={20} /><span>Home</span></NavLink>
          <NavLink to="/transactions"><Receipt size={20} /><span>Transactions</span></NavLink>
          <NavLink to="/sales" className="cashier-dock-sale"><ShoppingCart size={24} /><span>Sales</span></NavLink>
          <NavLink to="/incoming"><Truck size={20} /><span>Incoming</span></NavLink>
          <NavLink to="/settings"><Settings size={20} /><span>Settings</span></NavLink>
        </nav>
      )}
    </div>
  );
};
