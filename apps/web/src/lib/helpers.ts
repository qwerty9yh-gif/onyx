export function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

export function calculateTotal(subtotal: number, discount: number, tax: number): number {
  return Number((subtotal - discount + tax).toFixed(2));
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount || 0);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function calculateTax(amount: number, taxRate: number): number {
  return Number((amount * taxRate).toFixed(2));
}

export function calculateDiscount(amount: number, discount: number, type: 'percentage' | 'fixed'): number {
  if (type === 'percentage') {
    return Number((amount * (discount / 100)).toFixed(2));
  }
  return Math.min(discount, amount);
}

export function calculateChange(amountReceived: number, total: number): number {
  return Number((amountReceived - total).toFixed(2));
}

export function calculateSubtotal(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
}
