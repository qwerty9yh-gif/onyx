import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Product, Customer } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Plus, Minus, Search, Receipt, X } from 'lucide-react';
import { roundToTwoDecimals, calculateTotal } from '../../lib/helpers';

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  taxRate: number;
}

export const SalesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'QR' | 'OTHER'>('CASH');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products-search', search],
    queryFn: () => api.get('/products', { params: { search, status: 'ACTIVE' } }).then((res) => res.data.data),
    enabled: !!search,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => api.get('/customers', { params: { search: customerSearch, limit: 50 } }).then((res) => res.data.data),
    enabled: !!customerSearch,
  });

  const saleMutation = useMutation({
    mutationFn: (data: unknown) => api.post('/sales', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setCart([]);
      setCustomerId(null);
      setCustomerSearch('');
      setAmountReceived('');
    },
  });

  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      setCart(cart.map((c) => c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, {
        productId: product.id, name: product.name, sku: product.sku,
        unitPrice: product.sellingPrice, quantity: 1, discount: 0,
        taxRate: product.taxRate || 0,
      }]);
    }
    setSearch('');
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(cart.map((c) => c.productId === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalDiscount = cart.reduce((sum, item) => sum + item.discount, 0);
  const totalTax = cart.reduce((sum, item) => sum + ((item.unitPrice * item.quantity - item.discount) * item.taxRate), 0);
  const grandTotal = calculateTotal(roundToTwoDecimals(subtotal), roundToTwoDecimals(totalDiscount), roundToTwoDecimals(totalTax));
  const received = parseFloat(amountReceived) || 0;
  const change = received >= grandTotal ? received - grandTotal : 0;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    saleMutation.mutate({
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        discount: item.discount,
        discountType: 'fixed',
      })),
      customerId: customerId || undefined,
      paymentMethod,
      amountReceived: received,
      notes: '',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-md focus:ring-2 focus:ring-red-500"
          />
        </div>
        {search && products && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {products.map((p) => (
              <div
                key={p.id}
                className="border rounded p-3 cursor-pointer hover:bg-gray-50"
                onClick={() => p.stockQuantity > 0 && addToCart(p)}
              >
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-gray-500">${p.sellingPrice.toFixed(2)} | Stock: {p.stockQuantity}</p>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {cart.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded bg-white">
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">{item.sku}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.productId, -1)} className="p-1 border rounded"><Minus size={16} /></button>
                <span className="w-6 text-center">{item.quantity}</span>
                <button onClick={() => updateQty(item.productId, 1)} className="p-1 border rounded"><Plus size={16} /></button>
              </div>
              <div className="w-20 text-right">${(item.unitPrice * item.quantity).toFixed(2)}</div>
              <button onClick={() => removeFromCart(item.productId)} className="p-1 text-red-600"><X size={16} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <input
              type="text"
              placeholder="Search customer..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              onClick={() => setShowCustomerModal(true)}
              className="w-full px-3 py-2 border rounded-md"
            />
            {customerId && (<button onClick={() => { setCustomerId(null); setCustomerSearch(''); }} className="text-red-600 text-xs mt-1">Clear</button>)}
            <Modal open={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Select Customer">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {customers?.map((c) => (
                  <div key={c.id} className="p-2 border rounded cursor-pointer hover:bg-gray-50"
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); setShowCustomerModal(false); }}>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-gray-500">{c.phone}</p>
                  </div>
                ))}
              </div>
            </Modal>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="w-full px-3 py-2 border rounded-md">
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
              <option value="QR">QR</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between">Subtotal: ${roundToTwoDecimals(subtotal).toFixed(2)}</div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">Total: ${grandTotal.toFixed(2)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount Received</label>
            <input type="number" step="0.01" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
          </div>
          {grandTotal > 0 && (<div className="flex justify-between text-lg font-bold">Change: ${change.toFixed(2)}</div>)}
          <Button variant="primary" className="w-full" loading={saleMutation.isPending} onClick={handleCheckout} disabled={cart.length === 0 || !amountReceived || parseFloat(amountReceived) < grandTotal}>
            <Receipt className="mr-2" size={16} /> Complete Sale
          </Button>
        </div>
      </div>
        </div>
  );
};
