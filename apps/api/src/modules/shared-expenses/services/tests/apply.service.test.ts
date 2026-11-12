import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../notifications/services/create.service.js", () => ({
  createDedupedNotifications: vi.fn()
}));
vi.mock("../../../transactions/utils/sharedTransactionCleanup.js", () => ({
  deleteSharedTransactionData: vi.fn()
}));

const { createDedupedNotifications } = await import("../../../notifications/services/create.service.js");
const { deleteSharedTransactionData } = await import("../../../transactions/utils/sharedTransactionCleanup.js");
const { applySharedExpenseToTransaction } = await import("../apply.service.js");
const notifyMock = vi.mocked(createDedupedNotifications);
const deleteDataMock = vi.mocked(deleteSharedTransactionData);

const D = (value: number) => new Prisma.Decimal(value);
let tx: DeepMockProxy<PrismaClient>;

const transaction = (overrides: Record<string, unknown> = {}) =>
  ({ id: "txn-1", name: "Dinner", amount: D(100), type: "expense", executionCurrency: "USD", ...overrides }) as never;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "user-2",
    participantName: "@friend",
    shareAmount: D(40),
    paidAmount: D(0),
    status: "pending",
    acceptance: "accepted",
    settlementRequests: [],
    ...overrides
  };
}

function existingSharedExpense(participants: unknown[]) {
  tx.sharedExpense.findUnique.mockResolvedValue({
    id: "se-1",
    title: "Dinner split",
    transactionId: "txn-1",
    participants
  } as never);
}

const sent = () => notifyMock.mock.calls.flatMap((call) => call[1]);
const participantUpdate = () => tx.sharedExpenseParticipant.updateMany.mock.calls[0]?.[0];

beforeEach(() => {
  tx = mockDeep<PrismaClient>();
  tx.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 1 });
  tx.sharedExpenseParticipant.deleteMany.mockResolvedValue({ count: 1 });
  notifyMock.mockReset();
  deleteDataMock.mockReset();
  tx.user.findUniqueOrThrow.mockResolvedValue({
    id: "owner-1",
    username: "owner",
    name: "Owner",
    identityVisibility: "username_only"
  } as never);
  tx.userBlock.findMany.mockResolvedValue([]);
  tx.user.findMany.mockResolvedValue([{ id: "user-2", username: "friend" }] as never);
  tx.sharedExpense.findUnique.mockResolvedValue(null);
  tx.sharedExpense.findUniqueOrThrow.mockResolvedValue({ id: "se-1" } as never);
  tx.sharedExpense.create.mockResolvedValue({
    id: "se-1",
    participants: [{ id: "p1", userId: "user-2", shareAmount: D(40) }]
  } as never);
});

describe("applySharedExpenseToTransaction - create", () => {
  it("creates app users as proposed and manual participants as accepted, notifying only the app user", async () => {
    await applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", {
      enabled: true,
      title: "Split",
      participants: [
        { userId: "user-2", share: 40 },
        { manualName: "Cash Friend", share: 10 }
      ]
    });

    const data = tx.sharedExpense.create.mock.calls[0]?.[0].data as {
      title: string;
      participants: { create: Record<string, unknown>[] };
    };
    expect(data.title).toBe("Split");
    expect(data.participants.create).toMatchObject([
      { userId: "user-2", acceptance: "proposed", participantName: "@friend" },
      { userId: null, acceptance: "accepted", participantName: "Cash Friend" }
    ]);
    expect(data.participants.create[0]).not.toHaveProperty("paidAmount");
    expect(sent()).toMatchObject([{ userId: "user-2", type: "shared_expense_invited", senderUserId: "owner-1" }]);
  });

  it("returns participants with the live public label and no private user columns", async () => {
    tx.sharedExpense.findUniqueOrThrow.mockResolvedValue({
      id: "se-1",
      participants: [
        {
          id: "p1",
          userId: "user-2",
          participantName: "Real Name",
          user: { id: "user-2", username: "friend", name: "Real Name", identityVisibility: "username_only" }
        }
      ]
    } as never);

    const result = await applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", {
      enabled: true,
      participants: [{ userId: "user-2", share: 40 }]
    });

    expect(tx.sharedExpense.findUniqueOrThrow.mock.calls[0]?.[0]).toMatchObject({
      include: { participants: { include: { user: { select: { id: true, username: true, name: true, identityVisibility: true } } } } }
    });
    expect(result?.participants[0]).toMatchObject({
      participantName: "@friend",
      user: { id: "user-2", username: "friend", displayName: null }
    });
    expect(JSON.stringify(result)).not.toContain("Real Name");
  });

  it("rejects shares that exceed the transaction amount with a field error", async () => {
    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", {
        enabled: true,
        participants: [{ manualName: "A", share: 70 }, { manualName: "B", share: 40 }]
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { issues: { fieldErrors: { "sharedExpense.participants": expect.any(Array) } } }
    });
  });

  it("rejects enabling sharing on a transfer", async () => {
    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ type: "transfer" }), "transfer", {
        enabled: true,
        participants: [{ manualName: "A", share: 1 }]
      })
    ).rejects.toThrow("Shared transactions are only supported for income and expense transactions");
  });

  it("returns null when nothing is shared and no input is given", async () => {
    expect(await applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense")).toBeNull();
  });
});

