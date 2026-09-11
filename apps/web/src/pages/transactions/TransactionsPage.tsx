import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Printer, Receipt, Search, Send, UserRound, WalletCards, X } from 'lucide-react';
import { api, handleApiError, sendSmsInvoice } from '../../lib/api';
import { triggerDashboardRefresh } from '../../lib/offline';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { printInvoice, type InvoiceData } from '../../lib/printer';
import type { Sale } from '../../lib/types';
import { money } from '../../lib/helpers';

type Tab = 'paid' | 'unpaid' | 'closed';

const isPaid = (sale: Sale) => sale.status === 'COMPLETED';
const isUnpaid = (sale: Sale) => sale.status === 'PENDING';
const isClosed = (sale: Sale) => sale.status === 'VOIDED' || sale.status === 'REFUNDED';

function statusBadge(sale: Sale) {
  switch (sale.status) {
    case 'COMPLETED': return <Badge variant="success">Paid</Badge>;
    case 'PENDING': return <Badge variant="warning">Unpaid</Badge>;
    case 'VOIDED': return <Badge variant="outline">Voided</Badge>;
    case 'REFUNDED': return <Badge variant="danger">Refunded</Badge>;
    default: return <Badge variant="default">{sale.status}</Badge>;
  }
}

function invoiceFor(sale: Sale): InvoiceData {
  return {
    storeName: 'ONYX LOUNGE / PUB',
    invoiceNumber: sale.receiptNumber,
    cashier: sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : 'ONYX POS',
    createdAt: new Date(sale.createdAt).toLocaleString(),
    lines: (sale.items || []).map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    status: isPaid(sale) ? 'PAID' : 'UNPAID',
  };
}

export const TransactionsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('paid');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [error, setError] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsMsg, setSmsMsg] = useState('');
  const queryClient = useQueryClient();
  const { data: sales = [], isLoading, isError } = useQuery<Sale[]>({
    queryKey: ['transactions'],
    queryFn: () => api.get('/sales', { params: { limit: 100 } }).then((res) => res.data.data),
  });
  const payMutation = useMutation({
    mutationFn: (sale: Sale) => api.post(`/sales/${sale.id}/mark-paid`, { paymentMethod, amountReceived: sale.total }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      triggerDashboardRefresh();
      setSelected(null);
      setError('');
    },
    onError: (err) => setError(handleApiError(err)),
  });

