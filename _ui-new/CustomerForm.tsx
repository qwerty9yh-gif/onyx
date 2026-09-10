import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Contact } from 'lucide-react';
import { api, handleApiError } from '../apps/web/src/lib/api';
import { Button } from '../apps/web/src/components/ui/Button';
import { Input } from '../apps/web/src/components/ui/Input';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  barcode: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export const CustomerForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`).then((res) => res.data.data),
    enabled: !!id,
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
  });

  React.useEffect(() => {
    if (customer) {
      reset({
        name: customer.name, email: customer.email || '', phone: customer.phone || '',
        address: customer.address || '', barcode: customer.barcode || '',
        notes: customer.notes || '', status: customer.status || 'active',
      });
    }
  }, [customer, reset]);

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) => isEdit ? api.put(`/customers/${id}`, data) : api.post('/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers');
    },
  });

return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-brand-700"><Contact size={22} /></span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Customers</p>
          <h1 className="text-3xl font-bold text-slate-900">{isEdit ? 'Edit Customer' : 'New Customer'}</h1>
          <p className="mt-1 text-sm text-slate-500">{isEdit ? 'Update customer details' : 'Add a customer for loyalty and SMS messaging'}</p>
        </div>
      </header>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="rounded-3xl border border-white/80 bg-white/90 p-6 shadow-xl shadow-red-950/10 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" placeholder="Customer name" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" placeholder="customer@example.com" error={errors.email?.message} {...register('email')} />
          <Input label="Phone (for SMS)" placeholder="e.g. 0551234567" error={errors.phone?.message} {...register('phone')} />
          <Input label="Barcode" placeholder="Barcode (optional)" error={errors.barcode?.message} {...register('barcode')} />
          <Input label="Address" placeholder="Address" error={errors.address?.message} {...register('address')} />
          <Input label="Notes" placeholder="Notes" error={errors.notes?.message} {...register('notes')} />
        </div>
        {mutation.isError && (<div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{handleApiError(mutation.error)}</div>)}
        <div className="flex justify-end gap-2 border-t border-red-100 pt-4">
          <Button type="button" variant="ghost" onClick={() => navigate('/customers')}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Save Customer</Button>
        </div>
      </form>
    </div>
  );
};