import { qrMatrix, qrSvgDataUrl } from './qr';
import type { PaymentMethod } from './types';

const VENUE_NAME = 'ONYX LOUNGE / PUB';
const VENUE_LOCATION = 'Malam Bawi';
const VENUE_PHONE = '0555554167';
const formatCedi = (value: number) => `GH₵${value.toFixed(2)}`;

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
  customer?: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountReceived: number;
  change: number;
}

export interface InvoiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  storeName: string;
  invoiceNumber: string;
  cashier: string;
  createdAt: string;
  customer?: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status?: string;
  dueDate?: string;
}

const ESC = '\x1b';
const GS = '\x1d';

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

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
    text(`${ESC}@${ESC}a\x01ONYX POS\n`),
    text(`${ESC}a\x00${VENUE_NAME}\n${VENUE_LOCATION}\n${VENUE_PHONE}\n`),
    text(`${ESC}a\x01Receipt ${receipt.receiptNumber}\n`),
    text(`${ESC}a\x00${receipt.createdAt}\nCashier: ${receipt.cashier}${receipt.customer ? `\nCustomer: ${receipt.customer}` : ''}\n`),
    text('------------------------------------------\n'),
  ];

  for (const line of receipt.lines) {
    chunks.push(text(` ${line.name.slice(0, 26)}\n  ${line.quantity} x ${formatCedi(line.unitPrice)}  ${formatCedi(line.total)}\n`));
  }

  chunks.push(text('------------------------------------------\n'));
  chunks.push(text(`Subtotal:                 ${formatCedi(receipt.subtotal)}\nDiscount:                 ${formatCedi(receipt.discount)}\nTax:                      ${formatCedi(receipt.tax)}\n`));
  chunks.push(text(`${ESC}a\x01TOTAL:                    ${formatCedi(receipt.total)}\n`));
  chunks.push(text(`${ESC}a\x00Paid (${receipt.paymentMethod}):        ${formatCedi(receipt.amountReceived)}\nChange:                   ${formatCedi(receipt.change)}\n\nThank you for choosing ONYX!\n\n`));
  chunks.push(buildQrRaster(qr, 4, 2));
  chunks.push(text(`\n${ESC}a\x01${receipt.storeName}\n`));
  chunks.push(text(`${ESC}a\x00`));
  chunks.push(text(`${GS}V\x01`));
  return concat(chunks);
}

