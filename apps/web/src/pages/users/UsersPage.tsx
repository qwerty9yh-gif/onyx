import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, handleApiError } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import type { User } from '../../lib/types';

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF'] as const;

interface NewUserForm {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  role: (typeof ROLES)[number];
  phone: string;
}

const EMPTY_FORM: NewUserForm = {
  email: '', username: '', password: '', firstName: '', lastName: '',
  role: 'CASHIER', phone: '',
};

export const UsersPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => api.get('/users', { params: { page, limit: 20, search: search || undefined } }).then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: NewUserForm) => api.post('/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const set = (patch: Partial<NewUserForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const columns = [
    {
      key: 'name', header: 'Name',
      render: (row: User) => (
        <div>
          <div className="font-medium">{row.firstName} {row.lastName}</div>
          <div className="text-xs text-gray-500">@{row.username}</div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row: User) => row.email },
    { key: 'role', header: 'Role', render: (row: User) => <Badge variant={row.role === 'ADMIN' ? 'success' : 'default'}>{row.role}</Badge> },
    { key: 'status', header: 'Status', render: (row: User) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'danger'}>{row.status}</Badge> },
    {
      key: 'lastLogin', header: 'Last Login',
      render: (row: User) => (row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'),
    },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      render: (row: User) => (
        <div className="flex justify-end gap-2">
          {row.status === 'ACTIVE' && (
            <button
              onClick={() => disableMutation.mutate(row.id)}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Disable
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-600 mt-1">Manage staff accounts and roles</p>
        </div>
        <Button onClick={() => setModalOpen(true)} variant="primary">Add User</Button>
      </div>

      <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <DataTable
        data={data?.data || []}
        columns={columns}
        page={data?.page || 1}
        pageSize={20}
        total={data?.total || 0}
        onPageChange={setPage}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User" size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="First Name" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          <Input label="Last Name" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          <Input label="Username" value={form.username} onChange={(e) => set({ username: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <Input label="Password" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} />
          <Input label="Phone (optional)" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => set({ role: e.target.value as NewUserForm['role'] })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {createMutation.isError && (
          <p className="mt-3 text-sm text-red-600">{handleApiError(createMutation.error)}</p>
        )}

        <div className="flex gap-2 mt-4">
          <Button onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>Create User</Button>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
};
