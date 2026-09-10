import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, KeyRound, LockKeyhole, Plus, Power, PowerOff, RefreshCw, Search, ShieldCheck, UserCog, Users } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import type { User, UserRole } from '../../lib/types';

const ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'WORKER', 'WAITER', 'INVENTORY_STAFF'] as const;
const WORKER_ROLES: UserRole[] = ['CASHIER', 'WORKER', 'WAITER'];
const isWorkerRole = (role: string): boolean => WORKER_ROLES.includes(role as UserRole);
const displayName = (u: Pick<User, 'firstName' | 'lastName' | 'username'>): string =>
  `${u.firstName} ${u.lastName}`.trim() || u.username;
const roleBadge = (role: string) =>
  role === 'ADMIN' ? 'danger' : isWorkerRole(role) ? 'info' : 'default';
const statusBadge = (status: string) =>
  status === 'ACTIVE' ? 'success' : status === 'INVITED' ? 'warning' : 'danger';

interface NewUserForm {
  email: string; username: string; password: string;
  firstName: string; lastName: string;
  role: (typeof ROLES)[number]; phone: string;
}

const EMPTY_FORM: NewUserForm = {
  email: '', username: '', password: '', firstName: '', lastName: '',
  role: 'CASHIER', phone: '',
};

type TabKey = 'all' | 'staff' | 'workers';
type ModalKind = 'create' | 'manage' | 'username' | 'password' | 'reset' | null;

