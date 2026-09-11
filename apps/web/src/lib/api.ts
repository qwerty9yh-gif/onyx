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
    const err = error as { response?: { data?: { error?: string; message?: string } } };
    return err.response?.data?.error || err.response?.data?.message || 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
}


export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSmsInvoice(saleId: string, phone?: string): Promise<SmsSendResult> {
  const res = await api.post(`/sales/${saleId}/sms-invoice`, { phone: phone || undefined });
  return res.data.data as SmsSendResult;
}

export async function broadcastCustomerSms(title: string, message: string): Promise<{ sent: number; failed: number; total: number }> {
  const res = await api.post('/customers/broadcast', { title, message });
  return res.data.data as { sent: number; failed: number; total: number };
}

export async function messageCustomer(customerId: string, title: string, message: string): Promise<SmsSendResult> {
  const res = await api.post(`/customers/${customerId}/message`, { title, message });
  return res.data.data as SmsSendResult;
}