describe("applySharedExpenseToTransaction - shareable currencies", () => {
  const sharing = { enabled: true, title: "Split", participants: [{ userId: "user-2", share: 10 }] };

  it.each(["BTC", "KWD"])("rejects creating a share on a %s transaction", async (currency) => {
    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ executionCurrency: currency }), "expense", sharing)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.sharedExpense.create).not.toHaveBeenCalled();
  });

  it("rejects a share when the transaction's account currency is not shareable", async () => {
    tx.account.findUnique.mockResolvedValue({ currency: "BTC" } as never);

    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ accountId: "acc-btc" }), "expense", sharing)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Sharing is only supported for fiat currencies with up to 2 decimals"
    });
  });

  it("rejects editing an existing share once its transaction is in a non-shareable currency", async () => {
    existingSharedExpense([row()]);

    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ executionCurrency: "BTC" }), "expense", sharing)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts MXN on an MXN account", async () => {
    tx.account.findUnique.mockResolvedValue({ currency: "MXN" } as never);

    await expect(
      applySharedExpenseToTransaction(
        tx,
        "owner-1",
        transaction({ executionCurrency: "MXN", accountId: "acc-mxn" }),
        "expense",
        sharing
      )
    ).resolves.toBeDefined();
  });
});

describe("applySharedExpenseToTransaction - disable", () => {
  it("removes the shared expense and notifies app-user participants", async () => {
    existingSharedExpense([row()]);

    const result = await applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", { enabled: false });

    expect(result).toBeNull();
    expect(deleteDataMock).toHaveBeenCalled();
    expect(sent()).toMatchObject([{ userId: "user-2", type: "shared_expense_updated" }]);
  });

  it.each([
    ["a payment", { paidAmount: D(5) }],
    ["a pending request", { settlementRequests: [{ status: "pending", amount: D(5) }] }],
    ["an approved request", { settlementRequests: [{ status: "approved", amount: D(5) }] }]
  ])("is blocked by %s", async (_label, overrides) => {
    existingSharedExpense([row(overrides)]);

    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", { enabled: false })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(deleteDataMock).not.toHaveBeenCalled();
  });

  it("removes sharing when the transaction becomes a transfer", async () => {
    existingSharedExpense([row()]);

    await applySharedExpenseToTransaction(tx, "owner-1", transaction({ type: "transfer" }), "expense");

    expect(deleteDataMock).toHaveBeenCalled();
  });
});

