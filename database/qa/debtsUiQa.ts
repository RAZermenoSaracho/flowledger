/**
 * Staging-only, idempotent seed/cleanup/status for the Debts module UI QA.
 * Usage (repo root): npx tsx database/qa/debtsUiQa.ts seed|cleanup|status [--dry-run]
 * Refuses to run unless DATABASE_URL is localhost / flowledger_staging. Everything is created through the API's
 * application services and tagged `[UI QA] `; QA users are `ui-qa-<role>@example.com`.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_USER_KEYS, SCENARIOS, type AcctKey, type Scenario, type Who } from "./debtsUiQa.scenarios.js";

const PREFIX = "[UI QA] ";
const BASE_URL = "https://flowledger-dev.razs.dev";
const CREDENTIALS_FILE = path.join(homedir(), ".flowledger-ui-qa-credentials");
const USAGE = `Usage: npx tsx database/qa/debtsUiQa.ts <seed|cleanup|status> [--dry-run]
  seed     create QA users, accounts, categories and scenarios (idempotent)
  cleanup  delete only [UI QA] records and ui-qa-*@example.com users (--dry-run prints counts only)
  status   print per-section counts and the scenario table with direct URLs
Requires DATABASE_URL = localhost / flowledger_staging and an existing user with username 'razs'.`;

type Actor = { id: string; accounts: Record<AcctKey, string>; shared: string; reimb: string; label: string };
const ACCOUNT_DEFS: Record<AcctKey, { name: string; type: "checking" | "cash" | "savings"; currency: string }> = {
  checking: { name: `${PREFIX}Checking`, type: "checking", currency: "USD" },
  cash: { name: `${PREFIX}Cash`, type: "cash", currency: "USD" },
  eur: { name: `${PREFIX}Savings EUR`, type: "savings", currency: "EUR" }
};

/** Aborts unless DATABASE_URL points at the local `flowledger_staging` database; prints the db name (never credentials). */
function assertStaging(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("DATABASE_URL is missing or not a valid URL");
  }
  const db = decodeURIComponent(url.pathname.slice(1));
  if (db !== "flowledger_staging" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`Refusing to run: host=${url.hostname} db=${db}; need localhost + flowledger_staging`);
  }
  console.log(`Target database: ${db} @ ${url.hostname}`);
}

/** Merges `email -> password` into the 0600 credentials file outside the repo. */
function saveCredential(email: string, password: string): void {
  const existing = existsSync(CREDENTIALS_FILE) ? JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8")) : {};
  writeFileSync(CREDENTIALS_FILE, JSON.stringify({ ...existing, [email]: password }, null, 2), { mode: 0o600 });
  chmodSync(CREDENTIALS_FILE, 0o600);
}

/** Loads Prisma and the application services (after env is loaded and the staging guard has passed). */
async function loadApp() {
  const m = "../../apps/api/src/modules";
  const [{ prisma }, tx, accounts, categories, shared, debtsCreate, debtsUpdate] = await Promise.all([
    import("../../apps/api/src/db/prisma.js"),
    import(`${m}/transactions/services/create.service.js`),
    import(`${m}/accounts/services/create.service.js`),
    import(`${m}/categories/services/create.service.js`),
    import(`${m}/shared-expenses/services/update.service.js`),
    import(`${m}/debts/services/create.service.js`),
    import(`${m}/debts/services/update.service.js`)
  ]);
  return { prisma, tx, accounts, categories, shared, debtsCreate, debtsUpdate };
}
type App = Awaited<ReturnType<typeof loadApp>>;

