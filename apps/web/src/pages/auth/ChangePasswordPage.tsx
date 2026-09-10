import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { api, handleApiError } from '../../lib/api';
import { getUser, setUser } from '../../lib/auth';
import { Button } from '../../components/ui/Button';

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname || '/dashboard';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      if (user) setUser({ ...user, mustChangePassword: false });
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(handleApiError(requestError));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <form onSubmit={submit} className="onyx-glass w-full max-w-md rounded-3xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-white"><LockKeyhole size={22} /></span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">First login</p>
            <h1 className="text-2xl font-bold text-slate-900">Change your password</h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600">A new password is required before you continue.</p>
        <div className="mt-6 space-y-4">
          <input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current temporary password" className="onyx-focus-ring h-12 w-full rounded-2xl border border-red-200 bg-red-50 px-4 outline-none" />
          <input required type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="onyx-focus-ring h-12 w-full rounded-2xl border border-red-200 bg-red-50 px-4 outline-none" />
          <input required type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="onyx-focus-ring h-12 w-full rounded-2xl border border-red-200 bg-red-50 px-4 outline-none" />
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <Button type="submit" className="mt-6 w-full rounded-2xl bg-brand-700 hover:bg-brand-800" loading={busy}>Save new password</Button>
      </form>
    </div>
  );
};
