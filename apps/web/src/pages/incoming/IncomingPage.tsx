import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Truck, History as HistoryIcon, Search, Plus, Minus, Trash2, PackagePlus,
  Printer, Eye, Wifi, WifiOff, CheckCircle2, ClipboardList, Clock, RefreshCw,
} from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import {
  loadCachedIncomingBatches, loadPendingIncomingBatches, queueIncomingBatch,
  removePendingIncomingBatch, markPendingIncomingBatchFailed, saveCachedIncomingBatches,
  loadProducts, saveProducts, markPrintedBatchReport,
  type OfflineIncomingBatch,
} from '../../lib/offline';
import { printReceivingReport, type ReceivingReport } from '../../lib/printer';
import type { InventoryBatch, Product, Supplier } from '../../lib/types';

interface CartItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  stockBefore: number;
}

const staffName = (): string => {
  const user = getUser();
  return user ? `${user.firstName} ${user.lastName}`.trim() : 'Staff';
};

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function buildReport(batchNumber: string, createdAt: string, lines: Array<{ name: string; quantity: number }>): ReceivingReport {
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  return {
    storeName: 'ONYX LOUNGE / PUB',
    batchNumber,
    createdAt: fmtDate(createdAt),
    time: fmtTime(createdAt),
    cashier: staffName(),
    lines,
    totalProducts: lines.length,
    totalUnits,
  };
}

