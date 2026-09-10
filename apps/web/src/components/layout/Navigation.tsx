import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getUser } from '../../lib/auth';

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

export const Navigation: React.FC = () => {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const role = me?.role || getUser()?.role;
  const isAdmin = role === 'ADMIN';

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {isAdmin && (
        <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
      )}
      <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
    </nav>
  );
};