describe("applySharedExpenseToTransaction - consent rules", () => {
  const edit = (participants: object[], extra: Partial<{ type: string; previous: string; title: string }> = {}) =>
    applySharedExpenseToTransaction(
      tx,
      "owner-1",
      transaction({ type: extra.type ?? "expense" }),
      (extra.previous ?? "expense") as never,
      { enabled: true, title: extra.title, participants: participants as never }
    );

  it("re-proposes an accepted share when it is raised and notifies once", async () => {
    existingSharedExpense([row()]);
    await edit([{ id: "p1", userId: "user-2", share: 60 }]);

    expect(participantUpdate()?.data).toMatchObject({ acceptance: "proposed" });
    expect(sent()).toMatchObject([{ userId: "user-2", type: "shared_expense_updated" }]);
  });

  it("keeps acceptance when the share is lowered", async () => {
    existingSharedExpense([row()]);
    await edit([{ id: "p1", userId: "user-2", share: 20 }]);

    expect(participantUpdate()?.data).toMatchObject({ acceptance: "accepted", status: "pending" });
    expect(sent()).toHaveLength(0);
  });

  it("keeps acceptance and writes no participant on a title-only change", async () => {
    existingSharedExpense([row()]);
    await edit([{ id: "p1", userId: "user-2", share: 40 }], { title: "New title" });

    expect(tx.sharedExpenseParticipant.updateMany).not.toHaveBeenCalled();
    expect(tx.sharedExpense.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "New title" }) }));
    expect(sent()).toHaveLength(0);
  });

  it("re-proposes accepted app-user shares on an expense/income flip but not manual ones", async () => {
    existingSharedExpense([row(), row({ id: "p2", userId: null, participantName: "Cash" })]);
    await edit(
      [{ id: "p1", userId: "user-2", share: 40 }, { id: "p2", manualName: "Cash", share: 40 }],
      { type: "income", previous: "expense" }
    );

    expect(tx.sharedExpenseParticipant.updateMany).toHaveBeenCalledTimes(1);
    expect(participantUpdate()).toMatchObject({ where: { id: "p1" }, data: { acceptance: "proposed" } });
  });

  it("re-proposes on a flip even when no participants were sent", async () => {
    existingSharedExpense([row()]);
    await applySharedExpenseToTransaction(tx, "owner-1", transaction({ type: "income" }), "expense");

    expect(participantUpdate()?.data).toMatchObject({ acceptance: "proposed" });
  });

  it("leaves a rejected share rejected when its amount is unchanged", async () => {
    existingSharedExpense([row({ acceptance: "rejected" })]);
    await edit([{ id: "p1", userId: "user-2", share: 40 }]);

    expect(tx.sharedExpenseParticipant.updateMany).not.toHaveBeenCalled();
    expect(sent()).toHaveLength(0);
  });

  it("returns a rejected share to proposed when the owner changes its amount", async () => {
    existingSharedExpense([row({ acceptance: "rejected" })]);
    await edit([{ id: "p1", userId: "user-2", share: 30 }]);

    expect(participantUpdate()?.data).toMatchObject({ acceptance: "proposed" });
    expect(sent()).toMatchObject([{ type: "shared_expense_updated" }]);
  });

  it("matches existing rows by userId and by manual name when no id is sent", async () => {
    existingSharedExpense([row(), row({ id: "p2", userId: null, participantName: "Cash" })]);
    await edit([{ userId: "user-2", share: 40 }, { manualName: "Cash", share: 40 }]);

    expect(tx.sharedExpenseParticipant.create).not.toHaveBeenCalled();
    expect(tx.sharedExpenseParticipant.deleteMany).not.toHaveBeenCalled();
  });
});

