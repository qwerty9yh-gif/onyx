import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit } from 'lucide-react';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface Supplier {
  id: string; name: string; email?: string; phone?: string;
  contactInfo?: string; isActive: boolean;
}

export const SuppliersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data } = useQuery<{ data: Supplier[]; total: number; page: number; totalPages: number }>({
    queryKey: ['suppliers', search],
    queryFn: () => api.get('/suppliers', { params: { search, isActive: 'true', limit: 50 } }).then((res) => res.data),
  });

  const columns = [
    { key: 'name', header: 'Name', render: (row: Supplier) => <div className="font-medium">{row.name}</div> },
    { key: 'email', header: 'Email', render: (row: Supplier) => row.email || '—' },
    { key: 'phone', header: 'Phone', render: (row: Supplier) => row.phone || '—' },
    { key: 'status', header: 'Status', render: (row: Supplier) => <Badge variant={row.isActive ? 'success' : 'default'}>{row.isActive ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      render: (row: Supplier) => (<div className="flex justify-end gap-2">
        <button onClick={() => navigate(`/suppliers/${row.id}/edit`)} className="text-blue-600 hover:text-blue-800" title="Edit"><Edit size={16} /></button>
      </div>),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <Button onClick={() => navigate('/suppliers/new')} variant="primary">
          <Plus size={16} className="mr-2" /> Add Supplier
        </Button>
      </div>
      <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <DataTable data={data?.data || []} columns={columns} page={data?.page || 1} pageSize={50} total={data?.total || 0} onPageChange={() => {}} />
    </div>
  );
};
