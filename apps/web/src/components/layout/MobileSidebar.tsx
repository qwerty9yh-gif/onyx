import React from 'react';
import { X } from 'lucide-react';
import { Navigation } from './Navigation';

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({ open, onClose }) => {
  return (
    <div
      className={`fixed inset-0 z-50 md:hidden transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="absolute left-0 top-0 h-full w-64 border-r border-red-100 bg-white text-slate-900 shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-red-100 bg-brand-700 px-4">
          <h1 className="text-lg font-extrabold tracking-wider text-white">ONYX POS</h1>
          <button onClick={onClose} className="rounded p-1 text-white hover:bg-brand-800">
            <X size={20} />
          </button>
        </div>
        <Navigation />
      </div>
    </div>
  );
};
