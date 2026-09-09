import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Product } from '../../lib/types';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Plus, Edit, Trash2, Package, Eye } from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;

  const { data, isLoading } = useQuery<{ data: Product[]; total: number; page: number; totalPages: number }>({
    queryKey: ['products', search, page],
    queryFn: () =>
      api
        .get('/products', { params: { search, page, limit } })
        .then((res) => res.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteModalOpen(false);
      setProductToDelete(null);
    },
  });

  const handleDelete = (p: Product) => {
    setProductToDelete(p);
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (productToDelete) deleteMutation.mutate(productToDelete.id);
  };

  const columns = [
    {
      key: 'name',
      header: 'Product',
      render: (row: Product) => (
        <div className="flex items-center gap-3">
          {row.image ? <img src={row.image} alt={row.name} className="w-10 h-10 rounded object-cover" /> : <Package size={24} className="text-gray-400" />}
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-sm text-gray-500">{row.sku}</div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row: Product) => row.category?.name || '—' },
    {
      key: 'price',
      header: 'Price',
      render: (row: Product) => `$${row.sellingPrice.toFixed(2)}`,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (row: Product) => (
        <div className="flex items-center gap-2">
          <span>{row.stockQuantity}</span>
          {row.stockQuantity === 0 && <Badge variant="danger">Out</Badge>}
          {row.stockQuantity > 0 && row.stockQuantity <= 10 && <Badge variant="warning">Low</Badge>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Product) => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row: Product) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(`/products/${row.id}`)} className="p-1 text-gray-600 hover:text-gray-900" title="View">
            <Eye size={16} />
          </button>
          <button onClick={() => navigate(`/products/${row.id}/edit`)} className="p-1 text-blue-600 hover:text-blue-800" title="Edit">
            <Edit size={16} />
          </button>
          <button onClick={() => handleDelete(row)} className="p-1 text-red-600 hover:text-red-800" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your product catalog</p>
        </div>
        <Button onClick={() => navigate('/products/new')} variant="primary">
          <Plus size={16} className="mr-2" /> Add Product
        </Button>
      </div>

      <DataTable
        data={data?.data || []}
        columns={columns}
        page={data?.page || 1}
        pageSize={limit}
        total={data?.total || 0}
        onPageChange={(p) => navigate(`?page=${p}`)}
        onSearch={setSearch}
        searchValue={search}
        searchPlaceholder="Search products..."
      />

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete"
      >
        <p>Are you sure you want to delete <strong>{productToDelete?.name}</strong>?</p>
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} size="sm">Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteMutation.isPending} size="sm">Delete</Button>
        </div>
      </Modal>
    </div>
  );
};
