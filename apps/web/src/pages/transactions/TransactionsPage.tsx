import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Receipt, Search, WalletCards, X } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { printInvoice, type InvoiceData } from '../../lib/printer';
import type { Sale } from '../../lib/types';
import { money } from '../../lib/helpers';

const isPaid = (sale: Sale) => sale.status === 'COMPLETED';

function invoiceFor(sale: Sale): InvoiceData {
  return {
    storeName: 'ONYX POS',
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
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const { data: sales = [], isLoading, isError } = useQuery<Sale[]>({
    queryKey: ['transactions', status],
    queryFn: () => api.get('/sales', { params: { limit: 100, status: status || undefined } }).then((res) => res.data.data),
  });
  const payMutation = useMutation({
    mutationFn: (sale: Sale) => api.post(`/sales/${sale.id}/mark-paid`, { paymentMethod, amountReceived: sale.total }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products-search'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelected(null);
      setError('');
    },
    onError: (err) => setError(handleApiError(err)),
  });

  const filtered = useMemo(() => sales
    .filter((sale) => !search || sale.receiptNumber.toLowerCase().includes(search.toLowerCase()) || sale.customer?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(isPaid(b)) - Number(isPaid(a)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [sales, search]);
  const paid = filtered.filter(isPaid);
  const unpaid = filtered.filter((sale) => !isPaid(sale));
  const open = (sale: Sale) => { setSelected(sale); setError(''); };
  const print = (sale: Sale) => { printInvoice(invoiceFor(sale)); setSelected(null); };
  const section = (title: string, rows: Sale[], tone: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-800">{title}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{rows.length}</span></div>
      {rows.length ? rows.map((sale) => (
        <button type="button" key={sale.id} onClick={() => open(sale)} className="w-full rounded-3xl border border-white/80 bg-white/80 p-4 text-left shadow-lg shadow-slate-200/50 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl">
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Receipt size={19} /></span><div><p className="font-bold text-slate-800">{sale.receiptNumber}</p><p className="text-xs text-slate-500">{sale.customer?.name || 'Walk-in customer'}</p></div></div><strong className="text-lg text-slate-900">{money(sale.total)}</strong></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>{sale.items?.reduce((count, item) => count + item.quantity, 0) || 0} items · {sale.paymentMethod}</span><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
          <div className="mt-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${isPaid(sale) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{isPaid(sale) ? 'Paid' : 'Unpaid'}</span></div>
        </button>
      )) : <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No {title.toLowerCase()} yet.</div>}
    </section>
  );

  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Transactions</p><h1 className="text-3xl font-bold">Sales history</h1></header>
    <div className="flex flex-col gap-3 rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-slate-200/40 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-600" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" className="h-12 w-full rounded-2xl bg-sky-50 pl-10 pr-4 outline-none focus:ring-2 focus:ring-sky-300" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 rounded-2xl border-0 bg-slate-100 px-4 font-semibold"><option value="">All statuses</option><option value="PENDING">Unpaid</option><option value="COMPLETED">Paid</option><option value="REFUNDED">Refunded</option><option value="VOIDED">Voided</option></select></div>
    {isLoading && <div className="rounded-3xl bg-white p-10 text-center">Loading transactions...</div>}
    {isError && <div className="rounded-3xl bg-red-50 p-10 text-center text-red-700">Transactions could not be loaded. Please try again.</div>}
    {!isLoading && !isError && <div className="grid gap-8 lg:grid-cols-2">{section('Paid transactions', paid, 'bg-emerald-100 text-emerald-700')}{section('Unpaid transactions', unpaid, 'bg-amber-100 text-amber-800')}</div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{selected.receiptNumber}</h2><button type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button></div><p className="mt-2 text-slate-600">{money(selected.total)} · {isPaid(selected) ? 'Paid' : 'Unpaid'}</p>{!isPaid(selected) && <><label className="mt-5 block text-sm font-semibold text-slate-700">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-2 h-12 w-full rounded-2xl bg-slate-100 px-3"><option>CASH</option><option>CARD</option><option>TRANSFER</option><option>QR</option></select></label>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}</>}<div className="mt-6 grid gap-3 sm:grid-cols-2">{!isPaid(selected) && <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700" loading={payMutation.isPending} onClick={() => payMutation.mutate(selected)}><WalletCards className="mr-2" size={18} />Pay order</Button>}<Button variant="outline" className="rounded-2xl" onClick={() => print(selected)}><Printer className="mr-2" size={18} />Print invoice</Button></div></div></div>}
  </div>;
};
