import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, Edit3, LogOut, Plus, Save, Search, Settings2, Shield,
  Store, Trash2, Upload, Type, Package, ShoppingCart, FileText,
  BarChart3, TrendingUp, Users, ShoppingBasket, Truck, Archive,
  ClipboardList, SortAsc,
} from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { logout } from '../../lib/auth';
import type { Business, Category, Product } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useNavigate } from 'react-router-dom';

interface BusinessForm extends Business { }
const EMPTY: BusinessForm = { id: 'default', name: '', phone: '', email: '', address: '', taxRate: 0, currency: 'GHS', receiptPrefix: 'REC' };

type SortMode = 'name' | 'price' | 'category';
type ProductDraft = Partial<Omit<Product, 'categoryId'>> & { categoryId?: string | null };

interface SettingsNavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  description: string;
  roles?: string[];
}

const settingsNavItems: SettingsNavItem[] = [
  { to: '/dashboard', icon: Type, label: 'Dashboard', description: 'Overview of business performance and stats' },
  { to: '/sales', icon: ShoppingCart, label: 'POS / Sales', description: 'Process sales and manage the point of sale' },
  { to: '/transactions', icon: FileText, label: 'Transactions', description: 'View and manage all transactions' },
  { to: '/products', icon: Package, label: 'Products', description: 'Manage product catalog and pricing', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/purchases', icon: ShoppingBasket, label: 'Purchases', description: 'Manage supplier purchases and orders', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/inventory', icon: Package, label: 'Inventory', description: 'Track stock levels and inventory movements', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/incoming', icon: Truck, label: 'Incoming Goods', description: 'Record and manage incoming stock deliveries', roles: ['ADMIN', 'MANAGER', 'INVENTORY_STAFF'] },
  { to: '/customers', icon: Users, label: 'Customers', description: 'Manage customer records and details', roles: ['ADMIN', 'MANAGER'] },
  { to: '/suppliers', icon: ShoppingBasket, label: 'Suppliers', description: 'Manage supplier information and contacts', roles: ['ADMIN', 'MANAGER'] },
  { to: '/categories', icon: FileText, label: 'Categories', description: 'Organize products into categories', roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports', icon: FileText, label: 'Reports', description: 'Generate and view business reports', roles: ['ADMIN'] },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', description: 'Advanced analytics and data insights', roles: ['ADMIN'] },
  { to: '/users', icon: Users, label: 'Users', description: 'Manage user accounts and permissions', roles: ['ADMIN'] },
  { to: '/sync', icon: TrendingUp, label: 'Sync', description: 'Synchronize offline data with the server', roles: ['ADMIN'] },
];

const managementPanels = [
  {
    icon: Archive,
    title: 'Daily Shift Reset',
    description: 'Archive pending transactions and reset the active shift',
    action: 'daily-reset',
  },
  {
    icon: ClipboardList,
    title: 'Archive & Reset',
    description: 'Comprehensive archive and system reset controls',
    action: 'archive-reset',
  },
  {
    icon: Package,
    title: 'Product Management',
    description: 'Full product catalog management, bulk pricing, import/export',
    action: 'product-management',
  },
];

export const SettingsPage: React.FC = () => {
  const [form, setForm] = useState<BusinessForm>(EMPTY);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState<SortMode>('name');
  const [bulkPercent, setBulkPercent] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get('/auth/me').then((res) => res.data.data) });
  const isAdmin = me?.role === 'ADMIN';
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then((res) => res.data.data), enabled: isAdmin });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['settings-products'], queryFn: () => api.get('/products', { params: { limit: 200 } }).then((res) => res.data.data), enabled: isAdmin });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: () => api.get('/categories').then((res) => res.data.data), enabled: isAdmin });

  useEffect(() => { if (settings?.business) setForm({ ...EMPTY, ...settings.business }); }, [settings]);

  const saveSettings = useMutation({ mutationFn: () => api.put('/settings', { business: form }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }) });
  const updateProduct = useMutation({ mutationFn: ({ id, data }: { id: string; data: ProductDraft }) => api.put(`/products/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings-products'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); setEditing(null); } });
  const deleteProduct = useMutation({ mutationFn: (id: string) => api.delete(`/products/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-products'] }) });
  const dailyReset = useMutation({ mutationFn: () => api.post('/sales/daily-reset') });

  const visibleProducts = useMemo(() => products.filter((product) => (!search || `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())) && (!categoryId || product.categoryId === categoryId)).sort((a, b) => sort === 'price' ? a.sellingPrice - b.sellingPrice : sort === 'category' ? (a.category?.name || '').localeCompare(b.category?.name || '') : a.name.localeCompare(b.name)), [products, search, categoryId, sort]);
  const setBusiness = (patch: Partial<BusinessForm>) => setForm((current) => ({ ...current, ...patch }));

  const exportProducts = () => {
    const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'onyx-products.json'; link.click(); URL.revokeObjectURL(url);
  };

  const importProducts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const imported = JSON.parse(await file.text()) as Product[];
    for (const product of imported) await api.post('/products', { ...product, id: undefined, categoryId: product.categoryId || null, supplierId: product.supplierId || null, status: product.status || 'ACTIVE' });
    queryClient.invalidateQueries({ queryKey: ['settings-products'] }); event.target.value = '';
  };

  const applyBulkPrice = async () => {
    const percent = Number(bulkPercent); if (!Number.isFinite(percent)) return;
    await Promise.all(visibleProducts.map((product) => updateProduct.mutateAsync({ id: product.id, data: { sellingPrice: Number((product.sellingPrice * (1 + percent / 100)).toFixed(2)) } })));
    setBulkPercent('');
  };

  if (!isAdmin) {
    return <div className="mx-auto max-w-2xl space-y-6"><header><p className="text-sm font-semibold uppercase tracking-widest text-red-700">Settings</p><h1 className="text-3xl font-bold">My account</h1><p className="mt-1 text-sm text-slate-500">Your account and session settings.</p></header><section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-xl font-bold text-white">{me?.firstName?.[0]}{me?.lastName?.[0]}</div><div><h2 className="text-xl font-bold">{me?.firstName} {me?.lastName}</h2><p className="text-sm text-slate-500">{me?.email}</p><p className="mt-1 text-xs font-bold uppercase tracking-widest text-red-700">{me?.role}</p></div></div><Button className="mt-6 rounded-2xl bg-red-600 hover:bg-red-700" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}><LogOut className="mr-2" size={16} />Log out</Button></section></div>;
  }

  const canAccess = (item: SettingsNavItem) => !item.roles || item.roles.includes(me?.role || '');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-red-700">Settings</p>
        <h1 className="text-3xl font-bold">Management center</h1>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="col-span-full text-xl font-bold text-slate-800 border-b border-slate-200 pb-2">Navigation panels</h2>
        {settingsNavItems.map((item) => {
          if (!canAccess(item)) return null;
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(item.to)}
              className="rounded-3xl border border-white/80 bg-white/90 p-5 text-left shadow-lg shadow-slate-200/50 transition hover:-translate-y-1 hover:shadow-xl"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><Icon size={20} /></span>
              <h2 className="mt-4 font-bold">{item.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{item.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="col-span-full text-xl font-bold text-slate-800 border-b border-slate-200 pb-2">Management panels</h2>
        {managementPanels.map((panel) => {
          const Icon = panel.icon;
          let body: React.ReactNode = null;

          if (panel.action === 'daily-reset') {
            body = (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
                <p className="text-sm font-semibold text-red-800">Archive pending transactions and reset the active shift.</p>
                <Button className="mt-4 rounded-2xl bg-red-600 hover:bg-red-700" onClick={() => { if (window.confirm('Archive pending transactions and reset the active shift?')) dailyReset.mutate(); }} disabled={dailyReset.isPending}>
                  {dailyReset.isPending ? 'Resetting...' : 'Archive and reset'}
                </Button>
              </div>
            );
          } else if (panel.action === 'archive-reset') {
            body = (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold">Archive Operations</h3>
                  <p className="mt-1 text-sm text-slate-600">Archive completed transactions, generate backup records, and maintain system history.</p>
                  <Button variant="outline" className="mt-3 rounded-2xl border-slate-300" onClick={() => navigate('/reports')}>View reports</Button>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-lg font-bold">System Reset</h3>
                  <p className="mt-1 text-sm text-slate-600">Perform a full system reset including clearing caches and resetting session data.</p>
                  <Button variant="outline" className="mt-3 rounded-2xl border-red-300 text-red-700 hover:bg-red-50" onClick={() => { if (window.confirm('Are you sure you want to reset system data? This cannot be undone.')) { localStorage.clear(); window.location.reload(); } }}>Reset system</Button>
                </div>
              </div>
            );
          } else if (panel.action === 'product-management') {
            body = (
              <div className="mt-4 space-y-4">
                <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
                  <h3 className="text-lg font-bold">Store settings</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Input label="Store name" value={form.name} onChange={(event) => setBusiness({ name: event.target.value })} />
                    <Input label="Currency" value={form.currency} onChange={(event) => setBusiness({ currency: event.target.value })} />
                    <Input label="Phone" value={form.phone} onChange={(event) => setBusiness({ phone: event.target.value })} />
                    <Input label="Email" value={form.email} onChange={(event) => setBusiness({ email: event.target.value })} />
                    <div className="sm:col-span-2"><Input label="Address" value={form.address} onChange={(event) => setBusiness({ address: event.target.value })} /></div>
                  </div>
                  <Button className="mt-4 rounded-2xl bg-red-600 hover:bg-red-700" onClick={() => saveSettings.mutate()} loading={saveSettings.isPending}>Save store settings</Button>
                </section>

                <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">Product catalog</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" className="rounded-2xl" onClick={() => setEditing('new')}><Plus size={16} className="mr-2" />New product</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={() => fileInput.current?.click()}><Upload size={16} className="mr-2" />Import</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={exportProducts}><Download size={16} className="mr-2" />Export</Button>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
                  <h3 className="text-lg font-bold mb-3">Products ({visibleProducts.length})</h3>
                  {visibleProducts.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No products found</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {visibleProducts.map((product) => (
                        <div key={product.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{product.name}</p>
                            <p className="text-xs text-slate-500">{product.sku}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-brand-700">{product.sellingPrice?.toFixed(2)} {form.currency}</span>
                            {editing === product.id ? (
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={draft.sellingPrice ?? product.sellingPrice}
                                  onChange={(e) => setDraft((d) => ({ ...d, sellingPrice: Number(e.target.value) }))}
                                  className="h-8 w-20 rounded-xl border border-brand-300 bg-white px-2 text-sm text-right focus:border-brand-500 focus:outline-none"
                                  autoFocus
                                />
                                <button type="button" onClick={() => updateProduct.mutate({ id: product.id, data: draft })} className="h-8 w-8 rounded-xl bg-brand-600 text-white hover:bg-brand-700"><Save size={14} /></button>
                                <button type="button" onClick={() => { setEditing(null); setDraft({}); }} className="h-8 w-8 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300"><Edit3 size={14} /></button>
                              </div>
                            ) : (
                              <>
                                <button type="button" onClick={() => { setEditing(product.id); setDraft({ sellingPrice: product.sellingPrice }); }} className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100"><Edit3 size={14} /></button>
                                <button type="button" onClick={() => deleteProduct.mutate(product.id)} className="h-8 w-8 rounded-xl text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".json"
                  onChange={importProducts}
                  className="hidden"
                />
              </div>
            );
          }

          return (
            <div key={panel.action} className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-lg shadow-slate-200/50 transition hover:-translate-y-1 hover:shadow-xl">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><Icon size={20} /></span>
              <h2 className="mt-4 font-bold">{panel.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{panel.description}</p>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
};
