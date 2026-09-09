import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import type { UserRole } from './lib/types';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { ProductForm } from './pages/products/ProductForm';
import { ProductDetail } from './pages/products/ProductDetail';
import { SalesPage } from './pages/sales/SalesPage';
import { ReceiptPage } from './pages/sales/ReceiptPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { CustomerForm } from './pages/customers/CustomerForm';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { SupplierForm } from './pages/suppliers/SupplierForm';
import { PurchasesPage } from './pages/purchases/PurchasesPage';
import { PurchaseForm } from './pages/purchases/PurchaseForm';
import { CategoriesPage } from './pages/categories/CategoriesPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { UsersPage } from './pages/users/UsersPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SyncPage } from './pages/SyncPage';
import { TransactionsPage } from './pages/transactions/TransactionsPage';
import { IncomingPage } from './pages/incoming/IncomingPage';

const RequireAuth = () => {
  const location = useLocation();
  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

const RequireRole: React.FC<{ roles: UserRole[] }> = ({ roles }) => {
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then((res) => res.data.data),
    retry: false,
  });
  if (!user || !roles.includes(user.role)) return <Navigate to="/sales" replace />;
  return <Outlet />;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/sales/:id/receipt" element={<ReceiptPage />} />
          <Route element={<RequireRole roles={['ADMIN', 'MANAGER', 'INVENTORY_STAFF']} />}>
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<ProductForm />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/products/:id/edit" element={<ProductForm />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/purchases/new" element={<PurchaseForm />} />
            <Route path="/purchases/:id/edit" element={<PurchaseForm />} />
            <Route path="/inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<RequireRole roles={['ADMIN', 'MANAGER']} />}>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/new" element={<CustomerForm />} />
            <Route path="/customers/:id/edit" element={<CustomerForm />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/suppliers/new" element={<SupplierForm />} />
            <Route path="/suppliers/:id/edit" element={<SupplierForm />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/sync" element={<SyncPage />} />
          </Route>
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/incoming" element={<IncomingPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