describe("applySharedExpenseToTransaction - diff and guards", () => {
  const edit = (participants: object[]) =>
    applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", {
      enabled: true,
      participants: participants as never
    });

  it("adds a participant (proposed, invited) and removes an unpaid one in one save", async () => {
    tx.user.findMany.mockResolvedValue([{ id: "user-3", username: "newbie" }] as never);
    tx.sharedExpenseParticipant.create.mockResolvedValue({ id: "p9", userId: "user-3", shareAmount: D(30) } as never);
    existingSharedExpense([row()]);

    await edit([{ userId: "user-3", share: 30 }]);

    expect(tx.sharedExpenseParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-3", acceptance: "proposed" }) })
    );
    expect(tx.sharedExpenseParticipant.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "p1" })
    });
    expect(sent().map((n) => [n.userId, n.type])).toEqual([
      ["user-3", "shared_expense_invited"],
      ["user-2", "shared_expense_updated"]
    ]);
  });

  it("rejects lowering a share below paid plus pending requests", async () => {
    existingSharedExpense([row({ paidAmount: D(10), settlementRequests: [{ status: "pending", amount: D(10) }] })]);

    await expect(edit([{ id: "p1", userId: "user-2", share: 15 }])).rejects.toMatchObject({
      details: { issues: { fieldErrors: { "sharedExpense.participants.0.share": expect.any(Array) } } }
    });
    await expect(edit([{ id: "p1", userId: "user-2", share: 20 }])).resolves.toBeDefined();
  });

  it("locks a fully paid share", async () => {
    existingSharedExpense([row({ paidAmount: D(40), status: "paid" })]);

    await expect(edit([{ id: "p1", userId: "user-2", share: 50 }])).rejects.toThrow("fully settled");
  });

  it.each([
    ["has paid", { paidAmount: D(5) }],
    ["has a pending request", { settlementRequests: [{ status: "pending", amount: D(5) }] }]
  ])("blocks removing a participant who %s", async (_label, overrides) => {
    existingSharedExpense([row(overrides), row({ id: "p2", userId: null, participantName: "Cash" })]);

    await expect(edit([{ id: "p2", manualName: "Cash", share: 40 }])).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.sharedExpenseParticipant.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks an expense/income flip and a switch to transfer while a payment exists", async () => {
    existingSharedExpense([row({ paidAmount: D(5) })]);

    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ type: "income" }), "expense")
    ).rejects.toMatchObject({ details: { issues: { fieldErrors: { type: expect.any(Array) } } } });
    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ type: "transfer" }), "expense")
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an id that is not part of this shared expense", async () => {
    existingSharedExpense([row()]);

    await expect(edit([{ id: "other", userId: "user-2", share: 40 }])).rejects.toMatchObject({ statusCode: 400 });
  });

  it("validates the final shares against the (possibly lowered) transaction amount", async () => {
    existingSharedExpense([row()]);

    await expect(
      applySharedExpenseToTransaction(tx, "owner-1", transaction({ amount: D(30) }), "expense")
    ).rejects.toThrow("Participant shares cannot exceed the transaction amount");
  });

  it("never writes payment fields from client input", async () => {
    existingSharedExpense([row({ paidAmount: D(10), status: "partial" })]);

    await edit([{ id: "p1", userId: "user-2", share: 30, paidAmount: 0, status: "pending" }]);

    const data = participantUpdate()?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("paidAmount");
    expect(data.status).toBe("partial");
  });
});