export const UsersPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [notice, setNotice] = useState('');
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [usernameValue, setUsernameValue] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetMode, setResetMode] = useState<'default' | 'custom'>('default');
  const [resetPassword, setResetPassword] = useState('');
  const queryClient = useQueryClient();
  const selectedLabel = selected ? displayName(selected) : '';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => api.get('/users', { params: { page, limit: 20, search: search || undefined } }).then((res) => res.data),
  });

  const allUsers: User[] = useMemo(() => data?.data || [], [data]);
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const visibleUsers = useMemo(() => {
    if (tab === 'workers') return allUsers.filter((u) => isWorkerRole(u.role));
    if (tab === 'staff') return allUsers.filter((u) => !isWorkerRole(u.role));
    return allUsers;
  }, [allUsers, tab]);

  const counts = useMemo(() => ({
    all: allUsers.length,
    staff: allUsers.filter((u) => !isWorkerRole(u.role)).length,
    workers: allUsers.filter((u) => isWorkerRole(u.role)).length,
    active: allUsers.filter((u) => u.status === 'ACTIVE').length,
    disabled: allUsers.filter((u) => u.status !== 'ACTIVE').length,
  }), [allUsers]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
  };

  const closeModal = () => {
    setActiveModal(null);
    setPasswordError('');
  };

  const openFor = (user: User, kind: Exclude<ModalKind, 'create' | null>) => {
    setSelected(user);
    setUsernameValue(user.username);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setResetMode('default');
    setResetPassword('');
    setActiveModal(kind);
  };

  const createMutation = useMutation({
    mutationFn: (payload: NewUserForm) => api.post('/users', payload),
    onSuccess: () => { refresh(); setActiveModal(null); setForm(EMPTY_FORM); setNotice('User created successfully.'); },
  });
  const toggleStatusMutation = useMutation({
    mutationFn: (user: User) =>
      user.status === 'ACTIVE' ? api.delete(`/users/${user.id}`) : api.patch(`/users/${user.id}/enable`),
    onSuccess: (_d, user) => {
      refresh();
      setNotice(user.status === 'ACTIVE' ? `Account disabled for ${displayName(user)}.` : `Account enabled for ${displayName(user)}.`);
      if (activeModal === 'manage') closeModal();
    },
  });
  const editUsernameMutation = useMutation({
    mutationFn: ({ id, username }: { id: string; username: string }) => api.put(`/users/${id}`, { username }),
    onSuccess: () => { refresh(); closeModal(); setNotice(`Username updated for ${selectedLabel}.`); },
  });
  const changePasswordMutation = useMutation({
    mutationFn: ({ id, pw }: { id: string; pw: string }) => api.post(`/users/${id}/change-password`, { newPassword: pw }),
    onSuccess: () => { refresh(); closeModal(); setNotice(`Password changed for ${selectedLabel}.`); },
  });
  const resetWorkerMutation = useMutation({
    mutationFn: ({ id, restoreDefault, temporaryPassword }: { id: string; restoreDefault: boolean; temporaryPassword?: string }) =>
      api.post(`/admin/workers/${id}/reset-password`, { restoreDefault, temporaryPassword }),
    onSuccess: () => { refresh(); closeModal(); setNotice(`Worker password reset for ${selectedLabel}.`); },
  });
  const handleUsernameSubmit = () => {
    if (!selected) return;
    const next = usernameValue.trim();
    if (next.length < 3) { setPasswordError('Username must be at least 3 characters.'); return; }
    setPasswordError('');
    editUsernameMutation.mutate({ id: selected.id, username: next });
  };

  const handlePasswordSubmit = () => {
    if (!selected) return;
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordError('');
    changePasswordMutation.mutate({ id: selected.id, pw: newPassword });
  };

  const handleResetSubmit = () => {
    if (!selected) return;
    if (resetMode === 'custom' && resetPassword.length < 8) return;
    resetWorkerMutation.mutate({
      id: selected.id,
      restoreDefault: resetMode === 'default',
      temporaryPassword: resetMode === 'custom' ? resetPassword : undefined,
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const TABS: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All Accounts', icon: <Users size={15} />, count: counts.all },
    { key: 'staff', label: 'Staff & Admins', icon: <ShieldCheck size={15} />, count: counts.staff },
    { key: 'workers', label: 'Workers', icon: <UserCog size={15} />, count: counts.workers },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">User Accounts</h1>
          <p className="text-sm text-slate-500">One place for every account: enable, edit login details, and reset passwords.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refresh(); }}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setActiveModal('create'); }}>
            <Plus size={15} /> Add User
          </Button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-900">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="onyx-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white"><Users size={18} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p><p className="text-xl font-extrabold text-slate-900">{total || counts.all}</p><p className="text-xs text-slate-500">{counts.workers} workers</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="onyx-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white"><Power size={18} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active</p><p className="text-xl font-extrabold text-slate-900">{counts.active}</p><p className="text-xs text-slate-500">Can log in now</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="onyx-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white"><PowerOff size={18} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disabled</p><p className="text-xl font-extrabold text-slate-900">{counts.disabled}</p><p className="text-xs text-slate-500">Needs enabling</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="onyx-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white"><UserCog size={18} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workers</p><p className="text-xl font-extrabold text-slate-900">{counts.workers}</p><p className="text-xs text-slate-500">Crew accounts</p></div>
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-red-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'onyx-brand-gradient text-white shadow-glow-red' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-brand-700'}`}
            >
              {t.icon}{t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === t.key ? 'bg-white/25 text-white' : 'bg-white text-slate-600'}`}>{t.count}</span>
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, email, username..."
              className="w-full rounded-xl border border-red-100 bg-red-50/60 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading accounts...</td></tr>
              ) : visibleUsers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No accounts in this view. Try another tab or clear the search.</td></tr>
              ) : visibleUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 transition hover:bg-red-50/40">
                  <td className="px-4 py-3">
                    <button onClick={() => openFor(u, 'manage')} className="text-left">
                      <p className="font-bold text-slate-900 hover:text-brand-700">{displayName(u)}</p>
                      <p className="text-xs text-slate-500">@{u.username} â€¢ {u.email}</p>
                    </button>
                    {u.mustChangePassword && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Must change password</span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant={roleBadge(u.role) as 'danger' | 'info' | 'default'} size="sm">{u.role}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={statusBadge(u.status) as 'success' | 'warning' | 'danger'} size="sm">{u.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" title="Open account card" onClick={() => openFor(u, 'manage')}><UserCog size={14} /></Button>
                      <Button size="sm" variant="outline" title="Edit username" onClick={() => openFor(u, 'username')}><Edit2 size={14} /></Button>
                      <Button size="sm" variant="outline" title="Change password" onClick={() => openFor(u, 'password')}><LockKeyhole size={14} /></Button>
                      {u.status === 'ACTIVE' ? (
                        <Button size="sm" variant="outline" title="Disable account" onClick={() => toggleStatusMutation.mutate(u)}><PowerOff size={14} /></Button>
                      ) : (
                        <Button size="sm" title="Enable account" onClick={() => toggleStatusMutation.mutate(u)}><Power size={14} /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>Total {total} accounts â€¢ Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
      <Modal open={activeModal === 'manage'} onClose={closeModal} title={selected ? `Account: ${selectedLabel}` : 'Account'} size="md">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={roleBadge(selected.role) as 'danger' | 'info' | 'default'}>{selected.role}</Badge>
              <Badge variant={statusBadge(selected.status) as 'success' | 'warning' | 'danger'}>{selected.status}</Badge>
              {isWorkerRole(selected.role) && <Badge variant="info">Worker</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p><span className="font-semibold text-slate-500">Name: </span>{selectedLabel}</p>
              <p><span className="font-semibold text-slate-500">Username: </span>@{selected.username}</p>
              <p><span className="font-semibold text-slate-500">Email: </span>{selected.email}</p>
              <p><span className="font-semibold text-slate-500">Last login: </span>{selected.lastLogin ? new Date(selected.lastLogin).toLocaleString() : 'Never'}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => setActiveModal('username')}><Edit2 size={15} /> Edit Username</Button>
              <Button variant="outline" onClick={() => setActiveModal('password')}><LockKeyhole size={15} /> Change Password</Button>
              {isWorkerRole(selected.role) && (
                <Button variant="outline" onClick={() => setActiveModal('reset')}><KeyRound size={15} /> Reset Worker Password</Button>
              )}
              {selected.status === 'ACTIVE' ? (
                <Button variant="outline" onClick={() => toggleStatusMutation.mutate(selected)} loading={toggleStatusMutation.isPending}><PowerOff size={15} /> Disable Account</Button>
              ) : (
                <Button onClick={() => toggleStatusMutation.mutate(selected)} loading={toggleStatusMutation.isPending}><Power size={15} /> Enable Account</Button>
              )}
            </div>
            {toggleStatusMutation.isError && <p className="text-sm text-red-600">{handleApiError(toggleStatusMutation.error)}</p>}
          </div>
        )}
      </Modal>
      <Modal open={activeModal === 'username'} onClose={closeModal} title={`Edit Username: ${selectedLabel}`} size="md">
        <div className="space-y-4">
          <Input label="Username" value={usernameValue} onChange={(e) => setUsernameValue(e.target.value)} placeholder="Minimum 3 characters" />
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {editUsernameMutation.isError && <p className="text-sm text-red-600">{handleApiError(editUsernameMutation.error)}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleUsernameSubmit} loading={editUsernameMutation.isPending}>Save Username</Button>
          <Button variant="outline" onClick={closeModal}>Cancel</Button>
        </div>
      </Modal>

      <Modal open={activeModal === 'password'} onClose={closeModal} title={`Change Password: ${selectedLabel}`} size="md">
        <div className="space-y-4">
          <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
          <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {changePasswordMutation.isError && <p className="text-sm text-red-600">{handleApiError(changePasswordMutation.error)}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handlePasswordSubmit} loading={changePasswordMutation.isPending}>Save Password</Button>
          <Button variant="outline" onClick={closeModal}>Cancel</Button>
        </div>
      </Modal>
      <Modal open={activeModal === 'reset'} onClose={closeModal} title={`Reset Password: ${selectedLabel}`} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Only for worker accounts. The worker must change this password after logging in.</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={resetMode === 'default'} onChange={() => setResetMode('default')} /> Restore default password</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={resetMode === 'custom'} onChange={() => setResetMode('custom')} /> Set temporary password</label>
          </div>
          {resetMode === 'custom' && (
            <Input label="Temporary Password" type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Minimum 8 characters" error={resetPassword.length > 0 && resetPassword.length < 8 ? 'Must be at least 8 characters' : undefined} />
          )}
          {resetWorkerMutation.isError && <p className="text-sm text-red-600">{handleApiError(resetWorkerMutation.error)}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleResetSubmit} loading={resetWorkerMutation.isPending} disabled={resetMode === 'custom' && resetPassword.length < 8}>Reset Password</Button>
          <Button variant="outline" onClick={closeModal}>Cancel</Button>
        </div>
      </Modal>
      <Modal open={activeModal === 'create'} onClose={closeModal} title="Add User" size="lg">
        <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="First Name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <Input label="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as NewUserForm['role'] })} className="w-full rounded-xl border border-red-100 bg-red-50/60 px-3.5 py-2.5 text-sm outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" loading={createMutation.isPending}>Create User</Button>
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
          </div>
          {createMutation.isError && <p className="text-sm text-red-600 sm:col-span-2">{handleApiError(createMutation.error)}</p>}
        </form>
      </Modal>
    </div>
  );
};
