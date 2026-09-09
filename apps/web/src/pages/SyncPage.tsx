import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

interface SyncCounts {
  pending: number;
  failed: number;
  processing: number;
}

interface SyncOperation {
  id: string;
  entity: string;
  entityId: string;
  operationType: string;
  status: string;
  retryCount?: number;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

const statusVariant = (status: string): 'default' | 'success' | 'warning' | 'danger' => {
  switch (status) {
    case 'COMPLETED': case 'SYNCED': return 'success';
    case 'PENDING': case 'PROCESSING': return 'warning';
    case 'FAILED': return 'danger';
    default: return 'default';
  }
};

export const SyncPage: React.FC = () => {
  const { data: queue, isLoading } = useQuery<SyncCounts>({
    queryKey: ['sync-queue'],
    queryFn: () => api.get('/sync/queue').then((res) => res.data.data),
    refetchInterval: 15000,
  });

  const { data: ops } = useQuery<{ data: SyncOperation[] }>({
    queryKey: ['sync-operations'],
    queryFn: () => api.get('/sync/operations', { params: { limit: 25 } }).then((res) => res.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sync</h1>
        <p className="text-sm text-gray-600 mt-1">Offline synchronization queue status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{isLoading ? '—' : queue?.pending ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Processing</p>
          <p className="text-2xl font-bold text-blue-600">{isLoading ? '—' : queue?.processing ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Failed</p>
          <p className="text-2xl font-bold text-red-600">{isLoading ? '—' : queue?.failed ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Operations</h2>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw size={14} className="mr-2" /> Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Operation</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(ops?.data || []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No sync operations</td></tr>
              ) : (
                (ops?.data || []).map((op) => (
                  <tr key={op.id}>
                    <td className="px-4 py-2 font-medium capitalize">{op.entity}</td>
                    <td className="px-4 py-2 capitalize">{op.operationType}</td>
                    <td className="px-4 py-2"><Badge variant={statusVariant(op.status)}>{op.status}</Badge></td>
                    <td className="px-4 py-2">{op.user ? `${op.user.firstName} ${op.user.lastName}` : '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{new Date(op.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
