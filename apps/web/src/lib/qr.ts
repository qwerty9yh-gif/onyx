// @ts-ignore - qrcode-generator ships without types
import qrcode from './qrcode.mjs';

/**
 * ONYX QR helper — wraps the vendored qrcode-generator (MIT, Kazuhiko Arase).
 */

export interface QrModule {
  size: number;
  dark: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): QrModule {
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return { size, dark: (row, col) => qr.isDark(row, col) };
}

/** Build a list of modules (true = dark) for rendering. */
export function qrModules(text: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): boolean[][] {
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < count; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < count; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/** Render a QR code to an SVG data URL (great for browser print receipts/invoices). */
export function qrSvgDataUrl(text: string, cell = 6, margin = 4, level: 'L' | 'M' | 'Q' | 'H' = 'M'): string {
  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const size = cell * count + margin * 2 * cell;
  const cells: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`];
  cells.push(`<rect width="${size}" height="${size}" fill="#ffffff"/>`);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = margin * cell + c * cell;
        const y = margin * cell + r * cell;
        cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#000000"/>`);
      }
    }
  }
  cells.push('</svg>');
  return `data:image/svg+xml;utf8,${encodeURIComponent(cells.join(''))}`;
}