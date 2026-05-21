import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("flowledger-demo", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@flowledger.local" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@flowledger.local",
      passwordHash
    }
  });

  const account = await prisma.account.upsert({
    where: { id: "demo-checking-account" },
    update: {},
    create: {
      id: "demo-checking-account",
      userId: user.id,
      name: "Checking",
      type: "checking",
      identifier: "Local demo"
    }
  });

  const groceries = await prisma.category.upsert({
    where: { id: "demo-groceries-category" },
    update: {},
    create: {
      id: "demo-groceries-category",
      userId: user.id,
      name: "Groceries",
      type: "expense",
      color: "#ef4444"
    }
  });

  const salary = await prisma.category.upsert({
    where: { id: "demo-salary-category" },
    update: {},
    create: {
      id: "demo-salary-category",
      userId: user.id,
      name: "Salary",
      type: "income",
      color: "#22c55e"
    }
  });

  await prisma.transaction.createMany({
    data: [
      {
        id: "demo-salary-transaction",
        userId: user.id,
        accountId: account.id,
        categoryId: salary.id,
        name: "Monthly salary",
        amount: 4200,
        type: "income",
        date: new Date()
      },
      {
        id: "demo-market-transaction",
        userId: user.id,
        accountId: account.id,
        categoryId: groceries.id,
        name: "Market run",
        amount: 86.45,
        type: "expense",
        date: new Date(),
        notes: "Demo transaction"
      }
    ],
    skipDuplicates: true
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
