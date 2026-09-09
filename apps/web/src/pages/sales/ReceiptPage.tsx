import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { Sale, SaleItem } from '../../lib/types';

export const ReceiptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: sale } = useQuery<Sale>({
    queryKey: ['sale', id],
    queryFn: () => api.get('/sales/' + id).then((res) => res.data.data),
    enabled: !!id,
  });

  if (!sale) return <div className="p-8">Sale not found</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">Receipt #{sale.receiptNumber}</h2>
        <button onClick={() => window.print()} className="text-gray-600"><Printer size={20} /></button>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th className="text-left">Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          {sale.items.map((item: SaleItem) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="text-center">{item.quantity}</td>
              <td>${item.unitPrice.toFixed(2)}</td>
              <td>${item.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t pt-4 mt-4">
        <div>Subtotal: ${sale.subtotal.toFixed(2)}</div>
        <div>Discount: ${sale.discount.toFixed(2)}</div>
        <div>Tax: ${sale.tax.toFixed(2)}</div>
        <div className="font-bold">Total: ${sale.total.toFixed(2)}</div>
        <div>Paid: ${sale.amountReceived.toFixed(2)}</div>
        <div>Change: ${sale.change.toFixed(2)}</div>
      </div>
    </div>
  );
};

