import React from 'react';
import { Menu, LogOut, User } from 'lucide-react';
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleVariant = (role?: string): 'default' | 'success' => {
    if (role === 'ADMIN') return 'success';
    return 'default';
  };

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
      <button onClick={onMenuClick} className="p-2 rounded-md md:hidden hover:bg-gray-100">
        <Menu size={20} />
      </button>
      <div className="flex-1 px-4">
        <h1 className="text-lg font-semibold text-gray-800">ONYX POS System</h1>
      </div>
      <div className="flex items-center gap-4">
        {me && (
          <>
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <span className="text-sm text-gray-600">{me.firstName} {me.lastName}</span>
              <Badge variant={roleVariant(me.role)} size="sm">{me.role}</Badge>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900"
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
