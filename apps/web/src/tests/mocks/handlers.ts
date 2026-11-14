import { DEFAULT_NOTIFICATION_RULES } from "@flowledger/shared";
import { HttpResponse, http, type HttpHandler } from "msw";
import type { DataSieveMeta } from "../../types/transactions.types";
import type { NotificationLibraryEntry, NotificationModel, NotificationRun } from "../../types/notificationModels.types";

/**
 * Default msw request handlers, active for every test via `src/tests/setup.ts`.
 * Empty by default — individual test files call `server.use(...)` (from
 * `./server`) to stub the specific `services/*.client.ts` endpoints they
 * exercise, keeping each test's mocked responses local to that test.
 */
export const handlers: HttpHandler[] = [];

const API = "http://localhost:4000";

/** A stored notification model with sensible defaults; override any field. */
export function makeNotificationModel(overrides: Partial<NotificationModel> = {}): NotificationModel {
  return {
    id: "nm-1",
    name: "Plata",
    description: null,
    code: "def process(text, ctx):\n    return skip('x')\n",
    isActive: false,
    visibility: "private",
    publication: { published: false, latestVersion: null, publishedAt: null },
    slots: [{ key: "card", kind: "account", label: "Card", required: true }],
    bindings: {},
    settings: {},
    sourceVersionId: null,
    endpointPath: "/v1/notification-models/nm-1/notifications",
    lastRunStatus: null,
    queued: 0,
    processing: 0,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides
  };
}

/** A notification run (queue or log row) with sensible defaults; override any field. */
export function makeNotificationRun(overrides: Partial<NotificationRun> = {}): NotificationRun {
  return {
    id: "run-1",
    modelId: "nm-1",
    status: "queued",
    text: "Compraste $10.00 MXN en OXXO",
    reason: null,
    transactionId: null,
    receivedAt: "2026-11-13T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    ...overrides
  };
}

/** DataSieve page envelope for `rows`, as the notification list routes return it. */
export function notificationPage<T>(rows: T[], total = rows.length) {
  const meta: DataSieveMeta = { total, page: 1, pageSize: 20, pageCount: 1, hasNext: false, hasPrevious: false, executionTime: 1 };
  return { data: rows, meta };
}

/** Handlers for the notification model routes plus the lists the binding selects read; `session` 401s the silent refresh like other page tests. */
export function notificationModelHandlers({
  model = makeNotificationModel(),
  queue = [] as NotificationRun[],
  logs = [] as NotificationRun[]
}: { model?: NotificationModel; queue?: NotificationRun[]; logs?: NotificationRun[] } = {}): HttpHandler[] {
  return [
    http.post(`${API}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API}/accounts`, () =>
      HttpResponse.json({ accounts: [{ id: "acc-1", name: "Plata card", isArchived: false }, { id: "acc-2", name: "Old", isArchived: true }] })
    ),
    http.get(`${API}/categories`, () => HttpResponse.json({ categories: [{ id: "cat-1", name: "General", isArchived: false }] })),
    http.get(`${API}/groups`, () => HttpResponse.json({ groups: [] })),
    http.get(`${API}/notification-models`, () => HttpResponse.json(notificationPage([model]))),
    http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json({ rules: DEFAULT_NOTIFICATION_RULES })),
    http.get(`${API}/notification-models/${model.id}`, () => HttpResponse.json({ model })),
    http.get(`${API}/notification-models/${model.id}/queue`, () => HttpResponse.json(notificationPage(queue))),
    http.get(`${API}/notification-models/${model.id}/logs`, () => HttpResponse.json(notificationPage(logs)))
  ];
}

/** A library entry with sensible defaults; override any field. */
export function makeLibraryEntry(overrides: Partial<NotificationLibraryEntry> = {}): NotificationLibraryEntry {
  return {
    modelId: "lib-1",
    versionId: "ver-2",
    version: 2,
    name: "Plata shared",
    description: "Parses Plata purchases",
    slots: [{ key: "card", kind: "account", label: "Card", required: true }],
    settings: {},
    publishedAt: "2026-11-10T00:00:00.000Z",
    author: { username: "ana" },
    isOwn: false,
    installedModelId: null,
    ...overrides
  };
}