const filtered = useMemo(() => sales
    .filter((sale) => !search || sale.receiptNumber.toLowerCase().includes(search.toLowerCase()) || sale.customer?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [sales, search]);
  const paid = filtered.filter(isPaid);
  const unpaid = filtered.filter(isUnpaid);
  const closed = filtered.filter(isClosed);
  const open = (sale: Sale) => { setSelected(sale); setSmsPhone(sale.customerPhone || sale.customer?.phone || ''); setSmsMsg(''); setError(''); };
  const print = (sale: Sale) => { printInvoice(invoiceFor(sale)); setSelected(null); };

  const sendSms = async () => {
    if (!selected) return;
    setSmsBusy(true);
    setSmsMsg('');
    try {
      const result = await sendSmsInvoice(selected.id, smsPhone);
      setSmsMsg(result.success ? `SMS invoice sent successfully (${result.messageId || 'confirmed'})` : (result.error || 'SMS could not be sent'));
    } catch (sendError) {
      setSmsMsg('SMS could not be sent');
    }
    setSmsBusy(false);
  };

  const section = (title: string, rows: Sale[]) => (
    <section className="max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto rounded-3xl border-2 border-brand-200 bg-white p-4 pr-3 shadow-lg shadow-red-950/10">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-800">{title}</h2><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-brand-700">{rows.length}</span></div>
      {rows.length ? rows.map((sale) => (
        <button type="button" key={sale.id} onClick={() => open(sale)} className="onyx-layered-card w-full rounded-2xl border border-red-100 bg-white p-4 text-left shadow-md shadow-red-950/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-glow-red">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-brand-700"><Receipt size={18} /></span>
              <div>
                <p className="font-bold text-slate-900">{sale.receiptNumber}</p>
                <p className="text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <strong className="text-lg text-slate-900">{money(sale.total)}</strong>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{sale.items?.reduce((count, item) => count + item.quantity, 0) || 0} items · {sale.paymentMethod}</span>
            {sale.waiter && <span className="inline-flex items-center gap-1"><UserRound size={13} />Waiter: {sale.waiter.firstName} {sale.waiter.lastName}</span>}
            {(sale.customerPhone || sale.customer?.phone) && <span className="inline-flex items-center gap-1"><Phone size={13} />{sale.customerPhone || sale.customer?.phone}</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{statusBadge(sale)}{sale.customer?.name && <span className="text-xs text-slate-500">{sale.customer.name}</span>}</div>
        </button>
      )) : <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No {title.toLowerCase()} yet.</div>}
    </section>
  );

return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Transactions</p>
        <h1 className="text-3xl font-bold">Sales history</h1>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-glass-sm"><Receipt size={16} className="text-brand-700" />{paid.length} paid · {unpaid.length} unpaid</div>
    </header>
    <div className="flex flex-col gap-4 rounded-3xl border border-red-100 bg-white/85 p-4 shadow-lg shadow-red-950/10 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-700" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" className="h-12 w-full rounded-2xl bg-red-50 pl-10 pr-4 outline-none focus:ring-2 focus:ring-red-300" /></div>
      <div className="flex rounded-2xl bg-red-50 p-1" role="tablist" aria-label="Transaction status">
        {([['paid', 'Paid'], ['unpaid', 'Unpaid'], ['closed', 'Closed']] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === key ? 'onyx-brand-gradient text-white shadow-glow-red' : 'text-brand-700 hover:bg-white'}`}>{label}</button>
        ))}
      </div>
    </div>
    {isLoading && <div className="rounded-3xl bg-white p-10 text-center">Loading transactions...</div>}
    {isError && <div className="rounded-3xl bg-red-50 p-10 text-center text-red-700">Transactions could not be loaded. Please try again.</div>}
    {!isLoading && !isError && section(tab === 'paid' ? 'Paid transactions' : tab === 'unpaid' ? 'Unpaid transactions' : 'Voided & refunded', tab === 'paid' ? paid : tab === 'unpaid' ? unpaid : closed)}

{selected && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
          <div className="onyx-brand-gradient flex items-center justify-between rounded-t-3xl px-5 py-4">
            <div>
              <h2 className="text-lg font-extrabold text-white">{selected.receiptNumber}</h2>
              <p className="text-sm text-white/80">{money(selected.total)}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded-lg p-1 text-white/90 hover:bg-white/20"><X size={20} /></button>
          </div>
          <div className="space-y-4 p-5">
            {statusBadge(selected)}
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Date</span><p className="font-semibold text-slate-800">{new Date(selected.createdAt).toLocaleString()}</p></div>
              <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Payment</span><p className="font-semibold text-slate-800">{selected.paymentMethod}</p></div>
              <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Cashier</span><p className="font-semibold text-slate-800">{selected.cashier ? `${selected.cashier.firstName} ${selected.cashier.lastName}` : '—'}</p></div>
              <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Waiter</span><p className="font-semibold text-slate-800">{selected.waiter ? `${selected.waiter.firstName} ${selected.waiter.lastName}` : '—'}</p></div>
              {selected.customer?.name && <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Customer</span><p className="font-semibold text-slate-800">{selected.customer.name}</p></div>}
              {(selected.customerPhone || selected.customer?.phone) && <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Phone</span><p className="font-semibold text-slate-800">{selected.customerPhone || selected.customer?.phone}</p></div>}
            </div>
            {isPaid(selected) && (
              <div className="space-y-3 rounded-2xl border border-brand-200 bg-red-50/50 p-3">
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-700"><Send size={13} /> Send invoice by SMS</p>
                <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" size={15} /><input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} placeholder="Customer phone" className="h-11 w-full rounded-xl border border-red-100 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-300" /></div>
                {smsMsg && <p className={`text-xs font-medium ${smsMsg.includes('successfully') ? 'text-emerald-700' : 'text-red-600'}`}>{smsMsg}</p>}
                <Button className="w-full rounded-xl bg-brand-700 text-white hover:bg-brand-800" variant="primary" loading={smsBusy} disabled={!smsPhone} onClick={sendSms}><Send size={16} />Send SMS invoice</Button>
              </div>
            )}
            {!isPaid(selected) && !isClosed(selected) && (
              <>
                <label className="block text-sm font-semibold text-slate-700">Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-red-100 bg-red-50/60 px-3 outline-none focus:ring-2 focus:ring-red-300"><option>CASH</option><option>CARD</option><option>TRANSFER</option><option>QR</option></select>
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {!isPaid(selected) && !isClosed(selected) && <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700" loading={payMutation.isPending} onClick={() => payMutation.mutate(selected)}><WalletCards className="mr-2" size={18} />Pay order</Button>}
              <Button variant="outline" className="rounded-2xl" onClick={() => print(selected)}><Printer className="mr-2" size={18} />Print invoice</Button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>;
};