/** Finds the primary viewer and creates any missing QA user, returning each actor's id, label and QA account/category ids. */
async function ensureActors(app: App): Promise<Record<Who, Actor>> {
  const { prisma } = app;
  const razs = await prisma.user.findUnique({ where: { username: "razs" } });
  if (!razs) throw new Error("Primary viewer (username 'razs') not found; aborting");
  const users: Record<string, { id: string; label: string }> = { razs: { id: razs.id, label: "razs" } };
  for (const key of QA_USER_KEYS) {
    const email = `ui-qa-${key}@example.com`;
    const name = `${PREFIX}${key[0]!.toUpperCase()}${key.slice(1)}`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const password = randomBytes(18).toString("base64url");
      user = await prisma.user.create({
        data: { name, nickname: name, email, username: `ui_qa_${key}`, identityVisibility: "username_and_name",
          passwordHash: await bcrypt.hash(password, 12), preferredCurrency: "USD" }
      });
      saveCredential(email, password);
      console.log(`created user ${email} (password in ${CREDENTIALS_FILE})`);
    }
    users[key] = { id: user.id, label: user.name };
  }
  const actors = {} as Record<Who, Actor>;
  for (const [key, u] of Object.entries(users)) {
    const accounts = {} as Record<AcctKey, string>;
    for (const [k, def] of Object.entries(ACCOUNT_DEFS) as [AcctKey, (typeof ACCOUNT_DEFS)[AcctKey]][]) {
      const found = await prisma.account.findFirst({ where: { userId: u.id, name: def.name } });
      accounts[k] = (found ?? (await app.accounts.createAccount(u.id, { ...def, initialBalance: "1000.00" }))).id;
    }
    const category = async (name: string, type: "income" | "expense") => {
      const found = await prisma.category.findFirst({ where: { name, groupId: null, users: { some: { userId: u.id } } } });
      return (found ?? (await app.categories.createCategory(u.id, { name, type }))).id;
    };
    actors[key as Who] = { id: u.id, label: u.label, accounts, shared: await category(`${PREFIX}Shared costs`, "expense"),
      reimb: await category(`${PREFIX}Reimbursements`, "income") };
  }
  return actors;
}

/** Creates one scenario (unless its transaction already exists for the owner) and drives it through its steps. Returns whether it was created. */
async function seedScenario(app: App, actors: Record<Who, Actor>, s: Scenario): Promise<boolean> {
  const { prisma } = app;
  const owner = actors[s.owner];
  if (await prisma.transaction.findFirst({ where: { userId: owner.id, name: s.name }, select: { id: true } })) return false;
  const who = (p: string) => (p in actors ? actors[p as Who] : undefined);
  const created = await app.tx.createTransaction(owner.id, {
    name: s.name, type: "expense", amount: s.amount, date: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
    accountId: owner.accounts[s.acct ?? "checking"], categoryId: owner.shared,
    sharedExpense: { title: s.name, participants: s.parts.map((x) => who(x.p)
      ? { userId: who(x.p)!.id, participantName: who(x.p)!.label, shareAmount: x.share }
      : { participantName: x.p, shareAmount: x.share }) }
  });
  const seId = created.sharedExpense!.id;
  const row = (p: string) => prisma.sharedExpenseParticipant.findFirstOrThrow({
    where: { sharedExpenseId: seId, ...(who(p) ? { userId: who(p)!.id } : { participantName: p }) } });
  const pendingRequest = async (p: string) => prisma.settlementRequest.findFirstOrThrow({
    where: { sharedExpenseParticipantId: (await row(p)).id, status: "pending" }, orderBy: { createdAt: "desc" } });
  for (const step of s.steps) {
    if (step.do === "accept" || step.do === "reject") {
      await app.shared.respondToSharedExpense(actors[step.p].id, seId, step.do === "accept" ? "accepted" : "rejected");
    } else if (step.do === "request") {
      const debtor = actors[step.p];
      await app.debtsCreate.createSettlementRequest(debtor.id, (await row(step.p)).id, {
        amount: step.amount, accountId: debtor.accounts[step.acct ?? "checking"], categoryId: debtor.shared, note: "UI QA settlement" });
    } else if (step.do === "approve") {
      await app.debtsUpdate.approveSettlement(owner.id, (await pendingRequest(step.p)).id, {
        accountId: owner.accounts.checking, categoryId: owner.reimb });
    } else if (step.do === "rejectRequest") {
      await app.debtsUpdate.rejectSettlement(owner.id, (await pendingRequest(step.p)).id);
    } else if (step.do === "direct") {
      await app.debtsUpdate.settleDebtDirectly(owner.id, (await row(step.p)).id);
    } else {
      await app.shared.updateSharedExpense(owner.id, seId, { status: "cancelled" });
    }
  }
  return true;
}

