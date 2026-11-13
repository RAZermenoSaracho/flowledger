import { describe, expect, it } from "vitest";
import type { Account } from "../../../../types/accounts.types";
import type { Category } from "../../../../types/categories.types";
import type { Group } from "../../../../types/groups.types";
import type { TransactionDraft } from "../../types/transactions.types";
import { newTransactionDraft } from "../transactionDraft";
import {
  addAllocationLine,
  addManualParticipant,
  addUserParticipant,
  changeAmount,
  changeType,
  removeParticipant,
  selectAccount,
  selectGroup,
  selectTransferAccount,
  setParticipantShare,
  setShared,
  splitAmongGroup,
  splitEqually
} from "../transactionDraftReducers";

const base = (overrides: Partial<TransactionDraft> = {}): TransactionDraft => ({
  ...newTransactionDraft("USD", "2026-11-05T21:07"),
  ...overrides
});
const accounts = [
  { id: "a1", currency: "USD" },
  { id: "a2", currency: "EUR" }
] as Account[];
const categories = [
  { id: "c1", type: "expense" },
  { id: "c2", type: "income" }
] as Category[];
const member = (userId: string, name: string) => ({
  id: `m-${userId}`,
  userId,
  user: { id: userId, name, email: `${name}@x.io` }
});
const group = {
  id: "g1",
  members: [member("me", "Me"), member("u2", "Sam"), member("u3", "Pat")]
} as unknown as Group;

describe("selectAccount", () => {
  it("sets the currency from the account", () => {
    expect(selectAccount(base(), "a2", accounts)).toMatchObject({ accountId: "a2", executionCurrency: "EUR" });
  });

  it("keeps the currency when cleared, and drops an equal transfer destination", () => {
    const draft = base({ executionCurrency: "MXN", transferToAccountId: "a1" });
    expect(selectAccount(draft, "", accounts).executionCurrency).toBe("MXN");
    expect(selectAccount(draft, "a1", accounts).transferToAccountId).toBe("");
  });
});

describe("selectTransferAccount", () => {
  it("clears a source equal to the new destination", () => {
    expect(selectTransferAccount(base({ accountId: "a1" }), "a1")).toMatchObject({
      accountId: "",
      transferToAccountId: "a1"
    });
    expect(selectTransferAccount(base({ accountId: "a1" }), "a2").accountId).toBe("a1");
  });
});

describe("changeType", () => {
  it("keeps a category matching the new type and drops one that does not", () => {
    expect(changeType(base({ categoryId: "c1" }), "expense", categories).categoryId).toBe("c1");
    expect(changeType(base({ categoryId: "c1" }), "income", categories).categoryId).toBe("");
  });

  it("clears category, group and sharing for a transfer", () => {
    const draft = base({
      categoryId: "c1",
      groupId: "g1",
      isShared: true,
      sharedTitle: "t",
      participants: [{ draftId: "p", participantName: "x", source: "manual", shareAmount: "1" }],
      accountId: "a1",
      transferToAccountId: "a1"
    });
    expect(changeType(draft, "transfer", categories)).toMatchObject({
      type: "transfer",
      categoryId: "",
      groupId: "",
      isShared: false,
      sharedTitle: "",
      participants: [],
      transferToAccountId: ""
    });
  });
});

