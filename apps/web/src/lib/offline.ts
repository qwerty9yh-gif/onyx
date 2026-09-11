const CART_KEY = 'onyx:cart';
const QUEUE_KEY = 'onyx:offline-sales';
const PRODUCTS_KEY = 'onyx:products';
const USER_KEY = 'onyx:current-user';
const DASHBOARD_KEY = 'onyx:dashboard-stats';

export interface OfflineSale {
  id: string;
  createdAt: string;
  payload: unknown;
  attempts?: number;
  lastError?: string;
}

export interface CachedDashboardStats {
  userId: string;
  stats: unknown;
  cachedAt: string;
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

export function markQueuedSaleFailed(id: string, error: string): void {
  const queue = loadQueue().map((sale) => sale.id === id ? { ...sale, attempts: (sale.attempts || 0) + 1, lastError: error } : sale);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function loadCurrentUser<T>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveCurrentUser<T>(user: T): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCurrentUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function cacheDashboardStats(userId: string, stats: unknown): void {
  const cached: CachedDashboardStats = { userId, stats, cachedAt: new Date().toISOString() };
  localStorage.setItem(DASHBOARD_KEY, JSON.stringify(cached));
}

export function loadCachedDashboardStats<T>(userId: string): T | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedDashboardStats;
    if (cached.userId !== userId) return null;
    return cached.stats as T;
  } catch {
    return null;
  }
}

export function clearCachedDashboardStats(): void {
  localStorage.removeItem(DASHBOARD_KEY);
}

export interface OfflineIncomingBatch {
  clientBatchId: string;
  createdAt: string;
  supplierId?: string | null;
  staffName: string;
  totalProducts: number;
  totalUnits: number;
  payload: { supplierId?: string | null; clientBatchId: string; items: Array<{ productId: string; quantity: number }> };
  snapshot: Array<{ productId: string; name: string; sku: string; quantity: number; stockBefore: number; stockAfter: number }>;
  attempts?: number;
  lastError?: string;
}

const INCOMING_BATCH_QUEUE_KEY = 'onyx:incoming-batches';
const INCOMING_BATCH_CACHE_KEY = 'onyx:incoming-batches-cache';
const PRINTED_BATCH_REPORTS_KEY = 'onyx:printed-batch-reports';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadPendingIncomingBatches(): OfflineIncomingBatch[] {
  return readJson<OfflineIncomingBatch[]>(INCOMING_BATCH_QUEUE_KEY, []);
}

export function savePendingIncomingBatches(batches: OfflineIncomingBatch[]): void {
  localStorage.setItem(INCOMING_BATCH_QUEUE_KEY, JSON.stringify(batches));
}

export function queueIncomingBatch(batch: OfflineIncomingBatch): void {
  savePendingIncomingBatches([...loadPendingIncomingBatches(), batch]);
}

export function removePendingIncomingBatch(clientBatchId: string): void {
  savePendingIncomingBatches(loadPendingIncomingBatches().filter((b) => b.clientBatchId !== clientBatchId));
}

export function markPendingIncomingBatchFailed(clientBatchId: string, error: string): void {
  savePendingIncomingBatches(
    loadPendingIncomingBatches().map((b) =>
      b.clientBatchId === clientBatchId ? { ...b, attempts: (b.attempts || 0) + 1, lastError: error } : b,
    ),
  );
}

export interface CachedIncomingBatchSummary {
  id: string;
  batchNumber: string;
  createdAt: string;
  staffName: string;
  totalProducts: number;
  totalUnits: number;
  pendingSync: boolean;
  clientBatchId?: string | null;
}

export function loadCachedIncomingBatches(): CachedIncomingBatchSummary[] {
  return readJson<CachedIncomingBatchSummary[]>(INCOMING_BATCH_CACHE_KEY, []);
}

export function saveCachedIncomingBatches(batches: CachedIncomingBatchSummary[]): void {
  try {
    localStorage.setItem(INCOMING_BATCH_CACHE_KEY, JSON.stringify(batches.slice(0, 100)));
  } catch {
    // storage full — keep serving the previous cache
  }
}

export function markPrintedBatchReport(clientKey: string): void {
  const printed = readJson<string[]>(PRINTED_BATCH_REPORTS_KEY, []);
  if (!printed.includes(clientKey)) {
    try {
      localStorage.setItem(PRINTED_BATCH_REPORTS_KEY, JSON.stringify([...printed, clientKey].slice(-200)));
    } catch {
      // ignore quota errors — printing must never be blocked
    }
  }
}

export function hasPrintedBatchReport(clientKey: string): boolean {
  return readJson<string[]>(PRINTED_BATCH_REPORTS_KEY, []).includes(clientKey);
}

export function triggerInventoryRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inventory:refresh'));
  }
}

export function triggerDashboardRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dashboard:refresh'));
  }
}
