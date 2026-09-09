import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';

interface Movement {
  id: string; type: string; quantity: number; previousStock: number;
  newStock: number; reason?: string; createdAt: string;
  product?: { name: string; sku: string };
  user?: { firstName: string; lastName: string };
}

export const InventoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data } = useQuery<{ data: Movement[]; total: number; page: number }>({
    queryKey: ['movements', typeFilter],
    queryFn: () => api.get('/inventory/movements', { params: { limit: 50, type: typeFilter || undefined } }).then((res) => res.data),
  });

  const { data: lowStock } = useQuery<{ data: unknown[] }>({
    queryKey: ['low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((res) => res.data),
  });

  const { data: outOfStock } = useQuery<{ data: unknown[] }>({
    queryKey: ['out-of-stock'],
    queryFn: () => api.get('/inventory/out-of-stock').then((res) => res.data),
  });

  const columns = [
    {
      key: 'product', header: 'Product',
      render: (row: Movement) => <div><div className="font-medium">{row.product?.name || '—'}</div><div className="text-xs text-gray-500">{row.product?.sku}</div></div>,
    },
    {
      key: 'type', header: 'Type',
      render: (row: Movement) => <Badge variant={row.type === 'STOCK_IN' || row.type === 'REFUND' ? 'success' : row.type === 'SALE' ? 'default' : 'warning'}>{row.type.replace('_', ' ')}</Badge>,
    },
    { key: 'quantity', header: 'Qty', render: (row: Movement) => <span className={row.quantity < 0 ? 'text-red-600' : 'text-green-600'}>{row.quantity > 0 ? '+' : ''}{row.quantity}</span> },
    { key: 'stock', header: 'Stock Change', render: (row: Movement) => `${row.previousStock} → ${row.newStock}` },
    { key: 'user', header: 'By', render: (row: Movement) => row.user ? `${row.user.firstName} ${row.user.lastName}` : '—' },
    { key: 'date', header: 'Date', render: (row: Movement) => new Date(row.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <p className="text-sm text-gray-600 mt-1">Track stock movements and alerts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Low Stock Items</p>
          <p className="text-2xl font-bold text-amber-600">{lowStock?.data?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Out of Stock</p>
          <p className="text-2xl font-bold text-red-600">{outOfStock?.data?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Total Movements</p>
          <p className="text-2xl font-bold">{data?.total || 0}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 border rounded-md">
          <option value="">All Types</option>
          <option value="STOCK_IN">Stock In</option>
          <option value="STOCK_OUT">Stock Out</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="SALE">Sale</option>
          <option value="REFUND">Refund</option>
        </select>
      </div>

      <DataTable
        data={data?.data || []}
        columns={columns}
        page={data?.page || 1}
        pageSize={50}
        total={data?.total || 0}
        onPageChange={() => {}}
      />
    </div>
  );
};
