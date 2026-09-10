import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Phone, Printer, Send, UserRound } from 'lucide-react';
import { api, sendSmsInvoice } from '../apps/web/src/lib/api';
import { Badge } from '../apps/web/src/components/ui/Badge';
import { Button } from '../apps/web/src/components/ui/Button';
import type { Sale, SaleItem } from '../apps/web/src/lib/types';
import { money } from '../apps/web/src/lib/helpers';
import { printReceipt, type ReceiptData } from '../apps/web/src/lib/printer';

export const ReceiptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [smsPhone, setSmsPhone] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsMsg, setSmsMsg] = useState('');
  const { data: sale } = useQuery<Sale>({
    queryKey: ['sale', id],
    queryFn: () => api.get('/sales/' + id).then((res) => res.data.data),
    enabled: !!id,
  });

  if (!sale) return <div className="p-8">Sale not found</div>;

  const print = () => {
    const receipt: ReceiptData = {
      storeName: 'ONYX LOUNGE / PUB',
      receiptNumber: sale.receiptNumber,
      cashier: sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : 'ONYX POS',
      createdAt: new Date(sale.createdAt).toLocaleString(),
      lines: sale.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      amountReceived: sale.amountReceived,
      change: sale.change,
    };
    printReceipt(receipt);
  };

  const sendSms = async () => {
    if (!id || !smsPhone.trim()) return;
    setSmsBusy(true);
    setSmsMsg('');
    try {
      const result = await sendSmsInvoice(id, smsPhone.trim());
      setSmsMsg(result.success ? 'SMS receipt sent ✓' : (result.error || 'SMS could not be sent'));
    } catch {
      setSmsMsg('SMS could not be sent');
    }
    setSmsBusy(false);
  };

return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <header className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-red-950/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Receipt</p>
            <h2 className="text-2xl font-extrabold text-slate-900">#{sale.receiptNumber}</h2>
          </div>
          <div className="flex items-center gap-2">
            {sale.status === 'COMPLETED' ? <Badge variant="success">Paid</Badge> : sale.status === 'PENDING' ? <Badge variant="warning">Unpaid</Badge> : sale.status === 'VOIDED' ? <Badge variant="outline">Voided</Badge> : <Badge variant="danger">Refunded</Badge>}
            <button onClick={print} className="rounded-xl bg-red-50 p-2 text-brand-700 transition hover:bg-red-100" title="Print receipt"><Printer size={18} /></button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Date</span><p className="font-semibold text-slate-800">{new Date(sale.createdAt).toLocaleString()}</p></div>
          <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Cashier</span><p className="font-semibold text-slate-800">{sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : 'ONYX POS'}</p></div>
          {sale.waiter && <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-700"><UserRound size={12} /> Waiter</span><p className="font-semibold text-slate-800">{sale.waiter.firstName} {sale.waiter.lastName}</p></div>}
          <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Payment</span><p className="font-semibold text-slate-800">{sale.paymentMethod}</p></div>
          {sale.customer?.name && <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-brand-700">Customer</span><p className="font-semibold text-slate-800">{sale.customer.name}</p></div>}
          {(sale.customerPhone || sale.customer?.phone) && <div className="rounded-2xl bg-red-50/60 px-3 py-2"><span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-700"><Phone size={12} /> Phone</span><p className="font-semibold text-slate-800">{sale.customerPhone || sale.customer?.phone}</p></div>}
        </div>
      </header>

      <section className="overflow-hidden rounded-3xl border border-red-100 bg-white shadow-xl shadow-red-950/10">
        <table className="w-full text-sm">
          <thead className="onyx-brand-gradient"><tr><th className="px-4 py-3 text-left font-bold text-white">Product</th><th className="px-2 py-3 text-center font-bold text-white">Qty</th><th className="px-2 py-3 text-right font-bold text-white">Price</th><th className="px-4 py-3 text-right font-bold text-white">Total</th></tr></thead>
          <tbody className="divide-y divide-red-50">
            {sale.items.map((item: SaleItem) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                <td className="px-2 py-3 text-center text-slate-600">{item.quantity}</td>
                <td className="px-2 py-3 text-right text-slate-600">{money(item.unitPrice)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{money(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-red-100 bg-red-50/40 px-4 py-4 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Discount</span><span>-{money(sale.discount)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Tax</span><span>{money(sale.tax)}</span></div>
          <div className="flex justify-between pt-2 text-lg font-extrabold text-slate-900"><span>Total</span><span>{money(sale.total)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Paid</span><span>{money(sale.amountReceived)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Change</span><span>{money(sale.change)}</span></div>
        </div>
      </section>

      {sale.status === 'COMPLETED' && (
        <section className="rounded-3xl border border-brand-200 bg-white/90 p-4 shadow-xl shadow-red-950/10">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-700"><Send size={13} /> Send receipt by SMS</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" size={15} />
              <input value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)} placeholder={sale.customerPhone || sale.customer?.phone || 'Customer phone'} className="h-11 w-full rounded-xl border border-red-100 bg-red-50/60 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-300" />
            </div>
            <Button className="rounded-xl bg-brand-700 text-white hover:bg-brand-800" loading={smsBusy} disabled={!smsPhone.trim()} onClick={sendSms}><Send size={16} />Send SMS</Button>
          </div>
          {smsMsg && <p className={`mt-2 text-xs font-medium ${smsMsg.includes('✓') ? 'text-emerald-700' : 'text-red-600'}`}>{smsMsg}</p>}
        </section>
      )}
    </div>
  );
};