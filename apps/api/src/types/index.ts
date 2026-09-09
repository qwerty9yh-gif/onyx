import { Request } from 'express';
import { User, Role } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: Role;
    firstName: string;
    lastName: string;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SyncOperationPayload {
  localId: string;
  entity: string;
  operationType: 'create' | 'update' | 'delete';
  payload: unknown;
  timestamp: string;
  deviceId: string;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  tax: number;
  total: number;
}

export interface PaymentInfo {
  method: string;
  amountReceived: number;
  change: number;
}

export interface TransactionData {
  customerId?: string;
  paymentMethod: string;
  amountReceived: number;
  notes?: string;
  cart: Cart;
}
