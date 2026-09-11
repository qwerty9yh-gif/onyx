import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellRing, Package, PackageX, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import type { Product, UserRole } from '../../lib/types';

interface AlertProduct extends Product {
  minimumStock: number;
}

const canManage = (role?: UserRole): boolean => !!role && ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'].includes(role);

/**
 * Notifications are visible to every account. Workers can view important
 * alerts (low stock / out of stock) even though managing them stays behind
 * the admin capabilities.
 */
export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const online = navigator.onLine;
  const me = getUser();

  const { data: lowStock = [], isLoading: lowLoading } = useQuery<AlertProduct[]>({
    queryKey: ['notifications-low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((res) => res.data.data),
    refetchInterval: 60000,
  });

  const { data: outOfStock = [], isLoading: outLoading } = useQuery<AlertProduct[]>({
    queryKey: ['notifications-out-of-stock'],
    queryFn: () => api.get('/inventory/out-of-stock').then((res) => res.data.data),
    refetchInterval: 60000,
  });

  const adminView = canManage(me?.role);
  const loading = lowLoading || outLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Notifications</p>
          <h1 className="text-3xl font-bold text-slate-900">Important alerts</h1>
          <p className="mt-1 text-sm text-slate-500">Low-stock and out-of-stock items need attention. This panel is available to every ONYX POS account.</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-800'}`}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? 'Live alerts' : 'Showing cached data'}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-amber-50 p-4 shadow-lg">
          <p className="text-xs text-amber-700">Low stock</p>
          <strong className="text-3xl text-amber-800">{lowStock.length}</strong>
        </div>
        <div className="rounded-3xl bg-red-50 p-4 shadow-lg">
          <p className="text-xs text-red-700">Out of stock</p>
          <strong className="text-3xl text-red-700">{outOfStock.length}</strong>
        </div>
      </div>

      {loading && <div className="rounded-3xl bg-white p-10 text-center text-slate-500">Loading alerts...</div>}

      {!loading && lowStock.length === 0 && outOfStock.length === 0 && (
        <div className="rounded-3xl bg-white p-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700"><BellRing size={28} /></span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">All clear</h2>
          <p className="mt-1 text-sm text-slate-500">No low-stock or out-of-stock alerts right now.</p>
        </div>
      )}

      {!loading && lowStock.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-white/90 p-5 shadow-xl shadow-slate-200/40">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-800"><AlertTriangle size={18} /> Low stock ({lowStock.length})</h2>
          <div className="mt-4 space-y-3">
            {lowStock.map((product) => (
              <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50/70 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Package size={18} /></span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sku}{product.barcode ? ` · Barcode ${product.barcode}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="warning">{product.stockQuantity} left · min {product.minimumStock}</Badge>
                  {adminView && <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => navigate(`/products/${product.id}/edit`)}>Restock / Edit</Button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
{!loading && outOfStock.length > 0 && (
        <section className="rounded-3xl border border-red-200 bg-white/90 p-5 shadow-xl shadow-slate-200/40">
          <h2 className="flex items-center gap-2 text-lg font-bold text-red-700"><PackageX size={18} /> Out of stock ({outOfStock.length})</h2>
          <div className="mt-4 space-y-3">
            {outOfStock.map((product) => (
              <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50/70 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700"><PackageX size={18} /></span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sku}{product.barcode ? ` · Barcode ${product.barcode}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="danger">0 in stock</Badge>
                  {adminView && <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => navigate(`/products/${product.id}/edit`)}>Restock / Edit</Button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};