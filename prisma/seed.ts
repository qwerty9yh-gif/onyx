import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Default ONYX POS accounts (idempotent upsert).
const defaultUsers: Array<{
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WORKER' | 'WAITER' | 'INVENTORY_STAFF';
  password: string;
  mustChangePassword: boolean;
}> = [
  { email: 'qwerty9yh@gmail.com', username: 'Admin k', firstName: 'ONYX', lastName: 'Administrator', role: 'ADMIN', password: '123456789', mustChangePassword: false },
  { email: 'helena@onyxlounge.local', username: 'helena', firstName: 'Helena', lastName: 'Worker', role: 'WORKER', password: '123456789H', mustChangePassword: true },
  { email: 'frank@onyxlounge.local', username: 'frank', firstName: 'Frank', lastName: 'Worker', role: 'WAITER', password: '123456789F', mustChangePassword: true },
  { email: 'joy@onyxlounge.local', username: 'joy', firstName: 'Joy', lastName: 'Worker', role: 'WAITER', password: '123456789J', mustChangePassword: true },
  { email: 'dora@onyxlounge.local', username: 'dora', firstName: 'Dora', lastName: 'Worker', role: 'WAITER', password: '123456789D', mustChangePassword: true },
  { email: 'aishat@onyxlounge.local', username: 'aishat', firstName: 'Aishat', lastName: 'Worker', role: 'WAITER', password: '123456789A', mustChangePassword: true },
  { email: 'santos@onyxlounge.local', username: 'santos', firstName: 'Santos', lastName: 'Worker', role: 'WAITER', password: '123456789S', mustChangePassword: true },
];

async function seedUsers() {
  for (const u of defaultUsers) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { username: u.username, role: u.role, status: 'ACTIVE', firstName: u.firstName, lastName: u.lastName, passwordHash, mustChangePassword: u.mustChangePassword, deletedAt: null },
      create: { email: u.email, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role, status: 'ACTIVE', passwordHash, mustChangePassword: u.mustChangePassword },
    });
  }
  console.log(`ONYX accounts ready: ${defaultUsers.length}`);
}

type CatalogItem = [name: string, price: number | null];

const catalog: Record<string, CatalogItem[]> = {
  'Beers / Malt / Soft Drinks': [
    ['Club Big', 25], ['Club Mini', 20], ['Shandy Big', 25], ['Shandy Mini', 20], ['Origin Big', 25], ['Origin Mini', 20],
    ['Freedom Big', 25], ['Freedom Mini', 20], ['Star', 25], ['Gulder', 25], ['Eagle Black', 20], ['Eagle White', 20],
    ['Guinness', 25], ['ABC', 20], ['Malt Bottle', 20], ['Malt Can', 25], ['Smirnoff Black', 30], ['Smirnoff Pineapple', 30],
    ['Smirnoff Can', 35], ['Coca-Cola Can', 25], ['Coca-Cola Mini', 15], ['Coca-Cola 1 Liter', 60], ['Savannah', 40],
    ['Hunters', 40], ['Faxe', 40], ['Water', 5],
  ],
  'Ciders / Energy Drinks / Mixers': [
    ['Kiss', 40], ['Brutal', 40], ['B.B Cocktail', 25], ['Jojo', 20], ['Vits Milk', 20], ["Welch's", 65], ['Kheet', 25],
    ['Soda Water', 10], ['Quinne Tonic', 10], ['Budweiser', 40], ['Heineken', 40], ['Storm', 15], ['Alvaro', 20],
    ['Red Bull', 40], ['Fox', 40], ['Blue Jeans', 40], ['Bullet', 40], ['Vody', 40], ['Darling', 20], ['Bel Ice', 20],
  ],
  Wine: [['Don Simon Big', 70], ['Don Simon Small', 30], ['Don Garcia', 60], ['Sangria Don Simon', 60], ['Sangria Small', 20]],
  'Soft Drinks': [['Spirit Can', 25], ['Cafe Rum', 10], ['Ceres', 10], ['After 5', 5], ['Fanta Lemon', 10], ['Fanta Cocktail', 10], ['Fanta Pineapple', 10], ['Fanta Can', 25], ['Obensuo', 5], ['Striker', 5], ['Goal', 5], ['Obuasi', 5]],
  'Local Bitters': [['Boom Bitters Big', 100], ['Boom Bitters 1 Shot', 5], ['Lime', 5], ['Origin Bitters', 5], ['Carnival Strawberry', 5], ['Black Rock', 5], ['Boom Bitters Small (Bottle)', 25], ['Tonic Wine', 5], ['Lawson De-Ray', 5], ['Ginseng', 5], ['Castle Bridge', 5], ['Almond', 5], ['Mandingo', 5], ['Herbal Frick', 5], ['Amuzy', 5], ['Amega', 5], ['Happy Man', 5]],
  Whiskey: [['Jack Daniel\'s Big', 800], ['Jack Daniel\'s Small', 200], ['Red Label Big', 650], ['Red Label Mini', 160], ['Red Label Small', 30], ['Black Label Big', 800], ['Black Label Mini', 250], ['Black Label Small', 35], ['Black & White Big', 250], ['Black & White Small', 100]],
  Liqueur: [['Baileys Small', 30], ['Baileys Big', 650], ['Jägermeister in Box', 750], ['Jägermeister Big', 700], ['Jägermeister Big Mini', 250], ['Jägermeister Small Mini', 150], ['Jägermeister Small', 60], ['Jägermeister 1 Shot', 30], ['Campari Big', 500], ['Campari Mini', 120], ['Campari Small', 35], ['Campari 1 Shot', 25]],
  'Premium Bottles': [['Monkey Shoulder', 550], ['Monkey Shoulder (1 Shot)', 50], ['Belaire', null], ['Asconi Agor', 300], ['Four Cousins', 300], ['Glenfiddich', 1100], ['Remy Martin', 1100], ['Four Street', 300], ['Four Special', 300]],
  Cognac: [['Hennessy Big', 1200], ['Hennessy Small', 400], ['Hennessy 1 Shot', 55]],
  Vodka: [['Smirnoff Vodka Big', 300], ['Smirnoff Vodka Small', 100], ['Smirnoff Vodka 1 Shot', 25]],
};

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function main() {
  await seedUsers();
  let imported = 0;
  for (const [categoryName, items] of Object.entries(catalog)) {
    const category = await prisma.category.upsert({ where: { id: `catalog-${slug(categoryName).toLowerCase()}` }, update: { name: categoryName, isActive: true }, create: { id: `catalog-${slug(categoryName).toLowerCase()}`, name: categoryName, isActive: true } });
    for (const [name, price] of items) {
      const sku = `CAT-${slug(name)}`;
      const existing = await prisma.product.findFirst({ where: { name } });
      if (existing) continue;
      await prisma.product.create({ data: { name, sku, categoryId: category.id, sellingPrice: price ?? 0, costPrice: 0, stockQuantity: 0, minimumStock: 0, status: 'ACTIVE', localId: `catalog-${slug(name).toLowerCase()}` } });
      imported += 1;
    }
  }
  console.log(`Catalog import complete: ${imported} new products`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
