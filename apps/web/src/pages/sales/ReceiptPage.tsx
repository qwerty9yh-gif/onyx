import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { Sale, SaleItem } from '../../lib/types';
import { money } from '../../lib/helpers';
import { printReceipt, type ReceiptData } from '../../lib/printer';

export const ReceiptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: sale } = useQuery<Sale>({
    queryKey: ['sale', id],
    queryFn: () => api.get('/sales/' + id).then((res) => res.data.data),
    enabled: !!id,
  });

  if (!sale) return <div className="p-8">Sale not found</div>;

  const print = () => {
    const receipt: ReceiptData = {
      storeName: 'ONYX LOUNGE / PUB',
      receiptNumber: sale.receiptNumber,
      cashier: sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : 'ONYX POS',
      createdAt: new Date(sale.createdAt).toLocaleString(),
      lines: sale.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      amountReceived: sale.amountReceived,
      change: sale.change,
    };
    printReceipt(receipt);
  };

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">Receipt #{sale.receiptNumber}</h2>
        <button onClick={print} className="text-gray-600" title="Print receipt"><Printer size={20} /></button>
      </div>
      <table className="w-full text-sm">
        <thead><tr><th className="text-left">Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          {sale.items.map((item: SaleItem) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="text-center">{item.quantity}</td>
              <td>{money(item.unitPrice)}</td>
              <td>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t pt-4 mt-4">
        <div>Subtotal: {money(sale.subtotal)}</div>
        <div>Discount: {money(sale.discount)}</div>
        <div>Tax: {money(sale.tax)}</div>
        <div className="font-bold">Total: {money(sale.total)}</div>
        <div>Paid: {money(sale.amountReceived)}</div>
        <div>Change: {money(sale.change)}</div>
      </div>
    </div>
  );
};