export const IncomingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'receive' | 'history'>('receive');
  const [online, setOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState('');

  // Incoming cart is separate from the Sales cart.
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [supplierId, setSupplierId] = useState('');

  // Post-commit report dialogs.
  const [successReport, setSuccessReport] = useState<ReceivingReport | null>(null);
  const [successOffline, setSuccessOffline] = useState(false);
  const [viewReport, setViewReport] = useState<ReceivingReport | null>(null);

  // Receiving history.
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [detail, setDetail] = useState<{ batch: InventoryBatch | null; offlineBatch: OfflineIncomingBatch | null } | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const productOptions = useQuery<Product[]>({
    queryKey: ['incoming-products', productSearch],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = loadProducts<Product>();
        const term = productSearch.toLowerCase();
        return cached.filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)).slice(0, 40);
      }
      const result = await api.get('/products', { params: { search: productSearch || undefined, status: 'ACTIVE', limit: 40 } });
      const data = result.data.data as Product[];
      saveProducts(data);
      return data;
    },
    staleTime: 15000,
  });

  const suppliers = useQuery<Supplier[]>({
    queryKey: ['incoming-suppliers'],
    queryFn: () => api.get('/suppliers', { params: { limit: 200, isActive: true } }).then((res) => res.data.data),
    enabled: navigator.onLine,
  });

  const addToCart = (): void => {
    if (!selected) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) return;
    setCart((current) => {
      const existing = current.find((item) => item.productId === selected.id);
      if (existing) return current.map((item) => item.productId === selected.id ? { ...item, quantity: item.quantity + qty } : item);
      return [...current, { productId: selected.id, name: selected.name, sku: selected.sku, quantity: qty, stockBefore: selected.stockQuantity || 0 }];
    });
    setSelected(null);
    setQuantity('');
    setProductSearch('');
    setNotice(`Added ${selected.name} to the incoming cart`);
    window.setTimeout(() => setNotice(''), 2200);
  };

  const changeQty = (productId: string, delta: number): void => {
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item];
      const next = item.quantity + delta;
      return next > 0 ? [{ ...item, quantity: next }] : [];
    }));
  };

  const setQty = (productId: string, value: string): void => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return;
    setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity: parsed } : item));
  };

  const totalUnits = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const pendingBatches = loadPendingIncomingBatches();
  const cachedBatches = loadCachedIncomingBatches();
  const commit = useMutation({
    mutationFn: async () => {
      const items = cart.map((item) => ({ productId: item.productId, quantity: item.quantity }));
      if (!navigator.onLine) {
        const clientBatchId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const snapshot = cart.map((item) => ({ productId: item.productId, name: item.name, sku: item.sku, quantity: item.quantity, stockBefore: item.stockBefore, stockAfter: item.stockBefore + item.quantity }));
        const batch: OfflineIncomingBatch = {
          clientBatchId,
          createdAt: nowIso,
          supplierId: supplierId || null,
          staffName: staffName(),
          totalProducts: cart.length,
          totalUnits: totalUnits,
          payload: { supplierId: supplierId || null, clientBatchId, items },
          snapshot,
        };
        queueIncomingBatch(batch);
        // Reflect the new stock in the offline product cache immediately.
        const cached = loadProducts<Product>().map((product) => {
          const line = snapshot.find((s) => s.productId === product.id);
          return line ? { ...product, stockQuantity: line.stockAfter } : product;
        });
        saveProducts(cached);
        return { offline: true as const, batch };
      }
      const clientBatchId = crypto.randomUUID();
      const result = await api.post('/inventory/batches', { supplierId: supplierId || null, clientBatchId, items });
      return { offline: false as const, batch: result.data.data as InventoryBatch };
    },
    onSuccess: (res) => {
      const report = res.offline
        ? buildReport(`OFF-${res.batch.clientBatchId.slice(0, 8).toUpperCase()}`, res.batch.createdAt, res.batch.snapshot.map((s) => ({ name: s.name, quantity: s.quantity })))
        : buildReport(res.batch.batchNumber, res.batch.createdAt, (res.batch.items || []).map((item) => ({ name: item.product?.name || 'Product', quantity: item.quantity })));
      setSuccessReport(report);
      setSuccessOffline(res.offline);
      setCart([]);
      setSupplierId('');
      queryClient.invalidateQueries();
      // Auto-print the receiving report immediately - no manual step.
      printReceivingReport(report);
      markPrintedBatchReport(res.offline ? res.batch.clientBatchId : res.batch.batchNumber);
    },
    onError: (error) => {
      setNotice(`Commit failed: ${handleApiError(error)}`);
      window.setTimeout(() => setNotice(''), 4000);
    },
  });
  // Auto-sync pending offline batches when the connection returns.
  useEffect(() => {
    if (!online) return;
    const flush = async (): Promise<void> => {
      for (const pending of loadPendingIncomingBatches()) {
        try {
          await api.post('/inventory/batches', pending.payload);
          removePendingIncomingBatch(pending.clientBatchId);
        } catch (error) {
          markPendingIncomingBatchFailed(pending.clientBatchId, handleApiError(error));
          break;
        }
      }
      if (loadPendingIncomingBatches().length === 0) {
        queryClient.invalidateQueries();
        setNotice('Offline batches synced - inventory is up to date');
        window.setTimeout(() => setNotice(''), 3500);
      }
    };
    void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const history = useQuery<{ data: InventoryBatch[]; total: number; totalPages: number }>({
    queryKey: ['incoming-batches', historyPage, historySearch],
    queryFn: async () => {
      const result = await api.get('/inventory/batches', { params: { page: historyPage, limit: 20, search: historySearch || undefined } });
      saveCachedIncomingBatches((result.data.data as InventoryBatch[]).map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        createdAt: batch.createdAt,
        staffName: batch.cashier ? `${batch.cashier.firstName} ${batch.cashier.lastName}`.trim() : 'Staff',
        totalProducts: batch.totalProducts,
        totalUnits: batch.totalUnits,
        pendingSync: false,
      })));
      return result.data;
    },
    enabled: online && tab === 'history',
  });
  const openDetail = async (batchId: string): Promise<void> => {
    const pending = pendingBatches.find((b) => b.clientBatchId === batchId);
    if (pending) {
      setDetail({ batch: null, offlineBatch: pending });
      return;
    }
    if (!online) {
      const cached = cachedBatches.find((b) => b.id === batchId);
      if (cached) {
        setDetail({
          batch: {
            id: cached.id, batchNumber: cached.batchNumber, createdAt: cached.createdAt,
            totalProducts: cached.totalProducts, totalUnits: cached.totalUnits,
            cashier: { id: '', firstName: cached.staffName, lastName: '', username: '' },
            items: [],
          },
          offlineBatch: null,
        });
      }
      return;
    }
    try {
      const result = await api.get(`/inventory/batches/${batchId}`);
      setDetail({ batch: result.data.data as InventoryBatch, offlineBatch: null });
    } catch (error) {
      setNotice(handleApiError(error));
      window.setTimeout(() => setNotice(''), 3500);
    }
  };
  const detailLines: Array<{ name: string; quantity: number }> = detail
    ? detail.offlineBatch
      ? detail.offlineBatch.snapshot.map((s) => ({ name: s.name, quantity: s.quantity }))
      : (detail.batch?.items || []).map((item) => ({ name: item.product?.name || 'Product', quantity: item.quantity }))
    : [];
  const detailReport = detail ? buildReport(
    detail.offlineBatch ? `OFF-${detail.offlineBatch.clientBatchId.slice(0, 8).toUpperCase()}` : (detail.batch?.batchNumber || ''),
    detail.offlineBatch ? detail.offlineBatch.createdAt : (detail.batch?.createdAt || new Date().toISOString()),
    detailLines,
  ) : null;

  const historyCards = useMemo(() => {
    const pendingCards = pendingBatches.map((b) => ({
      key: b.clientBatchId,
      id: b.clientBatchId,
      batchNumber: `OFF-${b.clientBatchId.slice(0, 8).toUpperCase()}`,
      createdAt: b.createdAt,
      staffName: b.staffName,
      totalProducts: b.totalProducts,
      totalUnits: b.totalUnits,
      pendingSync: true,
    }));
    const synced = online && history.data
      ? history.data.data.map((b) => ({
          key: b.id, id: b.id, batchNumber: b.batchNumber, createdAt: b.createdAt,
          staffName: b.cashier ? `${b.cashier.firstName} ${b.cashier.lastName}`.trim() : 'Staff',
          totalProducts: b.totalProducts, totalUnits: b.totalUnits, pendingSync: false,
        }))
      : cachedBatches.map((b) => ({
          key: b.id, id: b.id, batchNumber: b.batchNumber, createdAt: b.createdAt,
          staffName: b.staffName, totalProducts: b.totalProducts, totalUnits: b.totalUnits, pendingSync: false,
        }));
    return [...pendingCards, ...synced];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, history.data, historyPage, historySearch]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Inventory</p>
          <h1 className="text-3xl font-bold text-slate-900">Incoming Goods</h1>
          <p className="mt-1 text-sm text-slate-500">Receive deliveries in batches. Stock updates instantly and a report prints automatically.</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-800'}`}>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          {online ? 'Online' : `Offline${pendingBatches.length ? ` - ${pendingBatches.length} pending sync` : ''}`}
        </div>
      </header>

      <div className="flex gap-2 rounded-2xl bg-white/80 p-1.5 shadow-lg shadow-slate-200/50">
        <button type="button" onClick={() => setTab('receive')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === 'receive' ? 'onyx-brand-gradient text-white shadow-glow-red' : 'text-slate-600 hover:bg-red-50'}`}>
          <Truck size={18} /> Receive
        </button>
        <button type="button" onClick={() => setTab('history')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === 'history' ? 'onyx-brand-gradient text-white shadow-glow-red' : 'text-slate-600 hover:bg-red-50'}`}>
          <HistoryIcon size={18} /> History
        </button>
      </div>

      {notice && <div className="rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-glow-red" role="status">{notice}</div>}
      {pendingBatches.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800" role="status">
          <ClipboardList size={15} className="mr-2 inline" />
          {pendingBatches.length} offline batch{pendingBatches.length === 1 ? '' : 'es'} saved locally. They will sync automatically when internet returns.
        </div>
      )}
      {tab === 'receive' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
              <label className="block text-sm font-semibold text-slate-700">
                Supplier (optional)
                <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl bg-slate-100 px-3 outline-none focus:ring-2 focus:ring-red-300">
                  <option value="">No supplier selected</option>
                  {(suppliers.data || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="mt-4 block text-sm font-semibold text-slate-700">
                  1 - Search product
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-700" size={18} />
                  <input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setSelected(null); }} placeholder="Search by product name or SKU" className="h-12 w-full rounded-2xl bg-slate-100 pl-10 pr-3 outline-none focus:ring-2 focus:ring-red-300" />
                </div>
              </label>
              {productSearch && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-slate-200">
                  {(productOptions.data || []).map((product) => (
                    <button type="button" key={product.id} onClick={() => { setSelected(product); setQuantity(''); }} className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-red-50 ${selected?.id === product.id ? 'bg-red-50' : ''}`}>
                      <span className="font-semibold">{product.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{product.sku} - Stock {product.stockQuantity}</span>
                    </button>
                  ))}
                  {productOptions.isLoading && <p className="p-4 text-sm text-slate-500">Searching...</p>}
                  {!productOptions.isLoading && !(productOptions.data || []).length && <p className="p-4 text-sm text-slate-500">No products found.</p>}
                </div>
              )}
              {selected && (
                <div className="mt-4 rounded-2xl bg-red-50/70 p-4">
                  <p className="text-sm font-bold text-slate-800">2 - {selected.name} <span className="ml-1 font-normal text-slate-500">({selected.sku})</span></p>
                  <p className="mt-1 text-xs text-slate-500">Current stock: <strong>{selected.stockQuantity}</strong> - New stock: <strong className="text-emerald-700">{(selected.stockQuantity || 0) + (parseInt(quantity, 10) || 0)}</strong></p>
                  <div className="mt-3 flex gap-2">
                    <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="3 - Quantity received" className="h-12 flex-1 rounded-2xl bg-white px-3 outline-none ring-2 ring-transparent focus:ring-red-300" />
                    <Button className="h-12 rounded-2xl" disabled={!Number.isInteger(Number(quantity)) || Number(quantity) <= 0} onClick={addToCart}>
                      <PackagePlus size={18} className="mr-2" /> Add to Incoming Cart
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
          <aside className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-200/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-700">Incoming cart</p>
                <h2 className="text-xl font-bold text-slate-900">{cart.length} product{cart.length === 1 ? '' : 's'} - {totalUnits} unit{totalUnits === 1 ? '' : 's'}</h2>
              </div>
              {cart.length > 0 && <button type="button" onClick={() => setCart([])} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Clear cart"><Trash2 size={18} /></button>}
            </div>
            <div className="mt-4 max-h-[38vh] space-y-3 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.productId} className="rounded-2xl bg-sky-50/80 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">Stock {item.stockBefore} to <strong className="text-emerald-700">{item.stockBefore + item.quantity}</strong></p>
                    </div>
                    <button type="button" onClick={() => setCart((current) => current.filter((line) => line.productId !== item.productId))} className="rounded-xl p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600" title="Remove"><Trash2 size={15} /></button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => changeQty(item.productId, -1)} className="rounded-xl bg-white p-2 text-brand-700 shadow-sm"><Minus size={15} /></button>
                    <input type="number" min="1" value={item.quantity} onChange={(event) => setQty(item.productId, event.target.value)} className="h-9 w-16 rounded-xl border border-slate-200 text-center text-sm font-bold outline-none focus:border-brand-400" />
                    <button type="button" onClick={() => changeQty(item.productId, 1)} className="rounded-xl bg-white p-2 text-brand-700 shadow-sm"><Plus size={15} /></button>
                  </div>
                </div>
              ))}
              {!cart.length && <div className="rounded-2xl border border-dashed border-sky-300 p-8 text-center text-sm text-slate-500">Search a product and tap <strong>Add to Incoming Cart</strong>. Add as many products as you need.</div>}
            </div>
            <Button className="mt-5 h-14 w-full rounded-2xl bg-emerald-600 text-base font-bold hover:bg-emerald-700" loading={commit.isPending} disabled={!cart.length} onClick={() => commit.mutate()}>
              <CheckCircle2 size={20} className="mr-2" /> Commit to Inventory
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">Stock updates instantly - report prints automatically</p>
            {commit.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{handleApiError(commit.error)}</p>}
          </aside>
        </div>
      )}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-700" size={18} />
            <input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }} placeholder="Search by batch number or staff name" className="h-12 w-full rounded-2xl border-0 bg-white/90 pl-11 pr-4 shadow-lg outline-none focus:ring-2 focus:ring-red-300" />
          </div>
          {history.isLoading && online && <div className="rounded-3xl bg-white p-10 text-center text-slate-500">Loading history...</div>}
          {!historyCards.length && !history.isLoading && <div className="rounded-3xl bg-white p-10 text-center text-slate-500">No receiving batches yet. Committed sessions will appear here as one card each.</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {historyCards.map((card) => (
              <article key={card.key} className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-lg shadow-slate-200/50">
                <div className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-brand-700"><ClipboardList size={20} /></span>
                  {card.pendingSync ? <Badge variant="warning">Pending sync</Badge> : <Badge variant="success">Synced</Badge>}
                </div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">Batch #{card.batchNumber}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Clock size={13} /> {fmtDate(card.createdAt)} - {fmtTime(card.createdAt)}</p>
                <p className="mt-1 text-sm text-slate-600">{card.totalProducts} products - {card.totalUnits} units</p>
                <p className="text-sm text-slate-500">Received by {card.staffName}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="sm" className="rounded-xl" onClick={() => void openDetail(card.id)}><Eye size={14} className="mr-1" /> Open</Button>
                  <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => void openDetail(card.id)}><Printer size={14} className="mr-1" /> Reprint</Button>
                </div>
              </article>
            ))}
          </div>
          {online && history.data && history.data.totalPages > historyPage && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setHistoryPage((page) => page + 1)}>Load older batches</Button>
            </div>
          )}
          {!online && <p className="text-center text-sm text-slate-500">Offline: showing cached batches. Reconnect to load the full history.</p>}
        </div>
      )}
      {/* Success popup after commit */}
      <Modal open={Boolean(successReport)} onClose={() => setSuccessReport(null)} title={successOffline ? 'Batch saved offline' : 'Batch committed to inventory'} size="md">
        {successReport && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 size={22} className="shrink-0" />
              <div>
                <p className="font-bold">{successOffline ? 'Saved locally. It will sync automatically.' : `Batch #${successReport.batchNumber} saved.`}</p>
                <p>Stock updated across ONYX POS and the receiving report{successOffline ? ' was prepared' : ' printed'}.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button className="rounded-2xl" onClick={() => { setViewReport(successReport); setSuccessReport(null); }}><Eye size={16} className="mr-2" /> View Report</Button>
              <Button variant="secondary" className="rounded-2xl" onClick={() => printReceivingReport(successReport)}><Printer size={16} className="mr-2" /> Reprint Report</Button>
              <Button variant="outline" className="col-span-2 rounded-2xl" onClick={() => setSuccessReport(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* On-screen report viewer */}
      <Modal open={Boolean(viewReport)} onClose={() => setViewReport(null)} title={viewReport ? `Receiving Report - Batch #${viewReport.batchNumber}` : ''} size="md">
        {viewReport && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Batch</span><strong>#{viewReport.batchNumber}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Date</span><strong>{viewReport.createdAt}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Time</span><strong>{viewReport.time}</strong></div>
              <div className="flex justify-between"><span className="text-slate-500">Staff</span><strong>{viewReport.cashier}</strong></div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b-2 border-slate-300 text-left"><th className="py-2">Product</th><th className="py-2 text-center">Qty</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {viewReport.lines.map((line, index) => (
                  <tr key={`${line.name}-${index}`}><td className="py-2 font-medium">{line.name}</td><td className="py-2 text-center font-bold">{line.quantity}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-red-50 p-3"><p className="text-xs text-slate-500">Total Unique Products</p><strong className="text-lg">{viewReport.totalProducts}</strong></div>
              <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-xs text-slate-500">Total Units Received</p><strong className="text-lg">{viewReport.totalUnits}</strong></div>
            </div>
            <Button className="w-full rounded-2xl" onClick={() => printReceivingReport(viewReport)}><Printer size={16} className="mr-2" /> Print Report</Button>
          </div>
        )}
      </Modal>
      {/* Batch detail screen */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `Batch #${detail.offlineBatch ? `OFF-${detail.offlineBatch.clientBatchId.slice(0, 8).toUpperCase()}` : detail.batch?.batchNumber}` : ''} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              {detail.offlineBatch ? (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Date</span><strong>{fmtDate(detail.offlineBatch.createdAt)}</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">Time</span><strong>{fmtTime(detail.offlineBatch.createdAt)}</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">Staff</span><strong>{detail.offlineBatch.staffName}</strong></div>
                  <div className="mt-1"><Badge variant="warning">Pending sync</Badge></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Date</span><strong>{fmtDate(detail.batch?.createdAt || '')}</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">Time</span><strong>{fmtTime(detail.batch?.createdAt || '')}</strong></div>
                  <div className="flex justify-between"><span className="text-slate-500">Staff</span><strong>{detail.batch?.cashier ? `${detail.batch.cashier.firstName} ${detail.batch.cashier.lastName}`.trim() : 'Staff'}</strong></div>
                  {detail.batch?.supplier?.name && <div className="flex justify-between"><span className="text-slate-500">Supplier</span><strong>{detail.batch.supplier.name}</strong></div>}
                </>
              )}
            </div>
            {detailLines.length ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b-2 border-slate-300 text-left"><th className="py-2">Product</th><th className="py-2 text-center">Qty</th>{detail.offlineBatch && <th className="py-2 text-right">Stock</th>}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.offlineBatch
                    ? detail.offlineBatch.snapshot.map((line) => (
                        <tr key={line.productId}><td className="py-2 font-medium">{line.name}</td><td className="py-2 text-center font-bold">{line.quantity}</td><td className="py-2 text-right text-xs text-slate-500">{line.stockBefore} to {line.stockAfter}</td></tr>
                      ))
                    : (detail.batch?.items || []).map((item) => (
                        <tr key={item.id}><td className="py-2 font-medium">{item.product?.name || 'Product'}</td><td className="py-2 text-center font-bold">{item.quantity}</td></tr>
                      ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Full product list is stored on the server. Reconnect to view and reprint this batch.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button className="rounded-2xl" disabled={!detailReport || !detailLines.length} onClick={() => detailReport && printReceivingReport(detailReport)}><Printer size={16} className="mr-2" /> Reprint Report</Button>
              <Button variant="outline" className="rounded-2xl" onClick={() => setDetail(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
