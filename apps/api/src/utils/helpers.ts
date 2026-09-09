import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config/index.js';

export function generateId(): string {
  return randomUUID();
}

export function generateReceiptNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `REC-${year}-${month}-${day}-${random}`;
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}-${month}-${day}-${random}`;
}

export function generateSyncId(): string {
  return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateIdempotencyKey(): string {
  return `idem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: object, expiresIn: string = config.jwtExpiresIn): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateDeviceFingerprint(): string {
  const parts: string[] = [];
  const nav = (globalThis as { navigator?: { userAgent?: string; language?: string; platform?: string } }).navigator;
  if (nav) {
    if (nav.userAgent) parts.push(nav.userAgent);
    if (nav.language) parts.push(nav.language);
    if (nav.platform) parts.push(nav.platform);
  }
  const random = Math.random().toString(36).substr(2, 9);
  return `fp_${Buffer.from(parts.join('|')).toString('base64')}_${random}`;
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string, format: string = 'yyyy-MM-dd'): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  switch (format) {
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`;
    case 'dd/MM/yyyy':
      return `${day}/${month}/${year}`;
    case 'MM/dd/yyyy':
      return `${month}/${day}/${year}`;
    case 'yyyy-MM-dd HH:mm:ss':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case 'dd/MM/yyyy HH:mm':
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    default:
      return d.toISOString();
  }
}

export function calculateTax(amount: number, taxRate: number): number {
  return Number((amount * taxRate).toFixed(2));
}

export function calculateDiscount(amount: number, discount: number, type: 'percentage' | 'fixed'): number {
  if (type === 'percentage') {
    return Number((amount * (discount / 100)).toFixed(2));
  }
  return Math.min(discount, amount);
}

export function calculateChange(amountReceived: number, total: number): number {
  const change = amountReceived - total;
  if (change < 0) {
    throw new Error('Insufficient payment amount');
  }
  return Number(change.toFixed(2));
}

export function calculateSubtotal(items: Array<{ quantity: number; unitPrice: number }>): number {
  return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
}

export function calculateTotal(subtotal: number, discount: number, tax: number): number {
  return Number((subtotal - discount + tax).toFixed(2));
}

export function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validatePhoneNumber(phone: string): boolean {
  const regex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return regex.test(phone);
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/<[^>]*>/g, '');
}

export function parseDecimal(value: string | number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
