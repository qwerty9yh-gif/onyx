export const CURRENCY = 'GHS';
export const CURRENCY_SYMBOL = 'GH₵';
export const CURRENCY_CODE = 'GHS';

export function formatMoney(value: number | null | undefined, options?: { showSymbol?: boolean }): string {
  if (value == null || Number.isNaN(value)) return 'GH₵0.00';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = value < 0 ? '-' : '';
  return options?.showSymbol !== false ? `${signed}GH₵${formatted}` : `${signed}${formatted}`;
}

export function parseMoney(raw: string): number {
  const cleaned = String(raw).replace(/[GH₵$,\s]/g, '').trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}
