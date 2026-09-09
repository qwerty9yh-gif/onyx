import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Product, Category, Supplier } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  costPrice: z.number().min(0, 'Must be 0 or more'),
  sellingPrice: z.number().min(0, 'Must be 0 or more'),
  stockQuantity: z.number().int().min(0, 'Must be 0 or more'),
  minimumStock: z.number().int().min(0, 'Must be 0 or more').default(0),
  taxRate: z.number().min(0).max(1).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'OUT_OF_STOCK']).default('ACTIVE'),
});

type ProductFormData = z.infer<typeof productSchema>;

export const ProductForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then((res) => res.data.data),
    enabled: !!id,
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((res) => res.data.data),
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers', { params: { isActive: 'true' } }).then((res) => res.data.data),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name, sku: product.sku, barcode: product.barcode || '',
        description: product.description || '', image: product.image || '',
        categoryId: product.categoryId || null, supplierId: product.supplierId || null,
        costPrice: product.costPrice, sellingPrice: product.sellingPrice,
        stockQuantity: product.stockQuantity, minimumStock: product.minimumStock || 0,
        taxRate: product.taxRate || null, status: product.status || 'ACTIVE',
      });
    }
  }, [product, reset]);

  const mutation = useMutation({
    mutationFn: (data: ProductFormData) => {
      if (isEdit) return api.put(`/products/${id}`, data);
      return api.post('/products', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/products');
    },
  });

    const onSubmit = (data: ProductFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'New Product'}</h1>
        <p className="text-sm text-gray-600 mt-1">{isEdit ? 'Update product details' : 'Add a new product to your catalog'}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" placeholder="Product name" error={errors.name?.message} {...register('name')} />
          <Input label="SKU" placeholder="Stock Keeping Unit" error={errors.sku?.message} {...register('sku')} />
          <Input label="Barcode" placeholder="Barcode (optional)" error={errors.barcode?.message} {...register('barcode')} />
          <Input label="Image URL" placeholder="https://..." error={errors.image?.message} {...register('image')} />
          <Input label="Cost Price" type="number" step="0.01" placeholder="0.00" error={errors.costPrice?.message} {...register('costPrice', { valueAsNumber: true })} />
          <Input label="Selling Price" type="number" step="0.01" placeholder="0.00" error={errors.sellingPrice?.message} {...register('sellingPrice', { valueAsNumber: true })} />
          <Input label="Stock Quantity" type="number" placeholder="0" error={errors.stockQuantity?.message} {...register('stockQuantity', { valueAsNumber: true })} />
          <Input label="Minimum Stock" type="number" placeholder="0" error={errors.minimumStock?.message} {...register('minimumStock', { valueAsNumber: true })} />
          <Input label="Tax Rate" type="number" step="0.01" placeholder="0.00" error={errors.taxRate?.message} {...register('taxRate', { valueAsNumber: true })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select {...register('status')} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-red-500">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="DISCONTINUED">Discontinued</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select {...register('categoryId')} onChange={(e) => setValue('categoryId', e.target.value || null)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-red-500">
              <option value="">Select Category</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select {...register('supplierId')} onChange={(e) => setValue('supplierId', e.target.value || null)} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-red-500">
              <option value="">Select Supplier</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <Input label="Description" placeholder="Product description..." error={errors.description?.message} {...register('description')} />
          </div>
        </div>

        {mutation.isError && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {(mutation.error as Error)?.message || 'An error occurred'}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" variant="primary" loading={mutation.isPending}>{isEdit ? 'Update' : 'Create'} Product</Button>
          <Button type="button" variant="outline" onClick={() => navigate('/products')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};

