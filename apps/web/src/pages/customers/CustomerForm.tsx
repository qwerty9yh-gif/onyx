import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Customer' : 'New Customer'}</h1>
        <p className="text-sm text-gray-600 mt-1">{isEdit ? 'Update customer details' : 'Add a new customer'}</p>
      </div>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" placeholder="Customer name" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" placeholder="customer@example.com" error={errors.email?.message} {...register('email')} />
          <Input label="Phone" placeholder="Phone number" error={errors.phone?.message} {...register('phone')} />
          <Input label="Barcode" placeholder="Barcode (optional)" error={errors.barcode?.message} {...register('barcode')} />
          <Input label="Address" placeholder="Address" error={errors.address?.message} {...register('address')} />
          <Input label="Notes" placeholder="Notes" error={errors.notes?.message} {...register('notes')} />
        </div>
        {mutation.isError && (<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">{(mutation.error as Error)?.message || 'An error occurred'}</div>)}
        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" variant="primary" loading={mutation.isPending}>Save Customer</Button>
          <Button type="button" variant="outline" onClick={() => navigate('/customers')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};
