import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Megaphone, MessageSquare, Plus, Send } from 'lucide-react';
import { api, broadcastCustomerSms, messageCustomer } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { money } from '../../lib/helpers';
import { handleApiError } from '../../lib/api';

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  totalSpent: number;
  lastPurchase?: string;
  _count?: { purchases: number };
}

export const CustomersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [messageTarget, setMessageTarget] = useState<CustomerRow | null>(null);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bcTitle, setBcTitle] = useState('');
  const [bcBody, setBcBody] = useState('');
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get('/customers', { params: { search, limit: 50 } }).then((res) => res.data),
  });

  const messageMutation = useMutation({
    mutationFn: () => messageCustomer(messageTarget!.id, msgTitle, msgBody),
    onSuccess: () => setFeedback('Message sent successfully.'),
    onError: (err) => setFeedback(handleApiError(err)),
  });

  const broadcastMutation = useMutation({
    mutationFn: () => broadcastCustomerSms(bcTitle, bcBody),
    onSuccess: (res) => setFeedback(`Broadcast sent to ${res.sent} customer${res.sent === 1 ? '' : 's'}${res.failed ? ` (${res.failed} failed)` : ''}.`),
    onError: (err) => setFeedback(handleApiError(err)),
  });

  const rows: CustomerRow[] = (data?.data || []).map((c: CustomerRow) => c);

const openMessage = (row: CustomerRow) => {
    setMessageTarget(row);
    setMsgTitle('');
    setMsgBody('');
    setFeedback('');
  };

  const openBroadcast = () => {
    setBroadcastOpen(true);
    setBcTitle('');
    setBcBody('');
    setFeedback('');
  };

  const columns = [
    {
      key: 'name', header: 'Customer',
      render: (row: CustomerRow) => (
        <div>
          <div className="font-bold text-slate-800">{row.name}</div>
          <div className="text-xs text-slate-400">{row.email || '—'}</div>
        </div>
      ),
    },
    {
      key: 'phone', header: 'Phone',
      render: (row: CustomerRow) => row.phone ? <Badge variant="info"><MessageSquare size={10} /> {row.phone}</Badge> : <span className="text-slate-400">—</span>,
    },
    {
      key: 'total', header: 'Total Spent',
      render: (row: CustomerRow) => <span className="font-semibold text-brand-700">{money(row.totalSpent)}</span>,
    },
    {
      key: 'purchases', header: 'Purchases',
      render: (row: CustomerRow) => row._count?.purchases ?? 0,
    },
    {
      key: 'last', header: 'Last Purchase',
      render: (row: CustomerRow) => row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString() : '—',
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (row: CustomerRow) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => openMessage(row)} className="rounded-lg bg-red-50 p-2 text-brand-700 transition hover:bg-red-100" title="Send SMS"><Send size={15} /></button>
          <button onClick={() => navigate(`/customers/${row.id}/edit`)} className="rounded-lg bg-red-50 p-2 text-brand-700 transition hover:bg-red-100" title="Edit"><Edit size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Contacts</p>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.total || 0} customers · SMS-ready contacts with phone numbers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openBroadcast}><Megaphone size={16} />Broadcast SMS</Button>
          <Button onClick={() => navigate('/customers/new')}><Plus size={16} />Add Customer</Button>
        </div>
      </header>

      <DataTable
        data={rows}
        columns={columns}
        page={data?.page || 1}
        pageSize={50}
        total={data?.total || 0}
        onPageChange={() => {}}
        onSearch={setSearch}
        searchValue={search}
        searchPlaceholder="Search name, phone, email or barcode..."
      />

      <Modal open={Boolean(messageTarget)} onClose={() => setMessageTarget(null)} title={`SMS to ${messageTarget?.name || ''}`} size="md">
        <div className="space-y-4">
          <div className="rounded-2xl bg-red-50/60 px-3 py-2 text-sm font-semibold text-brand-800"><MessageSquare size={14} className="mr-1 inline" />Sending to: <strong>{messageTarget?.phone || 'No phone'}</strong></div>
          <Input label="Title (optional)" placeholder="e.g. ONYX LOUNGE / PUB" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Message</label>
            <textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="Type your message…" rows={4} className="w-full rounded-xl border border-red-100 bg-red-50/60 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30" />
          </div>
          {feedback && <p className="text-sm font-medium text-emerald-700">{feedback}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMessageTarget(null)}>Cancel</Button>
            <Button loading={messageMutation.isPending} disabled={!messageTarget?.phone || !msgBody.trim()} onClick={() => messageMutation.mutate()}><Send size={16} />Send message</Button>
          </div>
        </div>
      </Modal>

      <Modal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} title="Broadcast SMS to all customers" size="md">
        <div className="space-y-4">
          <div className="rounded-2xl bg-red-50/60 px-3 py-2 text-sm font-semibold text-brand-800"><Megaphone size={14} className="mr-1 inline" />Reaches every customer with a saved phone number.</div>
          <Input label="Title (optional)" placeholder="e.g. Weekend Offer" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} />
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Message</label>
            <textarea value={bcBody} onChange={(e) => setBcBody(e.target.value)} placeholder="Type your announcement…" rows={4} className="w-full rounded-xl border border-red-100 bg-red-50/60 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30" />
          </div>
          {feedback && <p className="text-sm font-medium text-emerald-700">{feedback}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button loading={broadcastMutation.isPending} disabled={!bcBody.trim()} onClick={() => broadcastMutation.mutate()}><Megaphone size={16} />Send broadcast</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};