export function buildEscPosInvoice(invoice: InvoiceData): Uint8Array {
  const qr = qrMatrix(`ONYX|${invoice.invoiceNumber}|${invoice.total.toFixed(2)}`);
  const chunks: Uint8Array[] = [
    text(`${ESC}@${ESC}a\x01ONYX POS\n`),
    text(`${ESC}a\x00${VENUE_NAME}\n${VENUE_LOCATION}\n${VENUE_PHONE}\n`),
    text(`${ESC}a\x01Invoice ${invoice.invoiceNumber}\n`),
    text(`${ESC}a\x00${invoice.createdAt}\nCashier: ${invoice.cashier}${invoice.customer ? `\nCustomer: ${invoice.customer}` : ''}\nStatus: ${invoice.status || 'UNPAID'} ${invoice.dueDate ? ` · Due ${invoice.dueDate}` : ''}\n`),
    text('------------------------------------------\n'),
  ];

  for (const line of invoice.lines) {
    chunks.push(text(` ${line.name.slice(0, 26)}\n  ${line.quantity} x ${formatCedi(line.unitPrice)}  ${formatCedi(line.total)}\n`));
  }

  chunks.push(text('------------------------------------------\n'));
  chunks.push(text(`Subtotal:                 ${formatCedi(invoice.subtotal)}\nDiscount:                 ${formatCedi(invoice.discount)}\nTax:                      ${formatCedi(invoice.tax)}\n`));
  chunks.push(text(`${ESC}a\x01TOTAL DUE:                ${formatCedi(invoice.total)}\n`));
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
  @page { size: 80mm auto; margin: 4mm; }
  .sheet { width: 72mm; padding: 2mm; }
  header { text-align: center; }
  header h1 { font-size: 26px; letter-spacing: 1px; margin: 0; color: #b91c1c; }
  header .meta { font-size: 11px; color: #222; margin-top: 4px; line-height: 1.25; }
  header .doc { font-size: 16px; font-weight: 800; color: #111; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; }
  .infos { width: 100%; margin-top: 14px; border-collapse: collapse; }
  .infos td { padding: 2px; font-size: 11px; }
  .infos td:first-child { color: #777; }
  .items { width: 100%; margin-top: 14px; border-collapse: collapse; }
  .items th { border-bottom: 2px solid #222; padding: 7px 2px; text-align: left; font-size: 14px; text-transform: uppercase; letter-spacing: 0; }
  .items td { border-bottom: 1px solid #ddd; padding: 4px 2px; font-size: 11px; }
  .items .c { text-align: center; }
  .items .r { text-align: right; }
  .items .lbl { font-size: 15px; color: #111; font-weight: 700; }
  .items .sep td { border: 0; }
  .items .grand td { font-size: 20px; font-weight: 800; border-top: 2px solid #222; }
  .qr { text-align: center; margin: 18px 0; }
  footer { text-align: center; font-size: 14px; color: #222; margin-top: 14px; }
  @media print { .sheet { padding: 0; } }
`;

function printDocument(html: string, title: string): void {
  const win = window.open('', '_blank', 'width=480,height=820');
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${html}</body></html>`;

  if (!win) {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', title);
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      frame.remove();
      return;
    }

    frameDocument.open();
    frameDocument.write(documentHtml);
    frameDocument.close();
    frame.onload = () => {
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    return;
  }

  try {
    win.document.write(documentHtml);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 600);
  } catch {
    win.close();
  }
}

export function printReceipt(receipt: ReceiptData): void {
  const qr = qrSvgDataUrl(`ONYX|${receipt.receiptNumber}|${receipt.total.toFixed(2)}`, 6, 4);
  const html = `
    <div class="sheet">
      <header>
        <h1>ONYX POS</h1>
        <div class="meta">${VENUE_NAME}<br/>${VENUE_LOCATION}<br/>${VENUE_PHONE}</div>
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
          ${receipt.lines.map((line) => `<tr><td>${line.name}</td><td class="c">${line.quantity}</td><td class="r">${formatCedi(line.unitPrice)}</td><td class="r">${formatCedi(line.total)}</td></tr>`).join('')}
          <tr class="sep"><td colspan="4"></td></tr>
          <tr><td colspan="3" class="lbl">Subtotal</td><td class="r">${formatCedi(receipt.subtotal)}</td></tr>
          <tr><td colspan="3" class="lbl">Discount</td><td class="r">-${formatCedi(receipt.discount)}</td></tr>
          <tr><td colspan="3" class="lbl">Tax</td><td class="r">${formatCedi(receipt.tax)}</td></tr>
          <tr class="grand"><td colspan="3">TOTAL</td><td class="r">${formatCedi(receipt.total)}</td></tr>
          <tr><td colspan="3" class="lbl">Amount received</td><td class="r">${formatCedi(receipt.amountReceived)}</td></tr>
          <tr><td colspan="3" class="lbl">Change</td><td class="r">${formatCedi(receipt.change)}</td></tr>
        </tbody>
      </table>
      <div class="qr"><img src="${qr}" alt="QR" width="120" height="120" /></div>
      <footer>Thank you for choosing ONYX POS</footer>
    </div>`;
  printDocument(html, `Receipt ${receipt.receiptNumber}`);
}

export function printInvoice(invoice: InvoiceData): void {
  const qr = qrSvgDataUrl(`ONYX|${invoice.invoiceNumber}|${invoice.total.toFixed(2)}`, 6, 4);
  const html = `
    <div class="sheet">
      <header>
        <h1>ONYX POS</h1>
        <div class="meta">${VENUE_NAME}<br/>${VENUE_LOCATION}<br/>${VENUE_PHONE}</div>
        <div class="doc">INVOICE</div>
      </header>
      <table class="infos">
        <tr><td>Invoice</td><td><strong>${invoice.invoiceNumber}</strong></td></tr>
        <tr><td>Date</td><td>${invoice.createdAt}</td></tr>
        <tr><td>Cashier</td><td>${invoice.cashier}</td></tr>
        ${invoice.customer ? `<tr><td>Customer</td><td>${invoice.customer}</td></tr>` : ''}
        <tr><td>Status</td><td><strong>${invoice.status || 'UNPAID'}</strong></td></tr>
        ${invoice.dueDate ? `<tr><td>Due</td><td>${invoice.dueDate}</td></tr>` : ''}
      </table>
      <table class="items">
        <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
        <tbody>
          ${invoice.lines.map((line) => `<tr><td>${line.name}</td><td class="c">${line.quantity}</td><td class="r">${formatCedi(line.unitPrice)}</td><td class="r">${formatCedi(line.total)}</td></tr>`).join('')}
          <tr class="sep"><td colspan="4"></td></tr>
          <tr><td colspan="3" class="lbl">Subtotal</td><td class="r">${formatCedi(invoice.subtotal)}</td></tr>
          <tr><td colspan="3" class="lbl">Discount</td><td class="r">-${formatCedi(invoice.discount)}</td></tr>
          <tr><td colspan="3" class="lbl">Tax</td><td class="r">${formatCedi(invoice.tax)}</td></tr>
          <tr class="grand"><td colspan="3">TOTAL DUE</td><td class="r">${formatCedi(invoice.total)}</td></tr>
        </tbody>
      </table>
      <div class="qr"><img src="${qr}" alt="QR" width="120" height="120" /></div>
      <footer>This invoice can be reopened and marked as paid.<br/>Thank you for choosing ONYX POS</footer>
    </div>`;
  printDocument(html, `Invoice ${invoice.invoiceNumber}`);
}