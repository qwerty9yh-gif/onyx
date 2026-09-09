import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, Shield, UserRound, UsersRound } from 'lucide-react';

const panels = [
  { title: "Today's Incoming", text: 'Review deliveries and stock received today.', to: '/purchases', icon: CalendarDays },
  { title: 'Waiter Account', text: 'Open waiter account activity and balances.', to: '/users?role=CASHIER', icon: UserRound },
  { title: 'Cashier Account', text: 'Review cashier account activity and sales.', to: '/transactions', icon: ClipboardList },
  { title: 'Other Staff', text: 'Manage staff access and account records.', to: '/users', icon: UsersRound },
];

export const IncomingPage: React.FC = () => (
  <div className="mx-auto max-w-6xl space-y-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-widest text-red-700">Operations</p>
      <h1 className="text-3xl font-bold text-slate-900">Incoming</h1>
      <p className="mt-1 text-sm text-slate-500">Choose an incoming workflow to continue.</p>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      {panels.map(({ title, text, to, icon: Icon }) => (
        <Link key={title} to={to} className="group rounded-3xl border border-white/80 bg-white/90 p-6 shadow-lg shadow-slate-200/60 transition hover:-translate-y-1 hover:shadow-xl">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700 transition group-hover:bg-red-600 group-hover:text-white"><Icon size={22} /></span>
          <h2 className="mt-5 text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-500">{text}</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-red-700">Open panel <span aria-hidden="true">-&gt;</span></span>
        </Link>
      ))}
    </div>
    <div className="flex items-start gap-3 rounded-3xl border border-red-100 bg-red-50 p-5 text-sm text-red-800"><Shield size={20} className="mt-0.5 shrink-0" /><p>Incoming operations are restricted to authorized staff. Stock receipt and account changes are recorded by the API.</p></div>
  </div>
);
