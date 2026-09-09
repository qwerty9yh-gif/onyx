import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, handleApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface BusinessSettings {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxRate: number;
  currency: string;
  receiptPrefix: string;
}

const EMPTY: BusinessSettings = {
  name: '', phone: '', email: '', address: '', taxRate: 0, currency: 'USD', receiptPrefix: 'REC',
};

export const SettingsPage: React.FC = () => {
  const [form, setForm] = useState<BusinessSettings>(EMPTY);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((res) => res.data.data),
  });

  useEffect(() => {
    if (data?.business) {
      setForm({
        name: data.business.name || '',
        phone: data.business.phone || '',
        email: data.business.email || '',
        address: data.business.address || '',
        taxRate: data.business.taxRate ?? 0,
        currency: data.business.currency || 'USD',
        receiptPrefix: data.business.receiptPrefix || 'REC',
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/settings', { business: form }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  const set = (patch: Partial<BusinessSettings>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-600 mt-1">Business configuration (admin only)</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Business Name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="Receipt Prefix" value={form.receiptPrefix} onChange={(e) => set({ receiptPrefix: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <Input label="Tax Rate" type="number" step="0.01" value={form.taxRate} onChange={(e) => set({ taxRate: parseFloat(e.target.value) || 0 })} />
          <Input label="Currency" value={form.currency} onChange={(e) => set({ currency: e.target.value })} />
          <div className="md:col-span-2">
            <Input label="Address" value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </div>
        </div>

        {saveMutation.isSuccess && (
          <div className="p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md">Settings saved.</div>
        )}
        {saveMutation.isError && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {handleApiError(saveMutation.error)}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
};
