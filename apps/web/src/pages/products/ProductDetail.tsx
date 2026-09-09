import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Product, InventoryMovement } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Edit, Package, History } from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: product } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then((res) => res.data.data),
    enabled: !!id,
  });

  const { data: movements } = useQuery<InventoryMovement[]>({
    queryKey: ['inventory-movements', id],
    queryFn: () => api.get(`/inventory/movements`, { params: { productId: id, limit: 20 } }).then((res) => res.data.data),
    enabled: !!id,
  });

  if (!product) {
    return <div className="text-center py-12">Product not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
          <ArrowLeft size={16} className="mr-2" />Back
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {product.image ? (
              <img src={product.image} alt={product.name} className="w-24 h-24 rounded object-cover" />
            ) : (
              <Package size={48} className="text-gray-400" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{product.name}</h1>
              <p className="text-sm text-gray-500">SKU: {product.sku}</p>
              {product.barcode && <p className="text-sm text-gray-500">Barcode: {product.barcode}</p>}
            </div>
          </div>
          <Badge variant={product.status === 'ACTIVE' ? 'success' : 'default'}>{product.status}</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div><p className="text-xs text-gray-500">Cost Price</p><p className="font-medium">${product.costPrice.toFixed(2)}</p></div>
          <div><p className="text-xs text-gray-500">Selling Price</p><p className="font-medium">${product.sellingPrice.toFixed(2)}</p></div>
          <div><p className="text-xs text-gray-500">Stock</p><p className="font-medium">{product.stockQuantity}</p></div>
          <div><p className="text-xs text-gray-500">Min Stock</p><p className="font-medium">{product.minimumStock}</p></div>
        </div>

        {product.description && <p className="mt-4 text-sm text-gray-700">{product.description}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={() => navigate(`/products/${product.id}/edit`)} variant="secondary">
            <Edit size={16} className="mr-2" /> Edit
          </Button>
        </div>
      </div>

      {movements && movements.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><History size={18} />Stock Movement History</h2>
          <div className="space-y-2">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b">
                <div>
                  <span className="font-medium">{m.type.replace('_', ' ')}</span>
                  <span className="text-sm text-gray-500"> by {m.user?.firstName} {m.user?.lastName}</span>
                </div>
                <div className="text-right">
                  <p className="font-medium">{m.quantity} units</p>
                  <p className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
