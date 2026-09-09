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
      <div className="absolute top-0 left-0 h-full w-64 bg-gray-900 text-white">
        <div className="flex items-center justify-between h-14 border-b border-gray-800 px-4">
          <h1 className="text-xl font-bold">POS System</h1>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800">
            <X size={20} />
          </button>
        </div>
        <Navigation />
      </div>
    </div>
  );
};
