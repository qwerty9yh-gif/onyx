const CART_KEY = 'onyx:cart';
const QUEUE_KEY = 'onyx:offline-sales';
const PRODUCTS_KEY = 'onyx:products';

export interface OfflineSale {
  id: string;
  createdAt: string;
  payload: unknown;
}

export function loadCart<T>(): T[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]') as T[];
  } catch {
    return [];
  }
}

export function saveCart<T>(cart: T[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearCart(): void {
  localStorage.removeItem(CART_KEY);
}

export function loadProducts<T>(): T[] {
  try {
    return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '[]') as T[];
  } catch {
    return [];
  }
}

export function saveProducts<T>(products: T[]): void {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export function queueSale(payload: unknown): OfflineSale {
  const sale: OfflineSale = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), payload };
  const queue = loadQueue();
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, sale]));
  return sale;
}

export function loadQueue(): OfflineSale[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as OfflineSale[];
  } catch {
    return [];
  }
}

export function removeQueuedSale(id: string): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(loadQueue().filter((sale) => sale.id !== id)));
}
