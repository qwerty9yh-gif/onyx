import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Pencil, Search } from 'lucide-react';
import { api } from '../../lib/api';
import type { Product } from '../../lib/types';
import { Button } from '../../components/ui/Button';

const stockState = (product: Product) => product.stockQuantity <= 0 ? ['Out of stock', 'bg-red-100 text-red-700'] : product.stockQuantity <= (product.minimumStock || 10) ? ['Low stock', 'bg-amber-100 text-amber-800'] : ['In stock', 'bg-emerald-100 text-emerald-700'];

export const InventoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { data: products = [], isLoading } = useQuery<Product[]>({ queryKey: ['inventory-products', search], queryFn: () => api.get('/products', { params: { search: search || undefined, status: 'ACTIVE', limit: 200 } }).then((res) => res.data.data) });
  const counts = useMemo(() => ({ total: products.length, low: products.filter((product) => product.stockQuantity > 0 && product.stockQuantity <= (product.minimumStock || 10)).length, out: products.filter((product) => product.stockQuantity <= 0).length }), [products]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Inventory</p>
        <h1 className="text-3xl font-bold">Stock overview</h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl bg-white/80 p-4 shadow-lg"><p className="text-xs text-slate-500">Products</p><strong className="text-2xl">{counts.total}</strong></div>
        <div className="rounded-3xl bg-amber-50 p-4 shadow-lg"><p className="text-xs text-amber-700">Low stock</p><strong className="text-2xl text-amber-800">{counts.low}</strong></div>
        <div className="rounded-3xl bg-red-50 p-4 shadow-lg"><p className="text-xs text-red-700">Out of stock</p><strong className="text-2xl text-red-700">{counts.out}</strong></div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-600" size={19} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products, SKU, or barcode" className="h-14 w-full rounded-2xl border-0 bg-white/80 pl-12 pr-4 shadow-lg outline-none focus:ring-2 focus:ring-sky-300" />
      </div>

      {isLoading ? (
        <div className="rounded-3xl bg-white p-10 text-center">Loading inventory...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const [label, tone] = stockState(product);
            return (
              <article key={product.id} className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-lg shadow-slate-200/50">
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Package /></span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>
                </div>
                <h2 className="mt-4 text-lg font-bold">{product.name}</h2>
                <p className="text-sm text-slate-500">{product.category?.name || 'Uncategorized'} · SKU {product.sku}</p>
                {product.barcode && <p className="text-xs text-slate-400">Barcode: {product.barcode}</p>}
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Selling price</p>
                    <p className="text-lg font-bold text-sky-800">{product.sellingPrice > 0 ? `GH₵ ${product.sellingPrice.toFixed(2)}` : '—'}</p>
                    <p className="text-xs text-slate-500">Stock <strong>{product.stockQuantity}</strong> · Min {product.minimumStock || 0}</p>
                  </div>
                  <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => navigate(`/products/${product.id}/edit`)}>
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                </div>
              </article>
            );
          })}
          {products.length === 0 && (
            <div className="col-span-full rounded-3xl bg-white p-10 text-center text-slate-500">No products match your search.</div>
          )}
        </div>
      )}
    </div>
  );
};