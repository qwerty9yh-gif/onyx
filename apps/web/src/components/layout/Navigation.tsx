import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, ShoppingBasket,
  FileText, BarChart3, Settings, Shield, TrendingUp,
} from 'lucide-react';

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
            ? 'bg-red-600 text-white'
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
  return (
    <nav className="flex-1 overflow-y-auto py-4">
      <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
      <NavItem to="/sales" icon={<ShoppingCart size={18} />} label="POS / Sales" />
      <NavItem to="/products" icon={<Package size={18} />} label="Products" />
      <NavItem to="/purchases" icon={<ShoppingBasket size={18} />} label="Purchases" />
      <NavItem to="/inventory" icon={<Package size={18} />} label="Inventory" />
      <NavItem to="/customers" icon={<Users size={18} />} label="Customers" />
      <NavItem to="/suppliers" icon={<ShoppingBasket size={18} />} label="Suppliers" />
      <NavItem to="/categories" icon={<FileText size={18} />} label="Categories" />
      <NavItem to="/reports" icon={<FileText size={18} />} label="Reports" />
      <NavItem to="/analytics" icon={<BarChart3 size={18} />} label="Analytics" />
      <NavItem to="/users" icon={<Shield size={18} />} label="Users" />
      <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
      <NavItem to="/sync" icon={<TrendingUp size={18} />} label="Sync" />
    </nav>
  );
};
