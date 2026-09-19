import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// Paths that should NOT trigger automatic logout on 401
const SKIP_LOGOUT_PATHS = ['/auth/card-login', '/auth/users'];

// Ensure Authorization header is always attached if a token exists
api.interceptors.request.use((config) => {
  const storedToken = localStorage.getItem('onyx_token');
  const hasAuth = !!config.headers?.Authorization;
  if (storedToken && !hasAuth) {
    config.headers.Authorization = `Bearer ${storedToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const path = error.config?.url || '';
    if (status === 401 && !SKIP_LOGOUT_PATHS.some((p) => path.includes(p))) {
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export { money } from './helpers';
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  meta?: Record<string, unknown>;
}

export function handleApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const err = error as {
      response?: {
        data?: { error?: string; message?: string; details?: string[] | string };
      };
    };
    const data = err.response?.data;
    const base = data?.error || data?.message;
    // Surface field-level validation details so genuinely invalid values are
    // explained instead of showing a bare "Validation failed".
    const details = Array.isArray(data?.details)
      ? data!.details!.join(', ')
      : typeof data?.details === 'string'
        ? data.details
        : '';
    if (base) return details ? `${base}: ${details}` : base;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'An unexpected error occurred';
}


export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSmsInvoice(saleId: string, phone?: string): Promise<SmsSendResult> {
  const res = await api.post(`/sales/${saleId}/sms-invoice`, { phone: phone || undefined });
  return { success: res.data.success === true, messageId: res.data.data?.messageId, error: res.data.data?.error };
}

export async function sendSmsReceipt(saleId: string, phone?: string): Promise<SmsSendResult> {
  const res = await api.post(`/sales/${saleId}/sms-receipt`, { phone: phone || undefined });
  return { success: res.data.success === true, messageId: res.data.data?.messageId, error: res.data.data?.error };
}

export async function broadcastCustomerSms(title: string, message: string): Promise<{ success: boolean; sent: number; failed: number; total: number }> {
  const res = await api.post('/customers/broadcast', { title, message });
  return res.data.data as { success: boolean; sent: number; failed: number; total: number };
}

export async function messageCustomer(customerId: string, title: string, message: string): Promise<SmsSendResult> {
  const res = await api.post(`/customers/${customerId}/message`, { title, message });
  return { success: res.data.success === true, messageId: res.data.data?.messageId, error: res.data.data?.error };
}

/**
 * Fetch the staff members that can appear in the transaction waiter filter.
 * Full-access roles see every waiter; normal workers only see themselves so
 * they can never pick another worker's open order.
 */
export async function getWaitersForTransaction(staffId?: string): Promise<
  Array<{ id: string; firstName: string; lastName: string; role?: string }>
> {
  const res = await api.get('/sales/waiters', { params: { staffId: staffId || undefined } });
  return res.data.data as Array<{ id: string; firstName: string; lastName: string; role?: string }>;
}

/**
 * Fetch the OPEN (unpaid) transactions for a specific waiter. Used by the
 * Sales "Order" picker so the cashier can continue an existing unpaid order.
 */
export async function getOpenTransactionsForWaiter(staffId?: string): Promise<
  Array<{
    id: string;
    receiptNumber: string;
    status: string;
    total: number;
    amountPaid?: number | null;
    remaining?: number | null;
    customerNote?: string | null;
    waiterId?: string | null;
    cashierId?: string | null;
    createdAt: string;
  }>
> {
  const res = await api.get('/sales/open-orders', { params: { staffId: staffId || undefined } });
  return res.data.data as Array<{
    id: string;
    receiptNumber: string;
    status: string;
    total: number;
    amountPaid?: number | null;
    remaining?: number | null;
    customerNote?: string | null;
    waiterId?: string | null;
    cashierId?: string | null;
    createdAt: string;
  }>;
}

/**
 * Append new cart items to an existing OPEN (unpaid) transaction.
 * The existing transaction/invoice ID is reused — no new transaction or
 * invoice is created, and previously ordered products are never removed.
 */
export async function appendToSale(
  saleId: string,
  items: Array<{ productId: string; quantity: number; discount?: number; discountType?: string }>,
  customerNote?: string,
): Promise<{ id: string; receiptNumber: string; status: string; total: number; amountPaid?: number | null; remaining?: number | null }> {
  const res = await api.post(`/sales/${saleId}/items`, { items, customerNote: customerNote || undefined });
  return res.data.data as { id: string; receiptNumber: string; status: string; total: number; amountPaid?: number | null; remaining?: number | null };
}
