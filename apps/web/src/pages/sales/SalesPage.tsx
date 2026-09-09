import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, CheckCircle, FileText, Minus, Plus, Printer, Search, ShoppingCart, Trash2, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../lib/api';
import type { Product, Sale, User } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { clearCart, loadCart, loadProducts, loadQueue, queueSale, removeQueuedSale, saveCart, saveProducts } from '../../lib/offline';
import { printInvoice, printReceipt, InvoiceData, ReceiptData } from '../../lib/printer';

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRate: number;
}

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QR';

const money = (value: number) => `$${value.toFixed(2)}`;

export const SalesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>(() => loadCart<CartItem>());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const queryClient = useQueryClient();

  const { data: me } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });

  useEffect(() => saveCart(cart), [cart]);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products-search', search],
    queryFn: async () => {
      if (!online) return loadProducts<Product>().filter((product) => !search || product.name.toLowerCase().includes(search.toLowerCase()) || product.sku.toLowerCase().includes(search.toLowerCase()));
      const result = await api.get('/products', { params: { search: search || undefined, status: 'ACTIVE', limit: 40 } });
      const data = result.data.data as Product[];
      saveProducts(data);
      return data;
    },
    enabled: true,
  });

  useEffect(() => {
    if (!online) return;
    const flushQueue = async () => {
      for (const sale of loadQueue()) {
        try {
          await api.post('/sales', sale.payload);
          removeQueuedSale(sale.id);
        } catch {
          break;
        }
      }
    };
    void flushQueue();
  }, [online]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);
  const tax = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity * item.taxRate, 0), [cart]);
  const total = Number((subtotal + tax).toFixed(2));
  const received = Number(amountReceived) || 0;
  const change = Math.max(0, received - total);

  const addToCart = (product: Product) => {
    if (product.stockQuantity <= 0) return;
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { productId: product.id, name: product.name, sku: product.sku, unitPrice: product.sellingPrice, quantity: 1, taxRate: product.taxRate || 0 }];
    });
    setSearch('');
  };

  const updateQuantity = (productId: string, amount: number) => {
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const quantity = item.quantity + amount;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const buildReceiptData = (receiptNumber: string, markPaid: boolean): ReceiptData => ({
    storeName: 'ONYX POS System',
    receiptNumber,
    cashier: me ? `${me.firstName} ${me.lastName}` : 'ONYX POS',
    createdAt: new Date().toLocaleString(),
    lines: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.unitPrice * item.quantity })),
    subtotal,
    discount: 0,
    tax,
    total,
    paymentMethod,
    amountReceived: markPaid ? received : 0,
    change: markPaid ? change : 0,
  });

  const buildInvoiceData = (invoiceNumber: string): InvoiceData => ({
    storeName: 'ONYX POS System',
    invoiceNumber,
    cashier: me ? `${me.firstName} ${me.lastName}` : 'ONYX POS',
    createdAt: new Date().toLocaleString(),
    lines: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.unitPrice * item.quantity })),
    subtotal,
    discount: 0,
    tax,
    total,
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity, discount: 0, discountType: 'percentage' })),
        paymentMethod,
        amountReceived: received,
        markPaid: true,
      };
      if (!online) {
        queueSale(payload);
        return { receiptNumber: `OFF-${Date.now()}` };
      }
      const result = await api.post('/sales', payload);
      return { receiptNumber: result.data.data.receiptNumber as string };
    },
    onSuccess: (res) => {
      const receiptNumber = res.receiptNumber;
      if (!receiptNumber.startsWith('OFF-')) {
        printReceipt(buildReceiptData(receiptNumber, true));
      }
      clearCart();
      setCart([]);
      setAmountReceived('');
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const saveUnpaidMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity, discount: 0, discountType: 'percentage' })),
        paymentMethod,
        amountReceived: 0,
        markPaid: false,
      };
      if (!online) {
        queueSale(payload);
        return { receiptNumber: `OFF-${Date.now()}` };
      }
      const result = await api.post('/sales', payload);
      return { receiptNumber: result.data.data.receiptNumber as string };
    },
    onSuccess: (res) => {
      const receiptNumber = res.receiptNumber;
      if (!receiptNumber.startsWith('OFF-')) {
        printInvoice(buildInvoiceData(receiptNumber));
      }
      clearCart();
      setCart([]);
      setAmountReceived('');
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Point of sale</p>
          <h1 className="text-3xl font-bold text-slate-900">Make a sale</h1>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? 'Online' : 'Offline mode'}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <section className="space-y-4">
          <div className="relative rounded-3xl border border-white/80 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-sky-600" size={21} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or scan barcode" autoFocus className="h-14 w-full rounded-2xl border-0 bg-sky-50/80 pl-12 pr-4 text-lg outline-none ring-2 ring-transparent transition focus:ring-sky-300" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {productsLoading && <div className="col-span-full rounded-3xl bg-white/70 p-10 text-center text-slate-500">Loading products...</div>}
            {!productsLoading && products.map((product) => (
              <button type="button" key={product.id} onClick={() => addToCart(product)} disabled={product.stockQuantity <= 0} className="group min-h-36 rounded-3xl border border-white/80 bg-white/80 p-4 text-left shadow-lg shadow-slate-200/50 transition hover:-translate-y-1 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><ShoppingCart size={20} /></span>
                <span className="block truncate font-bold text-slate-800">{product.name}</span>
                <span className="mt-1 block text-sm text-slate-500">{money(product.sellingPrice)} · {product.stockQuantity} in stock</span>
              </button>
            ))}
            {!productsLoading && !products.length && <div className="col-span-full rounded-3xl bg-white/70 p-10 text-center text-slate-500">Search for a product to begin.</div>}
          </div>
        </section>

        <aside className="rounded-3xl border border-white/80 bg-white/85 p-5 shadow-2xl shadow-slate-300/40 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold text-sky-700">Current order</p><h2 className="text-2xl font-bold">Cart <span className="text-slate-400">({cart.length})</span></h2></div><button type="button" onClick={() => { clearCart(); setCart([]); }} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Clear cart"><Trash2 size={18} /></button></div>
          <div className="mb-5 max-h-[38vh] space-y-3 overflow-y-auto pr-1">
            {cart.map((item) => <div key={item.productId} className="rounded-2xl bg-sky-50/80 p-3"><div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{money(item.unitPrice)} each</p></div><strong>{money(item.unitPrice * item.quantity)}</strong></div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => updateQuantity(item.productId, -1)} className="rounded-xl bg-white p-2 text-sky-700 shadow-sm"><Minus size={16} /></button><span className="min-w-8 text-center font-bold">{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.productId, 1)} className="rounded-xl bg-white p-2 text-sky-700 shadow-sm"><Plus size={16} /></button></div></div>)}
            {!cart.length && <div className="rounded-2xl border border-dashed border-sky-200 p-8 text-center text-slate-500">Your cart is ready.</div>}
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between"><span>Tax</span><strong>{money(tax)}</strong></div><div className="flex justify-between pt-2 text-2xl font-bold"><span>Total</span><strong className="text-sky-700">{money(total)}</strong></div></div>
          <div className="mt-5 grid grid-cols-2 gap-2">{(['CASH', 'CARD', 'TRANSFER', 'QR'] as PaymentMethod[]).map((method) => <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`rounded-2xl px-3 py-3 text-sm font-bold transition ${paymentMethod === method ? 'bg-sky-600 text-white shadow-lg shadow-sky-200' : 'bg-slate-100 text-slate-600'}`}>{method === 'CASH' ? <Banknote className="mx-auto mb-1" size={18} /> : <CreditCard className="mx-auto mb-1" size={18} />}{method}</button>)}</div>
          <input type="number" min="0" step="0.01" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} placeholder="Amount received" className="mt-4 h-14 w-full rounded-2xl border-0 bg-slate-100 px-4 text-lg outline-none ring-2 ring-transparent focus:ring-sky-300" />
          <div className="mt-3 flex justify-between text-lg font-bold"><span>Change</span><span className="text-emerald-600">{money(change)}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button className="h-14 rounded-2xl bg-emerald-600 text-lg font-bold hover:bg-emerald-700" loading={markPaidMutation.isPending} disabled={!cart.length || received < total} onClick={() => markPaidMutation.mutate()}><CheckCircle className="mr-2" size={20} />Mark as Paid</Button>
            <Button className="h-14 rounded-2xl bg-amber-500 text-lg font-bold hover:bg-amber-600" loading={saveUnpaidMutation.isPending} disabled={!cart.length} onClick={() => saveUnpaidMutation.mutate()}><FileText className="mr-2" size={20} />Save as Unpaid</Button>
          </div>
          {markPaidMutation.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">Sale could not be completed. It remains in your cart.</p>}
          {saveUnpaidMutation.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">Invoice could not be saved. It remains in your cart.</p>}
        </aside>
      </div>
    </div>
  );
};
