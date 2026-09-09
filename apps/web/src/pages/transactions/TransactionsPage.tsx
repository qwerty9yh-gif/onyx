import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Receipt } from 'lucide-react';
import { api } from '../../lib/api';
import type { Sale } from '../../lib/types';

const TransactionCard: React.FC<{ sale: Sale }> = ({ sale }) => (
  <article className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-lg shadow-slate-200/50 backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Receipt size={19} /></span><div><p className="font-bold text-slate-800">{sale.receiptNumber}</p><p className="text-xs text-slate-500">{sale.customer?.name || 'Walk-in customer'}</p></div></div>
      <strong className="text-lg text-slate-900">${sale.total.toFixed(2)}</strong>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>{sale.items?.reduce((count, item) => count + item.quantity, 0) || 0} items · {sale.paymentMethod}</span><span>{new Date(sale.createdAt).toLocaleString()}</span></div>
    <div className="mt-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${sale.amountReceived >= sale.total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{sale.amountReceived >= sale.total ? 'Paid' : 'Unpaid'}</span></div>
  </article>
);

export const TransactionsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['transactions', status],
    queryFn: () => api.get('/sales', { params: { limit: 100, status: status || undefined } }).then((res) => res.data.data),
  });
  const filtered = useMemo(() => sales.filter((sale) => !search || sale.receiptNumber.toLowerCase().includes(search.toLowerCase()) || sale.customer?.name?.toLowerCase().includes(search.toLowerCase())), [sales, search]);
  const paid = filtered.filter((sale) => sale.amountReceived >= sale.total);
  const unpaid = filtered.filter((sale) => sale.amountReceived < sale.total);
  const section = (title: string, rows: Sale[], tone: string) => <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-800">{title}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{rows.length}</span></div>{rows.length ? rows.map((sale) => <TransactionCard key={sale.id} sale={sale} />) : <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No {title.toLowerCase()} yet.</div>}</section>;
  return <div className="mx-auto max-w-6xl space-y-6"><header><p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Transactions</p><h1 className="text-3xl font-bold">Sales history</h1></header><div className="flex flex-col gap-3 rounded-3xl border border-white/80 bg-white/70 p-4 shadow-lg shadow-slate-200/40 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-600" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" className="h-12 w-full rounded-2xl bg-sky-50 pl-10 pr-4 outline-none focus:ring-2 focus:ring-sky-300" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-12 rounded-2xl border-0 bg-slate-100 px-4 font-semibold"><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="REFUNDED">Refunded</option><option value="VOIDED">Voided</option></select></div>{isLoading ? <div className="rounded-3xl bg-white p-10 text-center">Loading transactions...</div> : <div className="grid gap-8 lg:grid-cols-2">{section('Paid transactions', paid, 'bg-emerald-100 text-emerald-700')}{section('Unpaid transactions', unpaid, 'bg-amber-100 text-amber-800')}</div>}</div>;
};
