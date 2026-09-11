import { api } from './api';
import { User } from './types';

export const TOKEN_KEY = 'onyx_token';
export const USER_KEY = 'onyx_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  delete api.defaults.headers.common['Authorization'];
}

export function getUser(): User | null {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
}

export function setUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** ONYX card login: pick a user card, then enter only the password.
 * POST /auth/card-login returns 200 OK on success, 401 Unauthorized on wrong password.
 * This function throws a typed error so the UI can show "Wrong password." */
export async function loginByCard(userId: string, password: string) {
  const res = await api.post('/auth/card-login', { userId, password });
  if (res.status !== 200) {
    throw new Error(` card-login returned ${res.status} `);
  }
  const { token, user } = res.data.data;
  if (!token) {
    throw new Error('No token received from server');
  }
  setToken(token);
  setUser(user);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // ignore
  }
  clearToken();
}

export function initAuth() {
  const token = getToken();
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
}
