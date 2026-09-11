/**
 * NB80 hardware barcode scanner integration.
 *
 * The NB80 built-in scanner behaves like a keyboard wedge (HID): when the
 * physical scan trigger is pressed it types the code very fast and normally
 * finishes with an "Enter" key. We exploit the timing signature of a wedge —
 * characters arriving with gaps well below human typing speed — to reliably
 * detect a hardware scan and dispatch a single `onyx:barcode` DOM event that
 * the rest of the app can subscribe to. No camera, no browser scanner, no
 * third-party library.
 */

const SCAN_EVENT = 'onyx:barcode';

// Timing parameters tuned for hardware wedges.
const MAX_KEY_GAP_MS = 45;       // gap above this => manual typing, reset buffer
const MAX_SCAN_DURATION_MS = 160; // whole code must arrive this fast
const MIN_CODE_LENGTH = 3;
const FLUSH_DELAY_MS = 100;       // flush used when the wedge sends no Enter

let initialized = false;
let buffer = '';
let bufferStart = 0;
let lastKeyTime = 0;
let flushTimer: number | null = null;

function clearFocusedInput(): void {
  const active = document.activeElement;
  if (!active) return;
  if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') return;
  const input = active as HTMLInputElement | HTMLTextAreaElement;
  try {
    input.value = '';
  } catch {
    // readonly inputs can throw — ignore
  }
}

function dispatchScan(barcode: string): void {
  const detail = { barcode, timestamp: Date.now() };
  window.dispatchEvent(new CustomEvent(SCAN_EVENT, { detail }));
}

function flushScan(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!buffer) return;
  const duration = Date.now() - bufferStart;
  const isScan = buffer.length >= MIN_CODE_LENGTH && duration <= MAX_SCAN_DURATION_MS;
  const barcode = buffer;
  buffer = '';
  bufferStart = 0;
  lastKeyTime = 0;
  if (isScan) {
    // The wedge typed into a focused field — remove the code from it.
    clearFocusedInput();
    dispatchScan(barcode);
  }
}

function onKey(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;

  // Any normal key reset the pending timer bookkeeping before we re-arm it.
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (event.key === 'Enter') {
    if (buffer) {
      event.preventDefault(); // stop form submit / button activation
      flushScan();
    }
    return;
  }

  if (event.key.length === 1 && !event.repeat) {
    const now = Date.now();
    if (!bufferStart || now - lastKeyTime > MAX_KEY_GAP_MS) {
      buffer = '';
      bufferStart = now;
    }
    buffer += event.key;
    lastKeyTime = now;
    // If the device does not send Enter, flush shortly after the last char.
    flushTimer = window.setTimeout(flushScan, FLUSH_DELAY_MS);
  }
}

/**
 * Install the global hardware-scan listener once. Safe to call repeatedly.
 */
export function initBarcodeScanner(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('keydown', onKey);
}

/**
 * Subscribe to hardware barcode scans. Returns an unsubscribe function.
 */
export function onBarcodeScan(handler: (barcode: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<{ barcode?: string }>).detail;
    if (detail?.barcode) handler(detail.barcode);
  };
  window.addEventListener(SCAN_EVENT, listener);
  return () => window.removeEventListener(SCAN_EVENT, listener);
}