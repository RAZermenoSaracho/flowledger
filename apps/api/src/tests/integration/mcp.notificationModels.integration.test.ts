import { DEFAULT_NOTIFICATION_RULES, generateNotificationCode } from "@flowledger/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { loopbackOrigin } from "../helpers/loopback.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Needs Docker (see docs/TESTING.md). Real Pyodide sandbox: every sandbox call costs a few seconds.
vi.hoisted(() => {
  process.env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL = "2";
  process.env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER = "1";
});

let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type McpResult = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };

const CODE = `def process(text, ctx):
    m = re.search(r"Purchase of \\$([\\d,.]+)", text)
    if m:
        return expense(amount(m.group(1)), "Purchase")
    return skip("no match")
`;

async function actor(allowWrite: boolean, existing?: Awaited<ReturnType<typeof createAuthedUser>>) {
  const user = existing ?? (await createAuthedUser(app));
  const response = await request(app)
    .post("/users/me/api-keys")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ name: "mcp-nm", allowWrite, lifetime: "1m" });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${response.body.key}` } }
    })
  );
  return { user, client };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  try {
    return (await client.callTool({ name, arguments: args })) as McpResult;
  } catch (error) {
    return { isError: true, content: [{ text: String(error) }] } as McpResult;
  }
}

describe("MCP notification model tools", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    baseUrl = loopbackOrigin(server);
  }, 180_000);

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("authoring, dry-run, rules round-trip and read-only scope", async () => {
    const { user, client } = await actor(true);
    const reader = (await actor(false, user)).client;

    const created = await call(client, "create_notification_model", { name: "MCP Demo Notification Parser", code: CODE, slots: [], bindings: {} });
    expect(created.isError, JSON.stringify(created)).toBeFalsy();
    const id = created.structuredContent!.model.id as string;
    expect((await call(client, "get_notification_model", { id })).structuredContent!.model.code).toBe(CODE);

    const hit = await call(client, "test_notification_model", { id, text: "Purchase of $150.00 at Store" });
    expect(hit.isError, JSON.stringify(hit)).toBeFalsy();
    expect(hit.structuredContent).toMatchObject({ outcome: "proposal", proposal: { kind: "expense", amount: "150.00" } });
    expect(await prisma.transaction.count({ where: { userId: user.user.id } })).toBe(0);
    expect(await prisma.notificationRun.count({ where: { userId: user.user.id } })).toBe(0);

    const rulesCode = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);
    const updated = await call(client, "update_notification_model", { id, rules: DEFAULT_NOTIFICATION_RULES });
    expect(updated.isError, JSON.stringify(updated)).toBeFalsy();
    expect((await call(client, "get_notification_model", { id })).structuredContent!.model.code).toBe(rulesCode);
    const parsed = await call(client, "parse_notification_rules", { code: rulesCode });
    expect(parsed.structuredContent).toEqual({ rules: DEFAULT_NOTIFICATION_RULES });
    expect((await call(client, "update_notification_model", { id, code: CODE, rules: DEFAULT_NOTIFICATION_RULES })).isError).toBe(true);

    const invalid = await call(client, "validate_notification_code", { code: "def process(text, ctx:\n  return" });
    expect(invalid.structuredContent!.errors.length).toBeGreaterThan(0);

    const names = (await reader.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["get_notification_model", "list_notification_models", "test_notification_model"]));
    for (const write of ["create_notification_model", "update_notification_model", "delete_notification_model", "publish_notification_model", "install_notification_model"]) {
      expect(names).not.toContain(write);
    }
  }, 120_000);

  it("reads real queued runs and terminal logs without changing runs, and enforces ownership", async () => {
    const owner = await actor(true);
    const reader = (await actor(false, owner.user)).client;
    const other = await actor(false);
    const { ingestNotification } = await import("../../modules/notificationModels/services/ingest.service.js");
    const { claimNextRun } = await import("../../modules/notificationModels/services/claim.service.js");
    const { processRun } = await import("../../modules/notificationModels/services/processRun.service.js");
    const created = await call(owner.client, "create_notification_model", {
      name: "Queue and logs parser", code: CODE, slots: [], bindings: {}, isActive: true
    });
    expect(created.isError, JSON.stringify(created)).toBeFalsy();
    const id = created.structuredContent!.model.id as string;
    const snapshot = () => prisma.notificationRun.findMany({ where: { modelId: id }, orderBy: { id: "asc" } });
    const preview = await call(reader, "test_notification_model", { id, text: "Purchase of $5.00" });
    expect(preview.isError, JSON.stringify(preview)).toBeFalsy();
    expect(await snapshot()).toEqual([]);

    const text = `Purchase of $150.00 at ${"Store ".repeat(20)}`;
    const first = await ingestNotification(owner.user.user.id, id, text, undefined, new Date("2026-01-01T12:00:00Z"));
    const second = await ingestNotification(owner.user.user.id, id, "Unmatched notification", undefined, new Date("2026-01-02T12:00:00Z"));
    expect([first.status, second.status]).toEqual(["queued", "queued"]);
    const queuedBefore = await snapshot();
    expect(queuedBefore).toHaveLength(2);
    for (const [page, runId] of [[1, first.runId], [2, second.runId]] as const) {
      const result = await call(reader, "list_notification_model_queue", { id, status: "queued", page, pageSize: 1 });
      expect(result.isError, JSON.stringify(result)).toBeFalsy();
      expect(result.structuredContent!.data).toMatchObject([{ id: runId, status: "queued" }]);
      expect(result.structuredContent!.data).toHaveLength(1);
      expect(result.structuredContent!.meta).toMatchObject({ total: 2, page, pageSize: 1, pageCount: 2, hasNext: page === 1 });
      if (page === 1) expect(result.structuredContent!.data[0].text).toBe(text.slice(0, 80));
    }
    expect((await call(reader, "list_notification_model_queue", { id, status: "processing" })).structuredContent!.data).toEqual([]);
    expect((await call(reader, "list_notification_model_logs", { id })).structuredContent!.data).toEqual([]);
    expect(await snapshot()).toEqual(queuedBefore);

    for (const [runId, outcome] of [[first.runId, "completed"], [second.runId, "skipped"]] as const) {
      const claimed = await claimNextRun("mcp-notification-models-test");
      expect(claimed?.id).toBe(runId);
      expect(await processRun(claimed!)).toBe(outcome);
    }
    const terminalBefore = await snapshot();
    expect(terminalBefore).toHaveLength(2);
    const logs = await call(reader, "list_notification_model_logs", { id });
    expect(logs.isError, JSON.stringify(logs)).toBeFalsy();
    expect(logs.structuredContent!.data.map((run: Json) => run.id)).toEqual([second.runId, first.runId]);
    expect(logs.structuredContent!.data[0]).toMatchObject({ status: "skipped", reason: "no match", transactionId: null });
    const completed = logs.structuredContent!.data[1];
    expect(completed).toMatchObject({ status: "completed", reason: null, transactionId: expect.any(String) });
    expect((await call(reader, "get_transaction", { id: completed.transactionId })).isError).toBeFalsy();
    for (const [status, runId] of [["completed", first.runId], ["skipped", second.runId]] as const) {
      const filtered = await call(reader, "list_notification_model_logs", { id, status, pageSize: 1 });
      expect(filtered.isError, JSON.stringify(filtered)).toBeFalsy();
      expect(filtered.structuredContent!.data).toMatchObject([{ id: runId, status }]);
      expect(filtered.structuredContent!.meta).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    }
    expect((await call(reader, "list_notification_model_logs", { id, status: "failed" })).structuredContent!.data).toEqual([]);
    expect((await call(reader, "list_notification_model_queue", { id })).structuredContent!.data).toEqual([]);
    for (const tool of ["list_notification_model_queue", "list_notification_model_logs"]) {
      expect((await call(other.client, tool, { id })).isError, tool).toBe(true);
      expect((await call(reader, tool, { id: "missing-model" })).isError, tool).toBe(true);
    }
    expect(await snapshot()).toEqual(terminalBefore);
    await Promise.all([owner.client.close(), reader.close(), other.client.close()]);
  }, 120_000);

  it("isolation, library publish/install/unpublish and delete", async () => {
    const owner = await actor(true);
    const other = await actor(true);
    const created = await call(owner.client, "create_notification_model", { name: "Library Parser", code: CODE, slots: [], bindings: {} });
    const id = created.structuredContent!.model.id as string;

    for (const [tool, args] of [
      ["get_notification_model", { id }],
      ["update_notification_model", { id, name: "Hijacked" }],
      ["publish_notification_model", { id }],
      ["delete_notification_model", { id }]
    ] as const) {
      expect((await call(other.client, tool, args)).isError, tool).toBe(true);
    }

    const published = await call(owner.client, "publish_notification_model", { id });
    expect(published.isError, JSON.stringify(published)).toBeFalsy();
    const library = (await call(other.client, "list_notification_library")).structuredContent!.data as Json[];
    expect(library.find((entry) => entry.modelId === id)).toMatchObject({ isOwn: false, installedModelId: null });

    const installed = await call(other.client, "install_notification_model", { modelId: id });
    expect(installed.isError, JSON.stringify(installed)).toBeFalsy();
    const copy = installed.structuredContent!.model;
    expect(copy.id).not.toBe(id);
    expect(await prisma.notificationModel.findUniqueOrThrow({ where: { id: copy.id } })).toMatchObject({ userId: other.user.user.id, visibility: "private" });

    expect((await call(owner.client, "update_notification_model", { id, visibility: "private" })).isError).toBeFalsy();
    const after = (await call(other.client, "list_notification_library")).structuredContent!.data as Json[];
    expect(after.find((entry) => entry.modelId === id)).toBeUndefined();

    expect((await call(owner.client, "delete_notification_model", { id })).isError).toBeFalsy();
    expect((await call(owner.client, "get_notification_model", { id })).isError).toBe(true);
  }, 120_000);
});