/** Creates every missing scenario; a failure in one is reported and does not stop the rest (rerun after `cleanup` to repair it). */
async function seed(app: App): Promise<void> {
  const actors = await ensureActors(app);
  let made = 0;
  for (const s of SCENARIOS) {
    try {
      if (await seedScenario(app, actors, s)) { made++; console.log(`created  ${s.name}`); }
      else console.log(`skipped  ${s.name}`);
    } catch (e) {
      console.error(`FAILED   ${s.name}: ${(e as Error).message} (partial state may exist; cleanup + reseed to repair)`);
    }
  }
  console.log(`Done: ${made} scenario(s) created, ${SCENARIOS.length - made} skipped/failed.`);
}

/** Collects every QA-linked id set, prints counts, and (unless `dryRun`) deletes them in FK-safe order. */
async function cleanup(app: App, dryRun: boolean): Promise<void> {
  const { prisma } = app;
  const razs = await prisma.user.findUnique({ where: { username: "razs" }, select: { id: true } });
  if (!razs) throw new Error("Primary viewer (username 'razs') not found; aborting");
  const qaUsers = await prisma.user.findMany({
    where: { email: { startsWith: "ui-qa-", endsWith: "@example.com" } }, select: { id: true } });
  const qaIds = qaUsers.map((u) => u.id);
  const tagged = { startsWith: PREFIX };
  const sharedExpenses = await prisma.sharedExpense.findMany({
    where: { OR: [{ ownerUserId: { in: qaIds } }, { ownerUserId: razs.id, title: tagged }] },
    select: { id: true, transactionId: true, participants: { select: { id: true } } } });
  const seIds = sharedExpenses.map((x) => x.id);
  const participantIds = sharedExpenses.flatMap((x) => x.participants.map((p) => p.id));
  const requests = await prisma.settlementRequest.findMany({
    where: { OR: [{ sharedExpenseParticipantId: { in: participantIds } }, { debtorUserId: { in: qaIds } }, { creditorUserId: { in: qaIds } }] },
    select: { id: true, debtorTransactionId: true, creditorTransactionId: true } });
  const requestIds = requests.map((r) => r.id);
  const settlementTxIds = requests.flatMap((r) => [r.debtorTransactionId, r.creditorTransactionId]).filter((x): x is string => !!x);
  const razsTxWhere = { userId: razs.id, OR: [{ name: tagged }, { id: { in: settlementTxIds } }] };
  const linkIds = [...seIds, ...participantIds, ...requestIds, ...sharedExpenses.map((x) => x.transactionId), ...settlementTxIds];
  const notifWhere = { userId: razs.id, OR: ["sharedExpenseId", "participantId", "settlementRequestId", "transactionId"]
    .flatMap((key) => linkIds.map((id) => ({ metadata: { path: [key], equals: id } }))) };
  const qaCategoryWhere = { name: tagged, groupId: null,
    users: { some: { userId: { in: [razs.id, ...qaIds] } }, every: { userId: { in: [razs.id, ...qaIds] } } } };
  const counts = {
    "QA users": qaIds.length, "shared expenses": seIds.length, "settlement requests": requestIds.length,
    "razs transactions (tagged + settlement)": await prisma.transaction.count({ where: razsTxWhere }),
    "razs notifications linked to QA records": linkIds.length ? await prisma.notification.count({ where: notifWhere }) : 0,
    "razs accounts": await prisma.account.count({ where: { userId: razs.id, name: tagged } }),
    "QA categories": await prisma.category.count({ where: qaCategoryWhere }),
    "razs groups": await prisma.group.count({ where: { ownerUserId: razs.id, name: tagged } })
  };
  console.table(counts);
  if (dryRun) return console.log("--dry-run: nothing deleted.");
  await prisma.$transaction(async (tx) => {
    if (linkIds.length) await tx.notification.deleteMany({ where: notifWhere });
    await tx.sharedExpense.deleteMany({ where: { id: { in: seIds } } });
    await tx.transaction.deleteMany({ where: razsTxWhere });
    await tx.account.deleteMany({ where: { userId: razs.id, name: tagged } });
    await tx.category.deleteMany({ where: qaCategoryWhere });
    await tx.group.deleteMany({ where: { ownerUserId: razs.id, name: tagged } });
    await tx.user.deleteMany({ where: { id: { in: qaIds } } });
  }, { timeout: 60_000 });
  console.log("Cleanup complete.");
}

