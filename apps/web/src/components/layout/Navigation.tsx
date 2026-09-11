import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, BellRing, Boxes, LayoutDashboard, Package, Receipt, Settings, ShoppingBasket, ShoppingCart, Truck, UserCog, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getUser } from '../../lib/auth';
import type { UserRole } from '../../lib/types';

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
        `mx-2 my-1 flex items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'border-red-200 bg-red-600 text-white shadow-glow-red'
            : 'text-slate-600 hover:border-red-100 hover:bg-red-50 hover:text-red-700'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
};

interface NavEntry extends NavItemProps {
  roles?: UserRole[];
}

const NAV_ENTRIES: NavEntry[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/sales', icon: <ShoppingCart size={18} />, label: 'Sales' },
  { to: '/transactions', icon: <Receipt size={18} />, label: 'Transactions' },
  { to: '/incoming', icon: <Truck size={18} />, label: 'Incoming' },
  { to: '/notifications', icon: <BellRing size={18} />, label: 'Notifications' },
  { to: '/products', icon: <Package size={18} />, label: 'Products', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/purchases', icon: <ShoppingBasket size={18} />, label: 'Purchases', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/inventory', icon: <Boxes size={18} />, label: 'Inventory', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/reports', icon: <BarChart3 size={18} />, label: 'Reports', roles: ['ADMIN'] },
  { to: '/users', icon: <UserCog size={18} />, label: 'Users', roles: ['ADMIN'] },
  { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
];

export const Navigation: React.FC = () => {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const role = (me?.role || getUser()?.role) as UserRole | undefined;

  const visible = NAV_ENTRIES.filter((entry) => !entry.roles || (role && entry.roles.includes(role)));

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {visible.map((entry) => (
        <NavItem key={entry.to} to={entry.to} icon={entry.icon} label={entry.label} />
      ))}
    </nav>
  );
};