import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { accountsRouter } from "./modules/accounts/accounts.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import {
  debtsRouter,
  settlementsRouter
} from "./modules/debts/debts.routes.js";
import { groupsRouter } from "./modules/groups/groups.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { providersRouter } from "./modules/providers/providers.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { sharedExpensesRouter } from "./modules/shared-expenses/sharedExpenses.routes.js";
import { transactionsRouter } from "./modules/transactions/transactions.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import syncfyRoutes from "./modules/providers/syncfy/syncfy.routes.js";

const app = express();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(moduleDir, "../uploads");

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/uploads", express.static(uploadDir));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/users", requireAuth, usersRouter);
app.use("/accounts", requireAuth, accountsRouter);
app.use("/categories", requireAuth, categoriesRouter);
app.use("/groups", requireAuth, groupsRouter);
app.use("/notifications", requireAuth, notificationsRouter);
app.use("/providers", requireAuth, providersRouter);
app.use("/debts", requireAuth, debtsRouter);
app.use("/settlements", requireAuth, settlementsRouter);
app.use("/transactions", requireAuth, transactionsRouter);
app.use("/shared-expenses", requireAuth, sharedExpensesRouter);
app.use("/reports", requireAuth, reportsRouter);
app.use("/syncfy", syncfyRoutes);
app.use(errorHandler);

const server = app.listen(env.API_PORT, () => {
  console.log(`FlowLedger API listening on port ${env.API_PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
