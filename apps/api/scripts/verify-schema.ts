import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const expectedTables = [
  'AuditLog',
  'Business',
  'Category',
  'Customer',
  'CustomerPurchase',
  'Device',
  'InventoryMovement',
  'Payment',
  'Product',
  'Purchase',
  'PurchaseItem',
  'Refund',
  'RefundItem',
  'RolePermission',
  'Sale',
  'SaleItem',
  'Session',
  'Settings',
  'Supplier',
  'SyncOperation',
  'User',
];

async function main() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const actualTables = rows.map(({ table_name }) => table_name);
  const missingTables = expectedTables.filter((table) => !actualTables.includes(table));

  console.log(`Public ONYX tables found: ${actualTables.join(', ') || '(none)'}`);
  if (missingTables.length > 0) {
    throw new Error(`Missing Prisma tables: ${missingTables.join(', ')}`);
  }

  console.log(`Schema verification passed: ${expectedTables.length} Prisma tables are present.`);
}

main()
  .catch((error) => {
    console.error('Schema verification failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());