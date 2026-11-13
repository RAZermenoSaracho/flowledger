import { Prisma } from "@prisma/client";
import "./config/env.js";
import { prisma } from "./db/prisma.js";
import { NotificationRunWorker } from "./modules/notificationModels/notificationRunWorker.js";

try {
  await prisma.notificationRun.findFirst({ select: { id: true } });
  await prisma.notificationWorker.count();
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    console.error("notification worker: schema not migrated");
    process.exit(1);
  }
  throw error;
}

const worker = new NotificationRunWorker();
await worker.start();
console.log("notification worker started", { workerId: worker.workerId });

async function shutdown() {
  await worker.stop();
  await prisma.$disconnect();
  console.log("notification worker stopped", { workerId: worker.workerId });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
