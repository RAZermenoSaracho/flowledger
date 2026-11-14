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
      username: "demo",
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
    update: {
      users: {
        connectOrCreate: {
          where: {
            categoryId_userId: {
              categoryId: "demo-groceries-category",
              userId: user.id
            }
          },
          create: { userId: user.id }
        }
      }
    },
    create: {
      id: "demo-groceries-category",
      name: "Groceries",
      type: "expense",
      color: "#ef4444",
      users: { create: { userId: user.id } }
    }
  });

  const salary = await prisma.category.upsert({
    where: { id: "demo-salary-category" },
    update: {
      users: {
        connectOrCreate: {
          where: {
            categoryId_userId: {
              categoryId: "demo-salary-category",
              userId: user.id
            }
          },
          create: { userId: user.id }
        }
      }
    },
    create: {
      id: "demo-salary-category",
      name: "Salary",
      type: "income",
      color: "#22c55e",
      users: { create: { userId: user.id } }
    }
  });

  const card = await prisma.account.upsert({
    where: { id: "demo-credit-card-account" },
    update: {},
    create: {
      id: "demo-credit-card-account",
      userId: user.id,
      name: "Demo credit card",
      type: "credit_card",
      identifier: "Local demo",
      creditLimit: "30000",
      statementClosingDay: 20,
      paymentDueRule: "day_of_next_month",
      paymentDueValue: 20,
      billingTimeZone: "America/Mexico_City",
      annualInterestRate: "60"
    }
  });

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cardEntry = (id: string, name: string, amount: string, date: Date) => ({
    id,
    userId: user.id,
    accountId: card.id,
    categoryId: groceries.id,
    name,
    amount,
    accountAmount: amount,
    amountInPreferredCurrency: Number(amount),
    type: "expense" as const,
    date
  });

  await prisma.transaction.createMany({
    data: [
      cardEntry("demo-card-purchase-before-closing", "Card purchase before closing", "3200", daysAgo(45)),
      cardEntry("demo-card-purchase-after-closing", "Card purchase after closing", "1250.50", daysAgo(10)),
      {
        id: "demo-card-payment",
        userId: user.id,
        accountId: account.id,
        transferToAccountId: card.id,
        name: "Card payment",
        amount: "2000",
        accountAmount: "2000",
        destinationAmount: "2000",
        amountInPreferredCurrency: 2000,
        type: "transfer",
        date: daysAgo(30)
      }
    ],
    skipDuplicates: true
  });

  await prisma.transaction.createMany({
    data: [
      {
        id: "demo-salary-transaction",
        userId: user.id,
        accountId: account.id,
        categoryId: salary.id,
        name: "Monthly salary",
        amount: "4200",
        accountAmount: "4200",
        amountInPreferredCurrency: 4200,
        type: "income",
        date: new Date()
      },
      {
        id: "demo-market-transaction",
        userId: user.id,
        accountId: account.id,
        categoryId: groceries.id,
        name: "Market run",
        amount: "86.45",
        accountAmount: "86.45",
        amountInPreferredCurrency: 86.45,
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
