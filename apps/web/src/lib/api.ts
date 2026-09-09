import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// Paths that should NOT trigger automatic logout on 401
const SKIP_LOGOUT_PATHS = ['/auth/login', '/auth/card-login', '/auth/users'];

// Ensure Authorization header is always attached if a token exists
api.interceptors.request.use((config) => {
  const storedToken = localStorage.getItem('onyx_token');
  const hasAuth = !!config.headers?.Authorization;
  if (storedToken && !hasAuth) {
    config.headers.Authorization = `Bearer ${storedToken}`;
    console.log('[ONYX API] Attached stored token to request:', config.url);
  } else if (!storedToken && !hasAuth) {
    console.log('[ONYX API] Request without auth token:', config.url);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const path = error.config?.url || '';
    console.log('[ONYX API] Response status:', status, 'for path:', path);
    if (status === 401 && !SKIP_LOGOUT_PATHS.some((p) => path.includes(p))) {
      console.log('[ONYX API] Unauthorized - triggering logout');
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

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
