export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReceiptData {
  storeName: string;
  receiptNumber: string;
  cashier: string;
  createdAt: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountReceived: number;
  change: number;
}

const ESC = '\x1b';
const GS = '\x1d';

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function buildEscPosReceipt(receipt: ReceiptData): Uint8Array {
  const chunks: Uint8Array[] = [
    text(`${ESC}@${ESC}a\x01${receipt.storeName}\n`),
    text(`${ESC}a\x00Receipt ${receipt.receiptNumber}\n${receipt.createdAt}\nCashier: ${receipt.cashier}\n`),
    text('------------------------------------------\n'),
  ];
  for (const line of receipt.lines) {
    chunks.push(text(`${line.name.slice(0, 24)}\n${line.quantity} x ${line.unitPrice.toFixed(2)}  ${line.total.toFixed(2)}\n`));
  }
  chunks.push(text('------------------------------------------\n'));
  chunks.push(text(`Subtotal:                 ${receipt.subtotal.toFixed(2)}\nDiscount:                 ${receipt.discount.toFixed(2)}\nTax:                      ${receipt.tax.toFixed(2)}\nTOTAL:                    ${receipt.total.toFixed(2)}\nPaid (${receipt.paymentMethod}):          ${receipt.amountReceived.toFixed(2)}\nChange:                   ${receipt.change.toFixed(2)}\n\nThank you for shopping with us!\n\n\n`));
  chunks.push(text(`${GS}V\x00`));
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function printReceipt(receipt: ReceiptData): Promise<'browser' | 'escpos'> {
  const bytes = buildEscPosReceipt(receipt);
  const printer = (window as Window & { onyxPrinter?: { print: (data: Uint8Array) => Promise<void> } }).onyxPrinter;
  if (printer) {
    await printer.print(bytes);
    return 'escpos';
  }
  window.print();
  return 'browser';
}
