import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Search } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import type { Product, Supplier } from '../../lib/types';

export const IncomingPage: React.FC = () => {
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const queryClient = useQueryClient();
  const suppliers = useQuery<Supplier[]>({ queryKey: ['incoming-suppliers'], queryFn: () => api.get('/suppliers', { params: { limit: 200, isActive: true } }).then((res) => res.data.data) });
  const products = useQuery<Product[]>({ queryKey: ['incoming-products', productSearch], queryFn: () => api.get('/products', { params: { limit: 20, status: 'ACTIVE', search: productSearch || undefined } }).then((res) => res.data.data) });
  const receive = useMutation({
    mutationFn: () => api.post('/inventory/receive', { supplierId, productId, quantity: Number(quantity) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incoming-products'] });
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      setProductId('');
      setProductSearch('');
      setQuantity('');
    },
  });
  const selectedProduct = products.data?.find((product) => product.id === productId);
  const canSave = Boolean(supplierId && productId && Number.isInteger(Number(quantity)) && Number(quantity) > 0);

  return <div className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-sm font-semibold uppercase tracking-widest text-red-700">Inventory</p><h1 className="text-3xl font-bold text-slate-900">Incoming Goods</h1><p className="mt-1 text-sm text-slate-500">Select a supplier, choose a product, enter the quantity, and save.</p></header>
    <section className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-200/50">
      <label className="block text-sm font-semibold text-slate-700">Supplier<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl bg-slate-100 px-3"><option value="">Select supplier</option>{(suppliers.data || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label className="mt-5 block text-sm font-semibold text-slate-700">Search product<div className="relative mt-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600" size={18} /><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(''); }} placeholder="Search by product name or SKU" className="h-12 w-full rounded-2xl bg-slate-100 pl-10 pr-3 outline-none focus:ring-2 focus:ring-red-300" /></div></label>
      {productSearch && <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-slate-200">{(products.data || []).map((product) => <button type="button" key={product.id} onClick={() => { setProductId(product.id); setProductSearch(product.name); }} className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-red-50 ${product.id === productId ? 'bg-red-50' : ''}`}><span className="font-semibold">{product.name}</span><span className="ml-2 text-xs text-slate-500">{product.sku} · Stock {product.stockQuantity}</span></button>)}{!products.data?.length && <p className="p-4 text-sm text-slate-500">No products found.</p>}</div>}
      {selectedProduct && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">Selected: <strong>{selectedProduct.name}</strong> · Current stock {selectedProduct.stockQuantity}</p>}
      <label className="mt-5 block text-sm font-semibold text-slate-700">Quantity<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="30" className="mt-2 h-12 w-full rounded-2xl bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-red-300" /></label>
      {receive.isError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{handleApiError(receive.error)}</p>}
      {receive.isSuccess && <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">Incoming goods saved and stock updated.</p>}
      <Button className="mt-6 h-12 w-full rounded-2xl bg-red-600 hover:bg-red-700" disabled={!canSave} loading={receive.isPending} onClick={() => receive.mutate()}><PackagePlus className="mr-2" size={18} />Save incoming goods</Button>
    </section>
  </div>;
};