describe("applySharedExpenseToTransaction - allocation lines", () => {
  const edit = (participants: object[]) =>
    applySharedExpenseToTransaction(tx, "owner-1", transaction(), "expense", {
      enabled: true,
      participants: participants as never
    });
  const paidLine = (overrides: Record<string, unknown> = {}) => row({ paidAmount: D(10), status: "partial", ...overrides });
  const created = () => tx.sharedExpenseParticipant.create.mock.calls.map((call) => call[0].data);

  beforeEach(() => {
    tx.sharedExpenseParticipant.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new-row",
      shareAmount: D(Number(data.shareAmount)),
      ...data
    })) as never);
  });

  it("matches by id, and rejects an id that does not match the given user", async () => {
    existingSharedExpense([row()]);
    await expect(edit([{ id: "p1", userId: "user-3", share: 40 }])).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a manual-name input that carries an app user's participant id", async () => {
    existingSharedExpense([row()]);
    await expect(edit([{ id: "p1", participantName: "Cash", share: 40 }])).rejects.toThrow(
      "Participant id does not match the given user"
    );
  });

  it("guards a share change against settlement requests created after the read", async () => {
    existingSharedExpense([row({ settlementRequests: [{ id: "sr-1", status: "pending", amount: D(5) }] })]);
    await edit([{ id: "p1", userId: "user-2", share: 30 }]);
    expect(participantUpdate()?.where).toMatchObject({
      settlementRequests: { none: { status: "pending", id: { notIn: ["sr-1"] } } }
    });
  });

  it("matches an id-less input to the user's only row", async () => {
    existingSharedExpense([row()]);
    await edit([{ userId: "user-2", share: 50 }]);
    expect(participantUpdate()?.where).toMatchObject({ id: "p1" });
    expect(created()).toHaveLength(0);
  });

  it("requires a participant id when the user has several rows", async () => {
    existingSharedExpense([paidLine(), paidLine({ id: "p2" })]);
    await expect(edit([{ userId: "user-2", share: 10 }])).rejects.toThrow("participant id required");
  });

  it("adds a proposed line once every existing row of the user has payment activity", async () => {
    existingSharedExpense([paidLine()]);
    await edit([
      { id: "p1", userId: "user-2", share: 40 },
      { userId: "user-2", share: 20 }
    ]);
    expect(created()).toMatchObject([{ userId: "user-2", acceptance: "proposed" }]);
    expect(sent()).toMatchObject([{ type: "shared_expense_invited", userId: "user-2" }]);
  });

  it("also adds a line when the id-less input comes before the id-carrying one", async () => {
    existingSharedExpense([paidLine()]);
    await edit([
      { userId: "user-2", share: 20 },
      { id: "p1", userId: "user-2", share: 40 }
    ]);
    expect(created()).toHaveLength(1);
  });

  it("refuses a new line while an existing row of that user has no payment activity", async () => {
    existingSharedExpense([row()]);
    await expect(
      edit([
        { id: "p1", userId: "user-2", share: 40 },
        { userId: "user-2", share: 20 }
      ])
    ).rejects.toThrow("Edit the existing allocation");
  });

  it("rejects the same id twice", async () => {
    existingSharedExpense([row()]);
    await expect(
      edit([
        { id: "p1", userId: "user-2", share: 20 },
        { id: "p1", userId: "user-2", share: 20 }
      ])
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a settled allocation being edited, removed or reassigned", async () => {
    existingSharedExpense([row({ paidAmount: D(40), status: "paid" }), row({ id: "p2", userId: null, participantName: "Cash" })]);
    await expect(edit([{ id: "p1", userId: "user-2", share: 41 }, { id: "p2", manualName: "Cash", share: 10 }])).rejects.toThrow(
      "fully settled"
    );
    await expect(edit([{ id: "p2", manualName: "Cash", share: 10 }])).rejects.toThrow("fully settled");
    expect(tx.sharedExpenseParticipant.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to raise a share that already has a payment", async () => {
    existingSharedExpense([paidLine()]);
    await expect(edit([{ id: "p1", userId: "user-2", share: 50 }])).rejects.toThrow("additional allocation");
  });

  it("keeps a settled allocation untouched when only another one changes", async () => {
    existingSharedExpense([row({ paidAmount: D(40), status: "paid" }), row({ id: "p2", userId: "user-3", participantName: "@carlos" })]);
    tx.user.findMany.mockResolvedValue([
      { id: "user-2", username: "friend" },
      { id: "user-3", username: "carlos" }
    ] as never);
    await edit([
      { id: "p1", userId: "user-2", share: 40 },
      { id: "p2", userId: "user-3", share: 30 }
    ]);
    expect(tx.sharedExpenseParticipant.updateMany.mock.calls.map((call) => call[0].where)).toMatchObject([{ id: "p2" }]);
  });

  it("throws 409 when the guarded update or delete matches no row (concurrent change)", async () => {
    existingSharedExpense([row()]);
    tx.sharedExpenseParticipant.updateMany.mockResolvedValue({ count: 0 });
    await expect(edit([{ id: "p1", userId: "user-2", share: 30 }])).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.sharedExpenseParticipant.updateMany.mock.calls[0]?.[0].where).toMatchObject({ id: "p1", paidAmount: D(0) });

    existingSharedExpense([row(), row({ id: "p2", userId: null, participantName: "Cash" })]);
    tx.sharedExpenseParticipant.deleteMany.mockResolvedValue({ count: 0 });
    await expect(edit([{ id: "p1", userId: "user-2", share: 40 }])).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.sharedExpenseParticipant.deleteMany.mock.calls[0]![0]!.where).toMatchObject({
      id: "p2",
      settlementRequests: { none: { status: "pending" } }
    });
  });
});
