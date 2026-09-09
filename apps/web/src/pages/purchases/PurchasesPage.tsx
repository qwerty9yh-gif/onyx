import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, PackageCheck, Ban } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { Purchase } from '../../lib/types';

const statusVariant = (status: Purchase['status']): 'default' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'RECEIVED': return 'success';
    case 'PENDING': return 'warning';
    case 'CANCELLED': return 'danger';
    default: return 'default';
  }
};

export const PurchasesPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmReceive, setConfirmReceive] = useState<Purchase | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Purchase | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => api.get('/purchases', { params: { page, limit: 20 } }).then((res) => res.data),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/purchases/${id}/receive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      setConfirmReceive(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setConfirmCancel(null);
    },
  });

  const columns = [
    { key: 'orderNumber', header: 'Order #', render: (row: Purchase) => <span className="font-medium">{row.orderNumber || row.id.slice(0, 8)}</span> },
    { key: 'supplier', header: 'Supplier', render: (row: Purchase) => row.supplier?.name || '—' },
    { key: 'items', header: 'Items', render: (row: Purchase) => `${row.items?.length ?? 0} items` },
    { key: 'total', header: 'Total', render: (row: Purchase) => `$${row.total.toFixed(2)}` },
    { key: 'status', header: 'Status', render: (row: Purchase) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row: Purchase) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(`/purchases/${row.id}/edit`)} className="p-1 text-gray-600 hover:text-gray-900" title="View / Edit"><Eye size={16} /></button>
          {row.status !== 'RECEIVED' && row.status !== 'CANCELLED' && (
            <>
              <button onClick={() => setConfirmReceive(row)} className="p-1 text-green-600 hover:text-green-800" title="Receive"><PackageCheck size={16} /></button>
              <button onClick={() => setConfirmCancel(row)} className="p-1 text-red-600 hover:text-red-800" title="Cancel"><Ban size={16} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-sm text-gray-600 mt-1">Manage purchase orders and stock receiving</p>
        </div>
        <Button onClick={() => navigate('/purchases/new')} variant="primary">
          <Plus size={16} className="mr-2" /> New Purchase
        </Button>
      </div>

      <DataTable
        data={data?.data || []}
        columns={columns}
        page={data?.page || 1}
        pageSize={20}
        total={data?.total || 0}
        onPageChange={setPage}
      />

      <Modal open={!!confirmReceive} onClose={() => setConfirmReceive(null)} title="Receive Purchase">
        <p>
          Receive all items from <strong>{confirmReceive?.orderNumber || confirmReceive?.id.slice(0, 8)}</strong> and add them to stock?
        </p>
        {receiveMutation.isError && <p className="mt-2 text-sm text-red-600">{handleApiError(receiveMutation.error)}</p>}
        <div className="flex gap-2 mt-4">
          <Button onClick={() => confirmReceive && receiveMutation.mutate(confirmReceive.id)} loading={receiveMutation.isPending}>Confirm Receive</Button>
          <Button variant="outline" onClick={() => setConfirmReceive(null)}>Cancel</Button>
        </div>
      </Modal>

      <Modal open={!!confirmCancel} onClose={() => setConfirmCancel(null)} title="Cancel Purchase">
        <p>Are you sure you want to cancel <strong>{confirmCancel?.orderNumber || confirmCancel?.id.slice(0, 8)}</strong>?</p>
        {cancelMutation.isError && <p className="mt-2 text-sm text-red-600">{handleApiError(cancelMutation.error)}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="danger" onClick={() => confirmCancel && cancelMutation.mutate(confirmCancel.id)} loading={cancelMutation.isPending}>Cancel Purchase</Button>
          <Button variant="outline" onClick={() => setConfirmCancel(null)}>Keep</Button>
        </div>
      </Modal>
    </div>
  );
};
