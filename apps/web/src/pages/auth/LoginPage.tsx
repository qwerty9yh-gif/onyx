import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { loginByCard } from '../../lib/auth';

interface LoginUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF';
  status: 'ACTIVE' | 'DISABLED' | 'INVITED';
  avatar?: string | null;
  lastLogin?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  INVENTORY_STAFF: 'Inventory Staff',
};

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'bg-brand-900 text-white shadow-glow-red',
  MANAGER: 'bg-brand-600 text-white shadow-glow-red',
  CASHIER: 'bg-white border border-slate-200 text-slate-700',
  INVENTORY_STAFF: 'bg-slate-100 text-slate-700',
};

const AVATAR_CLASSES = [
  'from-brand-600 to-brand-900',
  'from-rose-500 to-red-800',
  'from-red-500 to-brand-900',
  'from-amber-500 to-red-700',
  'from-red-700 to-black',
];

function initialColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_CLASSES[hash % AVATAR_CLASSES.length];
}

function homeFor(role: string): string {
  switch (role) {
    case 'CASHIER': return '/sales';
    case 'INVENTORY_STAFF': return '/inventory';
    default: return '/dashboard';
  }
}

const base = import.meta.env.BASE_URL;

export const LoginPage: React.FC = () => {
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | undefined)?.from?.pathname;

  const { data: users = [], isLoading, isError } = useQuery<LoginUser[]>({
    queryKey: ['login-users'],
    queryFn: () => api.get('/auth/users').then((res) => res.data.data),
    retry: false,
    staleTime: 1000 * 60,
  });

  const handleSubmit = async () => {
    if (!selected || !password) return;
    setBusy(true);
    setError('');
    try {
      loginByCard(selected.id, password);
      const dest = from || homeFor(selected.role);
      window.location.href = `${base}${dest.replace(/^\//, '')}`;
    } catch {
      setError('Incorrect password. Please try again.');
      setBusy(false);
    }
  };

  const close = () => {
    setSelected(null);
    setPassword('');
    setError('');
  };

  const openUser = (user: LoginUser) => {
    setSelected(user);
    setPassword('');
    setError('');
  };

  const renderCard = (user: LoginUser) => (
    <button
      key={user.id}
      onClick={() => openUser(user)}
      className="group text-left rounded-3xl border border-white/70 bg-white/80 shadow-lg shadow-slate-200/40 hover:-translate-y-1 hover:shadow-xl hover:ring-2 hover:ring-brand-400 backdrop-blur p-5 transition duration-200 animate-fade-in"
    >
      <div className={`bg-gradient-to-br ${initialColor(user.email || user.id)} h-16 w-16 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shadow-md`}>
        {(user.firstName?.[0] || '?') + (user.lastName?.[0] || '')}
      </div>
      <div className="mt-3">
        <p className="font-bold text-slate-800">{user.firstName} {user.lastName}</p>
        <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_TONE[user.role] || 'bg-slate-100 text-slate-600'}`}>
          <ShieldCheck size={12} /> {ROLE_LABEL[user.role] || user.role.replace('_', ' ')}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${user.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {user.status === 'ACTIVE' ? 'Active' : 'Disabled'}
        </span>
      </div>
    </button>
  );
return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="flex flex-col items-center mb-8 animate-slide-up">
          <img src={`${base}icons/icon-144.png`} alt="ONYX POS System icon" className="w-20 h-20 rounded-3xl shadow-glow-red mx-auto" onError={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight onyx-text-gradient">ONYX POS System</h1>
          <p className="text-slate-500 text-sm uppercase tracking-[0.28em] mt-2">Tap your card to sign in</p>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-44 rounded-3xl onyx-chip animate-pulse"></div>
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <div className="max-w-md mx-auto rounded-3xl onyx-glass p-6 text-center">
            <Lock className="mx-auto mb-3 text-brand-600" size={30} />
            <h2 className="text-xl font-bold text-slate-800">Cannot reach the server</h2>
            <p className="mt-1 text-sm text-slate-500">Check that the ONYX API is online, then refresh this screen.</p>
          </div>
        )}

        {!isLoading && !isError && users.length === 0 && (
          <div className="max-w-md mx-auto rounded-3xl onyx-glass p-6 text-center">
            <UserRound className="mx-auto mb-3 text-brand-600" size={30} />
            <h2 className="text-xl font-bold text-slate-800">No active users</h2>
            <p className="mt-1 text-sm text-slate-500">Ask an administrator to create an active user account.</p>
          </div>
        )}

        {!isLoading && users.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {users.map(renderCard)}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          © {new Date().getFullYear()} ONYX POS System · Premium point of sale
        </p>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-fade-in" onClick={close}>
          <div
            className="w-full max-w-md rounded-4xl onyx-glass p-8 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
          >
            <div className="flex items-center gap-4">
              <button onClick={close} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Back to user selection"><ArrowLeft size={20} /></button>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">Welcome back</h2>
                <p className="text-sm text-slate-500">Enter your ONYX password to continue</p>
              </div>
            </div>

            <div className="mt-7 flex flex-col items-center">
              <div className={`bg-gradient-to-br ${initialColor(selected.email || selected.id)} h-24 w-24 rounded-3xl flex items-center justify-center text-white font-extrabold text-3xl shadow-glow-red`}>
                {(selected.firstName?.[0] || '?') + (selected.lastName?.[0] || '')}
              </div>
              <p className="mt-3 text-xl font-bold text-slate-900">{selected.firstName} {selected.lastName}</p>
              <p className="text-xs uppercase tracking-widest text-slate-400">{ROLE_LABEL[selected.role] || selected.role}</p>
            </div>

            <div className="mt-7">
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }}
                placeholder="Password"
                aria-label="Password"
                className="onyx-focus-ring h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg shadow-inner outline-none"
              />
              {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
              <button
                onClick={() => void handleSubmit()}
                disabled={busy || !password}
                className="mt-5 h-14 w-full rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 text-white text-lg font-bold shadow-glow-red transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? <span className="animate-spin inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent" /> : 'Sign in →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
