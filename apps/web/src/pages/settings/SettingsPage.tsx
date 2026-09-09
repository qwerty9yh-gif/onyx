import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, LogOut, Plus, Save, Search, Settings2, Shield, Store, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import type { Business, Category, Product } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface BusinessForm extends Business { }
const EMPTY: BusinessForm = { id: 'default', name: '', phone: '', email: '', address: '', taxRate: 0, currency: 'GHS', receiptPrefix: 'REC' };

type SortMode = 'name' | 'price' | 'category';
type ProductDraft = Partial<Omit<Product, 'categoryId'>> & { categoryId?: string | null };
type SettingsPanel = { icon: LucideIcon; title: string; text: string };

const settingsPanels: SettingsPanel[] = [
  { icon: Store, title: 'Store Settings', text: 'Business details, currency, tax, and receipt settings' },
  { icon: Shield, title: 'Profile', text: 'User and role management' },
  { icon: Settings2, title: 'Theme', text: 'Red and white application appearance' },
  { icon: Settings2, title: 'Printer Settings', text: 'Receipt printer and diagnostics' },
  { icon: Download, title: 'Backup', text: 'Export and restore local product data' },
  { icon: LogOut, title: 'Logout', text: 'End the current session' },
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

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings').then((res) => res.data.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['settings-products'], queryFn: () => api.get('/products', { params: { limit: 200 } }).then((res) => res.data.data) });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: () => api.get('/categories').then((res) => res.data.data) });

  useEffect(() => { if (settings?.business) setForm({ ...EMPTY, ...settings.business }); }, [settings]);

  const saveSettings = useMutation({ mutationFn: () => api.put('/settings', { business: form }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }) });
  const updateProduct = useMutation({ mutationFn: ({ id, data }: { id: string; data: ProductDraft }) => api.put(`/products/${id}`, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings-products'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); setEditing(null); } });
  const deleteProduct = useMutation({ mutationFn: (id: string) => api.delete(`/products/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-products'] }) });

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

  return <div className="mx-auto max-w-7xl space-y-6"><header><p className="text-sm font-semibold uppercase tracking-widest text-red-700">Settings</p><h1 className="text-3xl font-bold">Management center</h1></header><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{settingsPanels.map(({ icon: Icon, title, text }) => <button type="button" key={title} onClick={() => title === 'Profile' ? window.location.assign('/users') : title === 'Backup' ? exportProducts() : undefined} className="rounded-3xl border border-white/80 bg-white/90 p-5 text-left shadow-lg shadow-slate-200/50 transition hover:-translate-y-1 hover:shadow-xl"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700"><Icon size={20} /></span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></button>)}</div><section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50"><h2 className="text-2xl font-bold">Store settings</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Input label="Store name" value={form.name} onChange={(event) => setBusiness({ name: event.target.value })} /><Input label="Currency" value={form.currency} onChange={(event) => setBusiness({ currency: event.target.value })} /><Input label="Phone" value={form.phone} onChange={(event) => setBusiness({ phone: event.target.value })} /><Input label="Email" value={form.email} onChange={(event) => setBusiness({ email: event.target.value })} /><div className="sm:col-span-2"><Input label="Address" value={form.address} onChange={(event) => setBusiness({ address: event.target.value })} /></div></div><Button className="mt-5 rounded-2xl bg-red-600 hover:bg-red-700" onClick={() => saveSettings.mutate()} loading={saveSettings.isPending}>Save store settings</Button></section><section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-red-700">Products</p><h2 className="text-2xl font-bold">Product management</h2></div><div className="flex flex-wrap gap-2"><Button className="rounded-2xl bg-red-600 hover:bg-red-700" onClick={() => window.location.assign('/products/new')}><Plus className="mr-2" size={16} />Add product</Button><Button variant="outline" className="rounded-2xl" onClick={exportProducts}><Download size={16} /></Button><Button variant="outline" className="rounded-2xl" onClick={() => fileInput.current?.click()}><Upload size={16} /></Button><input ref={fileInput} type="file" accept="application/json" hidden onChange={importProducts} /></div></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px_180px]"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" className="h-12 w-full rounded-2xl border-0 bg-slate-100 pl-10 pr-3 outline-none focus:ring-2 focus:ring-red-300" /></div><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-12 rounded-2xl border-0 bg-slate-100 px-3"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-12 rounded-2xl border-0 bg-slate-100 px-3"><option value="name">Sort: Name</option><option value="price">Sort: Price</option><option value="category">Sort: Category</option></select><div className="flex gap-2"><input value={bulkPercent} onChange={(event) => setBulkPercent(event.target.value)} placeholder="% change" type="number" className="h-12 min-w-0 w-full rounded-2xl border-0 bg-slate-100 px-3" /><button type="button" onClick={applyBulkPrice} className="rounded-2xl bg-slate-900 px-3 text-white" title="Apply bulk price change">%</button></div></div><div className="mt-5 space-y-3">{visibleProducts.map((product) => { const isEditing = editing === product.id; return <div key={product.id} className="grid gap-3 rounded-2xl bg-red-50/70 p-4 md:grid-cols-[1fr_150px_130px_180px_auto] md:items-center"><div><p className="font-bold">{product.name}</p><p className="text-xs text-slate-500">{product.sku}</p></div>{isEditing ? <input type="number" step="0.01" value={Number(draft.sellingPrice ?? product.sellingPrice)} onChange={(event) => setDraft({ ...draft, sellingPrice: Number(event.target.value) })} className="h-10 rounded-xl border-0 bg-white px-3" /> : <strong className="text-red-700">GH₵{product.sellingPrice.toFixed(2)}</strong>}{isEditing ? <input type="number" value={Number(draft.stockQuantity ?? product.stockQuantity)} onChange={(event) => setDraft({ ...draft, stockQuantity: Number(event.target.value) })} className="h-10 rounded-xl border-0 bg-white px-3" /> : <span className="text-sm">Stock: {product.stockQuantity}</span>}{isEditing ? <select value={String(draft.categoryId ?? product.categoryId ?? '')} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null })} className="h-10 rounded-xl border-0 bg-white px-3"><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select> : <span className="text-sm text-slate-500">{product.category?.name || 'Uncategorized'}</span>}<div className="flex justify-end gap-2">{isEditing ? <button type="button" onClick={() => updateProduct.mutate({ id: product.id, data: draft })} className="rounded-xl bg-emerald-600 p-2 text-white" title="Save"><Save size={16} /></button> : <button type="button" onClick={() => { setEditing(product.id); setDraft(product); }} className="rounded-xl bg-white p-2 text-red-700" title="Edit"><Edit3 size={16} /></button>}<button type="button" onClick={() => window.confirm(`Delete ${product.name}?`) && deleteProduct.mutate(product.id)} className="rounded-xl bg-white p-2 text-red-600" title="Delete"><Trash2 size={16} /></button></div></div>; })}</div>{saveSettings.isError && <p className="mt-3 text-sm text-red-600">{handleApiError(saveSettings.error)}</p>}</section></div>;
};
