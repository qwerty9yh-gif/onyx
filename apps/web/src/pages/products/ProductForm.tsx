import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode, X } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { onBarcodeScan } from '../../lib/scanner';
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
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['incoming-products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // ── NB80 hardware barcode scanner: one-time barcode setup per product ──
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState('');
  const scanningRef = useRef(false);
  scanningRef.current = scanning;
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => onBarcodeScan((barcode: string) => {
    if (!scanningRef.current) return;
    const code = barcode.trim();
    if (!code) return;
    setValue('barcode', code, { shouldDirty: true, shouldValidate: true });
    setScanning(false);
    setScanNotice(`Barcode ${code} captured - tap Save to store it on this product`);
    window.setTimeout(() => setScanNotice(''), 4000);
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
  }), [setValue]);

  const startScanning = (): void => {
    setScanning(true);
    setScanNotice('Press the NB80 scan button on the bottle now');
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = window.setTimeout(() => {
      setScanning(false);
      setScanNotice('');
    }, 20000);
  };

  const cancelScanning = (): void => {
    setScanning(false);
    setScanNotice('');
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
  };

  useEffect(() => () => {
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
  }, []);

    const onSubmit = (data: ProductFormData) => {
    mutation.mutate(data);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Product management</p>
        <h1 className="text-3xl font-bold text-slate-900">{isEdit ? 'Edit product' : 'Add product'}</h1>
        <p className="mt-1 text-sm text-slate-500">Changes are saved to the local inventory immediately.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-3xl border border-white/80 bg-white/85 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Name" placeholder="Product name" error={errors.name?.message} {...register('name')} />
          <Input label="SKU" placeholder="Stock Keeping Unit" error={errors.sku?.message} {...register('sku')} />
          <div>
            <Input label="Barcode" placeholder="Barcode (optional or scan with NB80)" error={errors.barcode?.message} {...register('barcode')} />
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" size="sm" variant={scanning ? 'danger' : 'secondary'} className="rounded-xl" onClick={scanning ? cancelScanning : startScanning}>
                {scanning ? <X size={14} className="mr-1" /> : <ScanBarcode size={14} className="mr-1" />}
                {scanning ? 'Cancel scan' : 'Scan Barcode'}
              </Button>
              {scanning && <span className="animate-pulse text-xs font-semibold text-brand-700">Press the NB80 scan button on the bottle…</span>}
            </div>
            {scanNotice && <p className="mt-1.5 text-xs font-semibold text-brand-700">{scanNotice}</p>}
          </div>
          <Input label="Image URL" placeholder="https://..." error={errors.image?.message} {...register('image')} />
          <Input label="Cost Price (GH₵)" type="number" step="0.01" placeholder="0.00" error={errors.costPrice?.message} {...register('costPrice', { valueAsNumber: true })} />
          <Input label="Selling Price (GH₵)" type="number" step="0.01" placeholder="0.00" error={errors.sellingPrice?.message} {...register('sellingPrice', { valueAsNumber: true })} />
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
            {handleApiError(mutation.error)}
          </div>
        )}
        {mutation.isSuccess && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Product saved successfully.</div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" className="rounded-2xl bg-sky-600 hover:bg-sky-700" loading={mutation.isPending}>{isEdit ? 'Save changes' : 'Save product'}</Button>
          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => navigate('/products')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};

