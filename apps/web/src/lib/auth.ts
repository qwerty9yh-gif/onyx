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

export async function login(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  const { token, user } = res.data.data;
  setToken(token);
  setUser(user);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  return user;
}

/** ONYX card login: pick a user card, then enter only the password. */
export async function loginByCard(userId: string, password: string) {
  const res = await api.post('/auth/card-login', { userId, password });
  const { token, user } = res.data.data;
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
