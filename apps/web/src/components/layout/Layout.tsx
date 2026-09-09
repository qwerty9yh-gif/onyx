import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Navigation } from './Navigation';
import { TopBar } from './TopBar';
import { MobileSidebar } from './MobileSidebar';

export const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="hidden md:flex md:flex-col md:w-64 md:bg-gray-900 md:text-white">
        <div className="flex items-center justify-center h-14 border-b border-gray-800">
          <h1 className="text-xl font-bold">POS System</h1>
        </div>
        <Navigation />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
