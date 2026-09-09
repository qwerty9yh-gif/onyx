import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { Product, Supplier, Purchase } from '../../lib/types';

interface DraftItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export const PurchaseForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState('');

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers', { params: { isActive: 'true', limit: 100 } }).then((res) => res.data.data),
  });

  const { data: foundProducts } = useQuery<Product[]>({
    queryKey: ['purchase-product-search', search],
    queryFn: () => api.get('/products', { params: { search, status: 'ACTIVE', limit: 10 } }).then((res) => res.data.data),
    enabled: search.trim().length >= 2,
  });

  const { data: existing } = useQuery<Purchase>({
    queryKey: ['purchase', id],
    queryFn: () => api.get(`/purchases/${id}`).then((res) => res.data.data),
    enabled: isEdit,
  });

  React.useEffect(() => {
    if (existing) {
      setSupplierId(existing.supplierId || '');
      setOrderNumber(existing.orderNumber || '');
      setNotes(existing.notes || '');
      setItems(
        (existing.items || []).map((it) => ({
          productId: it.productId,
          name: it.product?.name || it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      );
    }
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/purchases', {
        supplierId: supplierId || undefined,
        orderNumber: orderNumber || undefined,
        notes: notes || undefined,
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      navigate('/purchases');
    },
  });

  const addProduct = (product: Product) => {
    setItems((prev) => {
      const found = prev.find((it) => it.productId === product.id);
      if (found) {
        return prev.map((it) => (it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it));
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, unitPrice: product.costPrice || 0 }];
    });
    setSearch('');
  };

  const updateItem = (productId: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.productId === productId ? { ...it, ...patch } : it)));
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Purchase' : 'New Purchase'}</h1>
        <p className="text-sm text-gray-600 mt-1">{isEdit ? 'Update purchase order details' : 'Create a purchase order to receive stock'}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500">
              <option value="">Select Supplier</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Order Number" placeholder="PO-001 (optional)" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Add Products</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
            />
            {search.trim().length >= 2 && foundProducts && foundProducts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {foundProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm text-gray-500 ml-2">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <PurchaseItemsTable items={items} subtotal={subtotal} onUpdate={updateItem} onRemove={removeItem} />

        <Input label="Notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {createMutation.isError && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {handleApiError(createMutation.error)}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={items.length === 0}>
            <Plus size={16} className="mr-2" /> {isEdit ? 'Save Purchase' : 'Create Purchase'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/purchases')}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

interface ItemsTableProps {
  items: DraftItem[];
  subtotal: number;
  onUpdate: (productId: string, patch: Partial<DraftItem>) => void;
  onRemove: (productId: string) => void;
}

const PurchaseItemsTable: React.FC<ItemsTableProps> = ({ items, subtotal, onUpdate, onRemove }) => (
  <div className="border rounded-lg overflow-hidden">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Product</th>
          <th className="px-4 py-2 text-center font-medium text-gray-500">Qty</th>
          <th className="px-4 py-2 text-center font-medium text-gray-500">Unit Cost</th>
          <th className="px-4 py-2 text-right font-medium text-gray-500">Line Total</th>
          <th className="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {items.length === 0 ? (
          <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No items added yet</td></tr>
        ) : (
          items.map((it) => (
            <tr key={it.productId}>
              <td className="px-4 py-2 font-medium">{it.name}</td>
              <td className="px-4 py-2 text-center">
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => onUpdate(it.productId, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-20 px-2 py-1 border rounded text-center"
                />
              </td>
              <td className="px-4 py-2 text-center">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => onUpdate(it.productId, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="w-24 px-2 py-1 border rounded text-center"
                />
              </td>
              <td className="px-4 py-2 text-right font-medium">${(it.quantity * it.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2 text-right">
                <button type="button" onClick={() => onRemove(it.productId)} className="p-1 text-red-600 hover:text-red-800">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
      {items.length > 0 && (
        <tfoot className="bg-gray-50 border-t">
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right font-medium">Subtotal</td>
            <td className="px-4 py-2 text-right font-bold">${subtotal.toFixed(2)}</td>
            <td></td>
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

