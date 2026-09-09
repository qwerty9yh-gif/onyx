import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit } from 'lucide-react';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface Customer {
    id: string; name: string; email?: string; phone?: string;
  address?: string; totalSpent: number; lastPurchase?: string;
}

export const CustomersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get('/customers', { params: { search, limit: 50 } }).then((res) => res.data),
  });

  const columns = [
    { key: 'name', header: 'Name', render: (row: Customer) => <div className="font-medium">{row.name}</div> },
    { key: 'email', header: 'Email', render: (row: Customer) => row.email || '—' },
    { key: 'phone', header: 'Phone', render: (row: Customer) => row.phone || '—' },
    { key: 'total', header: 'Total Spent', render: (row: Customer) => `$${row.totalSpent.toFixed(2)}` },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      render: (row: Customer) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(`/customers/${row.id}/edit`)} className="text-blue-600 hover:text-blue-800" title="Edit"><Edit size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Button onClick={() => navigate('/customers/new')} variant="primary">
          <Plus size={16} className="mr-2" /> Add Customer
        </Button>
      </div>
      <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
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

