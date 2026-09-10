import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, handleApiError } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import type { User } from '../../lib/types';

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER', 'INVENTORY_STAFF'] as const;

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
  const [notice, setNotice] = useState('');
  const [usernameEditId, setUsernameEditId] = useState<string | null>(null);
  const [usernameEditValue, setUsernameEditValue] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserLabel, setSelectedUserLabel] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [workerUsernameEditId, setWorkerUsernameEditId] = useState<string | null>(null);
  const [workerUsernameEditValue, setWorkerUsernameEditValue] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => api.get('/users', { params: { page, limit: 20, search: search || undefined } }).then((res) => res.data),
  });
  const { data: workers = [] } = useQuery<User[]>({
    queryKey: ['admin-workers'],
    queryFn: () => api.get('/admin/workers').then((res) => res.data.data),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
      setNotice('Account enabled successfully.');
    },
  });

  const editUsernameMutation = useMutation({
    mutationFn: ({ id, username }: { id: string; username: string }) => api.put(`/users/${id}`, { username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
      setUsernameEditId(null);
      setWorkerUsernameEditId(null);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/users/${id}/change-password`, { newPassword: password }),
    onSuccess: () => {
      setPasswordModalOpen(false);
      setNotice('Password changed successfully.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const openPasswordModal = (user: User) => {
    setSelectedUserId(user.id);
    setSelectedUserLabel(`${user.firstName} ${user.lastName}`);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordModalOpen(true);
  };

  const handlePasswordSubmit = () => {
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    if (!selectedUserId) return;
    setPasswordError('');
    changePasswordMutation.mutate({ id: selectedUserId, password: newPassword });
  };

  const handleWorkerUsernameSave = (worker: User) => {
    if (workerUsernameEditValue.trim() && workerUsernameEditValue.trim() !== worker.username) {
      editUsernameMutation.mutate({ id: worker.id, username: workerUsernameEditValue.trim() });
    } else {
      setWorkerUsernameEditId(null);
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { restoreDefault?: boolean; temporaryPassword?: string } }) => api.post(`/admin/workers/${id}/reset-password`, payload),
    onSuccess: () => {
      setNotice('Worker password reset successfully. The worker must change it at next login.');
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
    },
  });

  const resetWorkerPassword = (worker: User) => {
    const restoreDefault = window.confirm(`Reset ${worker.firstName}'s password to the default format?`);
    if (restoreDefault) {
      resetPasswordMutation.mutate({ id: worker.id, payload: { restoreDefault: true } });
      return;
    }
    const temporaryPassword = window.prompt(`Enter a temporary password for ${worker.firstName} (minimum 8 characters):`);
    if (temporaryPassword) resetPasswordMutation.mutate({ id: worker.id, payload: { temporaryPassword } });
  };

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
        <div className="flex flex-wrap justify-end gap-1">
          {row.status === 'ACTIVE' ? (
            <button
              onClick={() => disableMutation.mutate(row.id)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Disable
            </button>
          ) : (
            <button
              onClick={() => enableMutation.mutate(row.id)}
              className="text-xs text-emerald-600 hover:text-emerald-800"
            >
              Enable
            </button>
          )}

          {usernameEditId === row.id ? (
            <>
              <input
                type="text"
                value={usernameEditValue}
                onChange={(e) => setUsernameEditValue(e.target.value)}
                className="w-28 text-xs rounded border border-gray-300 px-1 py-0.5"
                placeholder="username"
              />
              <button
                onClick={() => {
                  if (usernameEditValue.trim() && usernameEditValue.trim() !== row.username) {
                    editUsernameMutation.mutate({ id: row.id, username: usernameEditValue.trim() });
                  } else {
                    setUsernameEditId(null);
                  }
                }}
                className="text-xs text-emerald-600 hover:text-emerald-800"
              >
                Save
              </button>
              <button
                onClick={() => setUsernameEditId(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setUsernameEditId(row.id);
                setUsernameEditValue(row.username);
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Edit Username
            </button>
          )}

          <button
            onClick={() => openPasswordModal(row)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Change Password
          </button>
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

            <section className="rounded-3xl border border-red-100 bg-white/90 p-5 shadow-lg shadow-red-950/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Worker Management</h2>
            <p className="text-sm text-slate-500">Active worker accounts and password controls</p>
          </div>
          {notice && <p className="text-sm font-semibold text-emerald-700">{notice}</p>}
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {workers.map((worker) => (
            <div key={worker.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-slate-900">{worker.firstName} {worker.lastName} <span className="font-normal text-slate-500">@{worker.username}</span></p>
                <p className="text-sm text-slate-500">{worker.email}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant={worker.status === 'ACTIVE' ? 'success' : 'danger'}>{worker.status}</Badge>

                {worker.status === 'ACTIVE' ? (
                  <button
                    onClick={() => disableMutation.mutate(worker.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                    title="Disable worker"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    onClick={() => enableMutation.mutate(worker.id)}
                    className="text-xs text-emerald-600 hover:text-emerald-800"
                    title="Enable worker"
                  >
                    Enable
                  </button>
                )}

                {workerUsernameEditId === worker.id ? (
                  <>
                    <input
                      type="text"
                      value={workerUsernameEditValue}
                      onChange={(e) => setWorkerUsernameEditValue(e.target.value)}
                      className="w-28 text-xs rounded border border-gray-300 px-1 py-0.5"
                      placeholder="username"
                    />
                    <button
                      onClick={() => handleWorkerUsernameSave(worker)}
                      className="text-xs text-emerald-600 hover:text-emerald-800"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setWorkerUsernameEditId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setWorkerUsernameEditId(worker.id);
                      setWorkerUsernameEditValue(worker.username);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                    title="Edit username"
                  >
                    Edit Username
                  </button>
                )}

                <button
                  onClick={() => openPasswordModal(worker)}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                  title="Change password"
                >
                  Change Password
                </button>

                <Button variant="outline" size="sm" onClick={() => resetWorkerPassword(worker)} loading={resetPasswordMutation.isPending}>Reset Password</Button>
              </div>
            </div>
          ))}
          {workers.length === 0 && <p className="py-4 text-sm text-slate-500">No worker accounts found.</p>}
        </div>
      </section>

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

      {/* Change Password Modal */}
      <Modal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title={`Change Password: ${selectedUserLabel}`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 8 characters)"
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
          {passwordError && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}
          {changePasswordMutation.isError && (
            <p className="text-sm text-red-600">{handleApiError(changePasswordMutation.error)}</p>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handlePasswordSubmit} loading={changePasswordMutation.isPending}>Save Password</Button>
          <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
};