describe("group split", () => {
  it("splits equally across all members, excluding the current user from the rows", () => {
    const draft = splitAmongGroup(base({ amount: "90" }), group, "me");
    expect(draft.participants.map((p) => [p.userId, p.shareAmount])).toEqual([
      ["u2", "30.00"],
      ["u3", "30.00"]
    ]);
  });

  it("gives the remainder unit to the owner first so shares sum exactly", () => {
    const draft = splitAmongGroup(base({ amount: "100.00" }), group, "me");
    expect(draft.participants.map((p) => p.shareAmount)).toEqual(["33.33", "33.33"]);
    const noOwner = splitAmongGroup(base({ amount: "100.00" }), group, "outsider");
    expect(noOwner.participants.map((p) => p.shareAmount)).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("splits BTC exactly with the remainder going to the owner", () => {
    const draft = splitAmongGroup(base({ amount: "0.01", executionCurrency: "BTC" }), group, "me");
    expect(draft.participants.map((p) => p.shareAmount)).toEqual(["0.003333333333333333", "0.003333333333333333"]);
  });

  it("yields no participants for a missing amount or a one-member group", () => {
    expect(splitAmongGroup(base({ amount: "" }), group, "me").participants).toEqual([]);
    expect(
      splitAmongGroup(base({ amount: "10" }), { ...group, members: [member("me", "Me")] } as unknown as Group, "me")
        .participants
    ).toEqual([]);
  });

  it("selectGroup resets the category and, when sharing, enables it with the split", () => {
    const draft = selectGroup(base({ categoryId: "c1", amount: "60" }), group, { currentUserId: "me", sharing: true });
    expect(draft).toMatchObject({ groupId: "g1", categoryId: "", isShared: true });
    expect(draft.participants).toHaveLength(2);
  });

  it("selectGroup without sharing only resets the category", () => {
    const draft = selectGroup(base({ categoryId: "c1", amount: "60" }), group, { currentUserId: "me", sharing: false });
    expect(draft).toMatchObject({ groupId: "g1", categoryId: "", isShared: false, participants: [] });
  });

  it("clearing the group keeps the category", () => {
    expect(selectGroup(base({ categoryId: "c1", groupId: "g1" }), undefined, { currentUserId: "me", sharing: true })).toMatchObject({
      groupId: "",
      categoryId: "c1"
    });
  });

  it("changeAmount recomputes an existing group split only when sharing", () => {
    const split = splitAmongGroup(base({ amount: "90" }), group, "me");
    const opts = { group, currentUserId: "me" };
    expect(changeAmount(split, "300", { ...opts, sharing: true }).participants[0]?.shareAmount).toBe("100.00");
    expect(changeAmount(split, "300", { ...opts, sharing: false }).participants[0]?.shareAmount).toBe("30.00");
    expect(changeAmount(base(), "5", { ...opts, sharing: true }).participants).toEqual([]);
  });
});

describe("participants", () => {
  const user = { id: "u9", username: "kim", nickname: null, displayName: "Kim" };

  it("adds any app user once, regardless of Group membership", () => {
    const once = addUserParticipant(base(), user);
    expect(once.participants).toHaveLength(1);
    expect(addUserParticipant(once, user).participants).toHaveLength(1);
  });

  it("adds a trimmed manual participant and ignores a blank name", () => {
    expect(addManualParticipant(base(), "  Pat ").participants[0]).toMatchObject({
      participantName: "Pat",
      source: "manual",
      shareAmount: ""
    });
    expect(addManualParticipant(base(), "  ").participants).toEqual([]);
  });

  it("adds a second line for a paid user with a fresh temp key, and blocks it for an unpaid user", () => {
    const sam = { id: "u2", username: "sam", displayName: "Sam" } as never;
    const stored = (paidAmount: string) =>
      base({
        participants: [
          { draftId: "p1", id: "p1", userId: "u2", participantName: "Sam", source: "app", shareAmount: "10", paidAmount }
        ]
      });

    const unpaid = stored("0");
    expect(addUserParticipant(unpaid, sam)).toBe(unpaid);
    expect(addAllocationLine(unpaid, unpaid.participants[0]!)).toBe(unpaid);

    const paid = stored("10");
    const viaSearch = addUserParticipant(paid, sam).participants;
    const viaRow = addAllocationLine(paid, paid.participants[0]!).participants;
    for (const rows of [viaSearch, viaRow]) {
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ userId: "u2", shareAmount: "" });
      expect(rows[1]!.id).toBeUndefined();
      expect(rows[1]!.draftId).not.toBe("p1");
    }
  });

  it("edits a share and removes a row", () => {
    const draft = addManualParticipant(addManualParticipant(base(), "A"), "B");
    const [a, b] = draft.participants;
    const edited = setParticipantShare(draft, a!.draftId, "7");
    expect(edited.participants.map((p) => p.shareAmount)).toEqual(["7", ""]);
    expect(removeParticipant(edited, b!.draftId).participants.map((p) => p.participantName)).toEqual(["A"]);
  });

  it("splitEqually leaves a fully paid share untouched", () => {
    const draft = addManualParticipant(addManualParticipant(base({ amount: "90" }), "A"), "B");
    const locked = {
      ...draft,
      participants: [{ ...draft.participants[0]!, shareAmount: "50", paidAmount: "50", status: "paid" as const, acceptance: "accepted" as const }, draft.participants[1]!]
    };
    expect(splitEqually(locked).participants.map((p) => p.shareAmount)).toEqual(["50", "30.00"]);
  });

  it("splitEqually divides between the owner and the participants", () => {
    const draft = addManualParticipant(addManualParticipant(base({ amount: "90" }), "A"), "B");
    expect(splitEqually(draft).participants.map((p) => p.shareAmount)).toEqual(["30.00", "30.00"]);
    expect(splitEqually(base({ amount: "90" })).participants).toEqual([]);
    expect(splitEqually(addManualParticipant(base({ amount: "" }), "A")).participants[0]?.shareAmount).toBe("");
  });

  it("splitEqually gives remainder units to the owner then list order, in ETH", () => {
    const draft = addManualParticipant(
      addManualParticipant(base({ amount: "1", executionCurrency: "ETH" }), "A"),
      "B"
    );
    const shares = splitEqually(draft).participants.map((p) => p.shareAmount);
    expect(shares).toEqual(["0.333333333333333333", "0.333333333333333333"]);
    const seven = splitEqually(
      [..."ABCDEF"].reduce((d, name) => addManualParticipant(d, name), base({ amount: "1", executionCurrency: "ETH" }))
    ).participants.map((p) => p.shareAmount);
    expect(seven).toEqual(Array(6).fill("0.142857142857142857"));
  });

  it("turning sharing off drops the title and participants", () => {
    const draft = setShared(addManualParticipant(base({ isShared: true, sharedTitle: "t" }), "A"), false);
    expect(draft).toMatchObject({ isShared: false, sharedTitle: "", participants: [] });
    expect(setShared(base(), true).isShared).toBe(true);
  });
});
