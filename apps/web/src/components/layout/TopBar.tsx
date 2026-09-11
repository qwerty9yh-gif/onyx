import React from 'react';
import { Bell, Menu, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { logout } from '../../lib/auth';
import { Badge } from '../ui/Badge';

export const TopBar: React.FC<{ onMenuClick: () => void }> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  const { data: lowStock = [] } = useQuery<{ id: string; name: string; stockQuantity: number }[]>({
    queryKey: ['topbar-low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((res) => res.data.data),
    enabled: !!me,
    refetchInterval: 60000,
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleVariant = (role?: string): 'default' | 'success' => {
    if (role === 'ADMIN') return 'success';
    return 'default';
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-red-100 bg-white px-4">
      <button onClick={onMenuClick} className="rounded-md p-2 text-brand-700 hover:bg-red-50 md:hidden" aria-label="Open navigation">
        <Menu size={20} />
      </button>
      <div className="flex-1 px-4">
        <h1 className="text-lg font-extrabold tracking-wide text-brand-700">ONYX POS</h1>
      </div>
      <div className="flex items-center gap-4">
        {me && (
          <>
            <button type="button" onClick={() => navigate('/notifications')} className={`relative rounded-xl p-2 transition ${lowStock.length ? 'bg-red-50 text-red-700 shadow-glow-red' : 'text-slate-500 hover:bg-slate-100'}`} title={lowStock.length ? `${lowStock.length} low-stock alerts` : 'Notifications'} aria-label={lowStock.length ? `${lowStock.length} low-stock alerts` : 'Notifications'}>
              <Bell size={18} />
              {lowStock.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{lowStock.length}</span>}
            </button>
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <span className="text-sm text-slate-700">{me.firstName} {me.lastName}</span>
              <Badge variant={roleVariant(me.role)} size="sm">{me.role}</Badge>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-2 text-slate-600 hover:bg-red-50 hover:text-brand-700"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
