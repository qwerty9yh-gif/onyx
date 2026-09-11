export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WORKER' | 'WAITER' | 'INVENTORY_STAFF';
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'INVITED';
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED' | 'OUT_OF_STOCK';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'VOIDED' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QR' | 'OTHER';
export type PurchaseStatus = 'PENDING' | 'ORDERED' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'SALE' | 'REFUND';

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
  phone?: string;
  avatar?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  image?: string;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  contactInfo?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  image?: string;
  categoryId?: string;
  supplierId?: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  taxRate?: number;
  status: ProductStatus;
  localId?: string;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  supplier?: Supplier;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  barcode?: string;
  notes?: string;
  status: string;
  totalSpent: number;
  lastPurchase?: string;
  localId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  total: number;
  product?: Product;
}

export interface Payment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface Refund {
  id: string;
  originalSaleId: string;
  cashierId: string;
  reason: string;
  total: number;
  amountRefunded: number;
  paymentMethod: PaymentMethod;
  status: string;
  completedAt: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  cashierId: string;
  customerId?: string;
  customerPhone?: string | null;
  waiterId?: string;
  waiter?: { id: string; firstName: string; lastName: string } | null;
  status: TransactionStatus;
  syncStatus: string;
  subtotal: number;
  discount: number;
  discountType: string;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountReceived: number;
  change: number;
  notes?: string;
  deviceId?: string;
  localId?: string;
  idempotencyKey: string;
  completedAt?: string;
  voidedAt?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
  cashier?: User;
  customer?: Customer;
  items: SaleItem[];
  payments: Payment[];
  refund?: Refund;
  }

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  product?: Product;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  notes?: string;
  orderNumber?: string;
  status: PurchaseStatus;
  subtotal: number;
  tax: number;
  total: number;
  localId?: string;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  items: PurchaseItem[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  userId: string;
  type: MovementType;
  quantity: number;
  unitPrice?: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  notes?: string;
  referenceId?: string;
  createdAt: string;
  product?: Product;
  user?: User;
}

export interface InventoryBatchItem {
  id: string;
  batchId: string;
  productId: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  createdAt: string;
  product?: { id: string; name: string; sku: string };
}

export interface InventoryBatch {
  id: string;
  batchNumber: string;
  cashierId?: string | null;
  supplierId?: string | null;
  totalProducts: number;
  totalUnits: number;
  clientBatchId?: string | null;
  syncStatus?: string;
  createdAt: string;
  updatedAt?: string;
  cashier?: { id: string; firstName: string; lastName: string; username: string } | null;
  supplier?: { id: string; name: string } | null;
  items?: InventoryBatchItem[];
}

export interface Business {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxRate: number;
  currency: string;
  receiptPrefix: string;
  logo?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  user?: { firstName?: string; lastName?: string } | null;
}

export interface DashboardStats {
  today: { sales: number; revenue: number };
  week: { sales: number; revenue: number };
  month: { sales: number; revenue: number };
  totalTransactions: number;
  avgTransaction: number;
  lowStock: number;
  outOfStock?: number;
  pendingInvoices?: number;
  topProducts: Array<{
    id: string;
    name: string;
    image?: string;
    sku: string;
    quantity: number;
    total: number;
  }>;
  topCategories: Array<Record<string, unknown>>;
  recentActivity?: AuditLogEntry[];
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
