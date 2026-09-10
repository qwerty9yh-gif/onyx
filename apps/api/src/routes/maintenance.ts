import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { config } from '../config/index.js';
import { prisma } from '../utils/prisma.js';

const router = Router();
const RESET_CONFIRMATION = 'RESET ALL TEST DATA AND CREATE ACCOUNTS';

const accountTemplates = [
  { email: 'admin@onyx.com', username: 'onyx.admin', firstName: 'Onyx', lastName: 'Administrator', role: 'ADMIN' as const },
  { email: 'manager@onyx.com', username: 'onyx.manager', firstName: 'Store', lastName: 'Manager', role: 'MANAGER' as const },
  { email: 'cashier@onyx.com', username: 'onyx.cashier', firstName: 'Front', lastName: 'Cashier', role: 'CASHIER' as const },
  { email: 'stock@onyx.com', username: 'onyx.stock', firstName: 'Stock', lastName: 'Keeper', role: 'INVENTORY_STAFF' as const },
];

function hasValidResetToken(value: string | undefined): boolean {
  if (!config.databaseResetEnabled || !config.databaseResetToken || !value) return false;
  const expected = Buffer.from(config.databaseResetToken);
  const received = Buffer.from(value);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

router.post('/reset-all', async (req, res, next) => {
  try {
    if (!hasValidResetToken(req.header('x-database-reset-token'))) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.body?.confirmation !== RESET_CONFIRMATION) {
      return res.status(400).json({ error: `confirmation must be exactly: ${RESET_CONFIRMATION}` });
    }

    const before = await prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        (SELECT COUNT(*) FROM "User") AS users,
        (SELECT COUNT(*) FROM "Product") AS products,
        (SELECT COUNT(*) FROM "Sale") AS sales,
        (SELECT COUNT(*) FROM "Customer") AS customers
    `;

    const temporaryPasswords = accountTemplates.map(() => crypto.randomBytes(18).toString('base64url'));

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE
      "Session", "Device", "RolePermission", "AuditLog", "SyncOperation",
      "InventoryMovement", "RefundItem", "Refund", "Payment", "SaleItem",
      "CustomerPurchase", "Sale", "PurchaseItem", "Purchase", "Product",
      "Category", "Supplier", "Customer", "Business", "Settings", "User"
      RESTART IDENTITY CASCADE`);

      for (const [index, account] of accountTemplates.entries()) {
        await tx.user.create({
          data: {
            ...account,
            status: 'ACTIVE',
            passwordHash: await bcrypt.hash(temporaryPasswords[index], 12),
          },
        });
      }
    });

    return res.json({
      success: true,
      message: 'All application data was reset and fresh accounts were created',
      deleted: Object.fromEntries(Object.entries(before[0] || {}).map(([key, value]) => [key, Number(value)])),
      accounts: accountTemplates.map((account, index) => ({ ...account, temporaryPassword: temporaryPasswords[index] })),
    });
  } catch (error) {
    return next(error);
  }
});

export { router as maintenanceRouter };