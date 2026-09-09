import { qrMatrix, qrSvgDataUrl } from './qr';

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
  customer?: string;
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

export interface InvoiceData {
  storeName: string;
  invoiceNumber: string;
  cashier: string;
  customer?: string;
  createdAt: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  dueDate?: string;
}

const ESC = '\x1b';
const GS = '\x1d';

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Build a GS v 0 raster bit image command from a QR boolean matrix (thermal printers). */
function buildQrRaster(qr: { size: number; dark: (row: number, col: number) => boolean }, scale = 4, margin = 2): Uint8Array {
  const moduleCount = qr.size + margin * 2;
  const width = moduleCount * scale;
  const bytesPerRow = Math.ceil(width / 8);
  const raster: number[] = [];
  for (let row = 0; row < moduleCount; row++) {
    let byte = 0;
    let bit = 0;
    for (let col = 0; col < moduleCount; col++) {
      const inMatrix = row >= margin && row < moduleCount - margin && col >= margin && col < moduleCount - margin;
      const dark = inMatrix && qr.dark(row - margin, col - margin);
      for (let s = 0; s < scale; s++) {
        if (dark) byte |= 0x80 >> bit;
        bit = (bit + 1) % 8;
        if (bit === 0) {
          raster.push(byte);
          byte = 0;
        }
      }
    }
    if (bit !== 0) {
      raster.push(byte);
      byte = 0;
      bit = 0;
    }
  }
  const height = moduleCount * scale;
  const header = new Uint8Array([
    GS.charCodeAt(0), 'v'.charCodeAt(0), 48,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  return new Uint8Array([...header, ...raster]);
}

export function buildEscPosReceipt(receipt: ReceiptData): Uint8Array {
  const qr = qrMatrix(`ONYX|${receipt.receiptNumber}|${receipt.total.toFixed(2)}`);
  const chunks: Uint8Array[] = [
    text(`${ESC}@${ESC}a\x01ONYX POS SYSTEM\n`),
    text(` ${ESC}a\x00${receipt.storeName}\n`),
    text(`${ESC}a\x01Receipt ${receipt.receiptNumber}\n`),
    text(`${ESC}a\x00${receipt.createdAt}\nCashier: ${receipt.cashier}${receipt.customer ? `\nCustomer: ${receipt.customer}` : ''}\n`),
    text('------------------------------------------\n'),
  ];
  for (const line of receipt.lines) {
    chunks.push(text(` ${line.name.slice(0, 26)}\n  ${line.quantity} x ${line.unitPrice.toFixed(2)}  ${line.total.toFixed(2)}\n`));
  }
  chunks.push(text('------------------------------------------\n'));
  chunks.push(text(`Subtotal:                 ${receipt.subtotal.toFixed(2)}\nDiscount:                 ${receipt.discount.toFixed(2)}\nTax:                      ${receipt.tax.toFixed(2)}\n`));
  chunks.push(text(`${ESC}a\x01TOTAL:                    ${receipt.total.toFixed(2)}\n`));
  chunks.push(text(`${ESC}a\x00Paid (${receipt.paymentMethod}):        ${receipt.amountReceived.toFixed(2)}\nChange:                   ${receipt.change.toFixed(2)}\n\nThank you for choosing ONYX!\n\n`));
  chunks.push(buildQrRaster(qr, 4, 2));
  chunks.push(text(`\n${ESC}a\x01${receipt.storeName}\n`));
  chunks.push(text(`${ESC}a\x00`));
  chunks.push(text(`${GS}V\x01`));
  return concat(chunks);
}

export function buildEscPosInvoice(invoice: InvoiceData): Uint8Array {
  const qr = qrMatrix(`ONYX|${invoice.invoiceNumber}|${invoice.total.toFixed(2)}`);
  const chunks: Uint8Array[] = [
    text(`${ESC}@${ESC}a\x01ONYX POS SYSTEM\n`),
    text(` ${ESC}a\x00INVOICE · ${invoice.storeName}\n`),
    text(`${ESC}a\x01Invoice ${invoice.invoiceNumber}\n`),
    text(`${ESC}a\x00${invoice.createdAt}\nCashier: ${invoice.cashier}${invoice.customer ? `\nCustomer: ${invoice.customer}` : ''}\nStatus: UNPAID ${invoice.dueDate ? ` · Due ${invoice.dueDate}` : ''}\n`),
    text('------------------------------------------\n'),
  ];
  for (const line of invoice.lines) {
    chunks.push(text(` ${line.name.slice(0, 26)}\n  ${line.quantity} x ${line.unitPrice.toFixed(2)}  ${line.total.toFixed(2)}\n`));
  }
  chunks.push(text('------------------------------------------\n'));
  chunks.push(text(`Subtotal:                 ${invoice.subtotal.toFixed(2)}\nDiscount:                 ${invoice.discount.toFixed(2)}\nTax:                      ${invoice.tax.toFixed(2)}\n`));
  chunks.push(text(`${ESC}a\x01TOTAL DUE:                ${invoice.total.toFixed(2)}\n`));
  chunks.push(text(`${ESC}a\x00This invoice can be reopened and marked as paid.\n\n`));
  chunks.push(buildQrRaster(qr, 4, 2));
  chunks.push(text(`\n${ESC}a\x01${invoice.storeName}\n`));
  chunks.push(text(`${ESC}a\x00`));
  chunks.push(text(`${GS}V\x01`));
  return concat(chunks);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #111; font-family: 'Segoe UI', system-ui, sans-serif; }
  @page { size: A4; margin: 12mm; }
  .sheet { width: 100%; padding: 24px; }
  header { text-align: center; }
  header h1 { font-size: 22px; letter-spacing: 2px; margin: 0; color: #b91c1c; }
  header .meta { font-size: 14px; color: #444; margin-top: 4px; }
  header .doc { font-size: 18px; font-weight: 800; color: #111; text-transform: uppercase; letter-spacing: 6px; margin-top: 6px; }
  .infos { width: 100%; margin-top: 14px; border-collapse: collapse; }
  .infos td { padding: 3px 10px; font-size: 12px; }
  .infos td:first-child { color: #777; }
  .items { width: 100%; margin-top: 14px; border-collapse: collapse; }
  .items th { border-bottom: 2px solid #222; padding: 6px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .items td { border-bottom: 1px solid #ddd; padding: 6px 10px; font-size: 12px; }
  .items .c { text-align: center; }
  .items .r { text-align: right; }
  .items .lbl { font-size: 12px; color: #333; font-weight: 600; }
  .items .sep td { border: 0; }
  .items .grand td { font-size: 15px; font-weight: 800; border-top: 2px solid #222; }
  .qr { text-align: center; margin: 16px 0; }
  footer { text-align: center; font-size: 11px; color: #888; margin-top: 12px; }
  @media print { .sheet { padding: 0; } }
`;

function printDocument(html: string, title: string): void {
  const win = window.open('', '_blank', 'width=480,height=820');
  if (!win) {
    window.print();
    return;
  }
  try {
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${html}</body></html>`,
    );
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 600);
  } catch {
    window.print();
  }
}

/** Print a sales receipt using the browser print dialog. */
export function printReceipt(receipt: ReceiptData): void {
  const qr = qrSvgDataUrl(`ONYX|${receipt.receiptNumber}|${receipt.total.toFixed(2)}`, 6, 4);
  const html = `
    <div class="sheet">
      <header>
        <h1>ONYX POS SYSTEM</h1>
        <div class="meta">${receipt.storeName}</div>
        <div class="doc">SALES RECEIPT</div>
      </header>
      <table class="infos">
        <tr><td>Receipt</td><td><strong>${receipt.receiptNumber}</strong></td></tr>
        <tr><td>Date</td><td>${receipt.createdAt}</td></tr>
        <tr><td>Cashier</td><td>${receipt.cashier}</td></tr>
        ${receipt.customer ? `<tr><td>Customer</td><td>${receipt.customer}</td></tr>` : ''}
        <tr><td>Payment</td><td>${receipt.paymentMethod}</td></tr>
      </table>
      <table class="items">
        <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${receipt.lines.map((l) => `<tr><td>${l.name}</td><td class="c">${l.quantity}</td><td class="r">${l.unitPrice.toFixed(2)}</td><td class="r">${l.total.toFixed(2)}</td></tr>`).join('')}
          <tr class="sep"><td colspan="4"></td></tr>
          <tr><td colspan="3" class="lbl">Subtotal</td><td class="r">${receipt.subtotal.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Discount</td><td class="r">-${receipt.discount.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Tax</td><td class="r">${receipt.tax.toFixed(2)}</td></tr>
          <tr class="grand"><td colspan="3">TOTAL</td><td class="r">${receipt.total.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Amount received</td><td class="r">${receipt.amountReceived.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Change</td><td class="r">${receipt.change.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div class="qr"><img src="${qr}" alt="QR" width="120" height="120" /></div>
      <footer>Thank you for choosing ONYX POS System</footer>
    </div>`;
  printDocument(html, `Receipt ${receipt.receiptNumber}`);
}

/** Print an invoice using the browser print dialog. */
export function printInvoice(invoice: InvoiceData): void {
  const qr = qrSvgDataUrl(`ONYX|${invoice.invoiceNumber}|${invoice.total.toFixed(2)}`, 6, 4);
  const html = `
    <div class="sheet">
      <header>
        <h1>ONYX POS SYSTEM</h1>
        <div class="meta">${invoice.storeName}</div>
        <div class="doc">INVOICE</div>
      </header>
      <table class="infos">
        <tr><td>Invoice</td><td><strong>${invoice.invoiceNumber}</strong></td></tr>
        <tr><td>Date</td><td>${invoice.createdAt}</td></tr>
        <tr><td>Cashier</td><td>${invoice.cashier}</td></tr>
        ${invoice.customer ? `<tr><td>Customer</td><td>${invoice.customer}</td></tr>` : ''}
        <tr><td>Status</td><td><strong>UNPAID</strong></td></tr>
        ${invoice.dueDate ? `<tr><td>Due</td><td>${invoice.dueDate}</td></tr>` : ''}
      </table>
      <table class="items">
        <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${invoice.lines.map((l) => `<tr><td>${l.name}</td><td class="c">${l.quantity}</td><td class="r">${l.unitPrice.toFixed(2)}</td><td class="r">${l.total.toFixed(2)}</td></tr>`).join('')}
          <tr class="sep"><td colspan="4"></td></tr>
          <tr><td colspan="3" class="lbl">Subtotal</td><td class="r">${invoice.subtotal.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Discount</td><td class="r">-${invoice.discount.toFixed(2)}</td></tr>
          <tr><td colspan="3" class="lbl">Tax</td><td class="r">${invoice.tax.toFixed(2)}</td></tr>
          <tr class="grand"><td colspan="3">TOTAL DUE</td><td class="r">${invoice.total.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div class="qr"><img src="${qr}" alt="QR" width="120" height="120" /></div>
      <footer>This invoice can be reopened and marked as paid.<br/>Thank you for choosing ONYX POS System</footer>
    </div>`;
  printDocument(html, `Invoice ${invoice.invoiceNumber}`);
}