/** Prints per-section counts and a markdown table of every scenario with ids resolved from the database. */
async function status(app: App): Promise<void> {
  const { prisma } = app;
  const ids = Object.fromEntries((await prisma.user.findMany({
    where: { OR: [{ username: "razs" }, { email: { startsWith: "ui-qa-", endsWith: "@example.com" } }] },
    select: { id: true, username: true } })).map((u) => [u.username.replace("ui_qa_", ""), u.id])) as Record<Who, string>;
  const rows: string[] = []; const perSection: Record<string, { found: number; total: number }> = {};
  for (const s of SCENARIOS) {
    const sec = (perSection[s.section] ??= { found: 0, total: 0 }); sec.total++;
    const tx = ids[s.owner] ? await prisma.transaction.findFirst({ where: { userId: ids[s.owner], name: s.name },
      include: { sharedExpense: { include: { participants: true } } } }) : null;
    if (tx) sec.found++;
    const se = tx?.sharedExpense;
    const mine = se?.participants.find((p) => p.userId === ids.razs);
    const counter = s.owner === "razs" ? se?.participants.find((p) => p.userId) ?? se?.participants[0] : undefined;
    const pending = se ? await prisma.settlementRequest.findFirst({ where: { sharedExpenseParticipant: { sharedExpenseId: se.id }, status: "pending" } }) : null;
    const debtId = mine?.id ?? se?.participants.find((p) => !p.userId)?.id ?? counter?.id;
    const personKey = s.owner === "razs" ? (counter?.userId ?? `participant:${counter?.id}`) : ids[s.owner];
    const url: Record<string, string | null | undefined> = {
      balance: personKey && `/debts/balances/${personKey}`, se: se && `/debts/shared-expenses/${se.id}`,
      // Transactions are owner-scoped, so only the owning viewer can open one.
      tx: tx && s.owner === (s.viewer ?? "razs") && `/transactions/${tx.id}?tab=sharing`, pending: pending && `/debts?tab=pending&settlementId=${pending.id}`,
      awaiting: se && `/debts?tab=awaiting&sharedExpenseId=${se.id}`, settled: debtId && `/debts?tab=settled&debtId=${debtId}` };
    const links = s.links.map((k) => (url[k] ? `[${k}](${BASE_URL}${url[k]})` : null)).filter(Boolean).join(" ");
    const cell = (t: string) => t.replace(/\|/g, "\\|");
    rows.push(`| ${s.section} | ${cell(s.name)} | ${cell(s.expected)} | ${cell(s.feature)} | ${tx ? links : "NOT SEEDED"} | ${s.viewer ? `ui-qa-${s.viewer}@example.com` : "razs"} |`);
  }
  console.log("Per-section QA scenario counts (found/total):");
  console.table(Object.fromEntries(Object.entries(perSection).map(([k, v]) => [k, `${v.found}/${v.total}`])));
  console.log("| Section | Record | Expected state | Feature tested | Direct URLs | Log in as |\n|---|---|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log(`\nQA users: ${QA_USER_KEYS.map((k) => `ui-qa-${k}@example.com`).join(", ")} (passwords in ${CREDENTIALS_FILE})`);
}

const command = process.argv[2];
if (!["seed", "cleanup", "status"].includes(command ?? "")) {
  console.log(USAGE);
  process.exit(command === "--help" || command === "-h" ? 0 : 1);
}
assertStaging();
const app = await loadApp();
try {
  if (command === "seed") await seed(app);
  else if (command === "cleanup") await cleanup(app, process.argv.includes("--dry-run"));
  else await status(app);
} finally {
  await app.prisma.$disconnect();
}
