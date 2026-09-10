import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, ShoppingBasket,
  FileText, BarChart3, Settings, Shield, TrendingUp,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-md mx-2 my-1 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-600 text-white shadow-glow-red'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
};

export const Navigation: React.FC = () => {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const isCashier = me?.role === 'CASHIER';
  const canManageInventory = ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(me?.role || '');
  const canManageCustomers = ['ADMIN', 'MANAGER'].includes(me?.role || '');

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
      <NavItem to="/sales" icon={<ShoppingCart size={18} />} label="POS / Sales" />
      <NavItem to="/transactions" icon={<FileText size={18} />} label="Transactions" />
      {canManageInventory && <NavItem to="/products" icon={<Package size={18} />} label="Products" />}
      {canManageInventory && <NavItem to="/purchases" icon={<ShoppingBasket size={18} />} label="Purchases" />}
      {canManageInventory && <NavItem to="/inventory" icon={<Package size={18} />} label="Inventory" />}
      {canManageInventory && <NavItem to="/incoming" icon={<ShoppingBasket size={18} />} label="Incoming Goods" />}
      {canManageCustomers && <NavItem to="/customers" icon={<Users size={18} />} label="Customers" />}
      {canManageCustomers && <NavItem to="/suppliers" icon={<ShoppingBasket size={18} />} label="Suppliers" />}
      {canManageCustomers && <NavItem to="/categories" icon={<FileText size={18} />} label="Categories" />}
      {me?.role === 'ADMIN' && <NavItem to="/reports" icon={<FileText size={18} />} label="Reports" />}
      {me?.role === 'ADMIN' && <NavItem to="/analytics" icon={<BarChart3 size={18} />} label="Analytics" />}
      {me?.role === 'ADMIN' && <NavItem to="/users" icon={<Shield size={18} />} label="Users" />}
      <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
      {me?.role === 'ADMIN' && <NavItem to="/sync" icon={<TrendingUp size={18} />} label="Sync" />}
    </nav>
  );
};
