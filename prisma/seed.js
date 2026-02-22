import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 0. Create default admin user
  const adminEmail = 'admin@school.local';
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: adminPassword,
      name: 'Administrator',
      role: 'ADMIN',
    },
  });
  console.log(`Created/Updated admin user: ${admin.email} (password: admin123)`);

  const staffPassword = await bcrypt.hash('staff123', 10);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@school.local' },
    update: {},
    create: { email: 'staff@school.local', password: staffPassword, name: 'Sales Staff', role: 'STAFF' },
  });
  console.log(`Created/Updated staff user: ${staff.email} (password: staff123)`);

  // 1. Create Categories
  const categories = [
    { name: "Boys' Uniform", description: 'All items related to boys school uniform' },
    { name: "Girls' Uniform", description: 'All items related to girls school uniform' },
    { name: 'Books', description: 'Subject and class wise school books' },
  ];

  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
    console.log(`Created/Updated category: ${category.name}`);
  }

  // 2. Create sample items to demonstrate Item Coding (SKU)
  const items = [
    {
      sku: 'BUN-SH-32',
      name: 'Boys Shirt Size 32',
      categoryName: "Boys' Uniform",
      size: '32',
      costPrice: 450,
      salePrice: 600,
      stock: 50,
    },
    {
      sku: 'GUN-SK-M',
      name: 'Girls Skirt Medium',
      categoryName: "Girls' Uniform",
      size: 'M',
      costPrice: 500,
      salePrice: 750,
      stock: 30,
    },
    {
      sku: 'BK-MATH-C5',
      name: 'Mathematics Class 5',
      categoryName: 'Books',
      class: 'Class 5',
      subject: 'Mathematics',
      costPrice: 200,
      salePrice: 300,
      stock: 100,
    },
  ];

  for (const itemData of items) {
    const category = await prisma.category.findUnique({
      where: { name: itemData.categoryName },
    });

    if (category) {
      const item = await prisma.item.upsert({
        where: { sku: itemData.sku },
        update: {},
        create: {
          sku: itemData.sku,
          name: itemData.name,
          size: itemData.size,
          class: itemData.class,
          subject: itemData.subject,
          costPrice: itemData.costPrice,
          salePrice: itemData.salePrice,
          stock: itemData.stock,
          categoryId: category.id,
          transactions: {
            create: {
              type: 'INITIAL_BALANCE',
              quantity: itemData.stock,
              price: itemData.costPrice,
              reference: 'Seeding initial inventory',
            },
          },
        },
      });
      console.log(`Created/Updated item: ${item.sku} - ${item.name}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
