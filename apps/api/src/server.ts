import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createSyncfyAutoSyncScheduler } from "./modules/accounts/providers/syncfy/syncfyAutoSyncScheduler.js";

const server = app.listen(env.API_PORT, () => {
  console.log(`FlowLedger API listening on port ${env.API_PORT}`);
});
const syncfyAutoSyncScheduler = createSyncfyAutoSyncScheduler();
syncfyAutoSyncScheduler.start();

async function shutdown() {
  syncfyAutoSyncScheduler.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
