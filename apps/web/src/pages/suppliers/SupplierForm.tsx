import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  contactInfo: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

export const SupplierForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: supplier } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => api.get(`/suppliers/${id}`).then((res) => res.data.data),
    enabled: !!id,
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
  });

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name, email: supplier.email || '', phone: supplier.phone || '',
        contactInfo: supplier.contactInfo || '', address: supplier.address || '',
        notes: supplier.notes || '', isActive: supplier.isActive,
      });
    }
  }, [supplier, reset]);

  const mutation = useMutation({
    mutationFn: (data: SupplierFormData) => isEdit ? api.put(`/suppliers/${id}`, data) : api.post('/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      navigate('/suppliers');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Supplier' : 'New Supplier'}</h1>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" placeholder="Supplier name" error={errors.name?.message} {...register('name')} />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Input label="Phone" placeholder="Phone" error={errors.phone?.message} {...register('phone')} />
          <Input label="Contact Info" error={errors.contactInfo?.message} {...register('contactInfo')} />
          <Input label="Address" error={errors.address?.message} {...register('address')} />
          <Input label="Notes" error={errors.notes?.message} {...register('notes')} />
        </div>
        {mutation.isError && <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">Error occurred</div>}
        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" variant="primary" loading={mutation.isPending}>Save</Button>
          <Button type="button" variant="outline" onClick={() => navigate('/suppliers')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};


