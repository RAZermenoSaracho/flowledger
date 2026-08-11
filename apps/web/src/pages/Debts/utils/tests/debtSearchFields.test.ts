import { describe, expect, it } from "vitest";
import type { Debt, PersonBalance, SettlementRequest } from "../../../../types/debts.types";
import {
  BALANCE_DEFAULT_SEARCH_FIELD,
  balanceSearchFields,
  SETTLED_DEBT_DEFAULT_SEARCH_FIELD,
  settledDebtSearchFields,
  SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD,
  settlementRequestSearchFields,
  toBalanceSearchRow,
  toSettledDebtSearchRow,
  toSettlementRequestSearchRow
} from "../debtSearchFields";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 40,
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 60,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      owner: { id: "user-1", name: "Jane", email: "jane@example.com" },
      transaction: { name: "Dinner out", type: "expense" } as Debt["sharedExpense"]["transaction"],
      participants: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    },
    user: { id: "user-2", name: "Sam", email: "sam@example.com" },
    settlementRequests: [],
    ...overrides
  };
}

describe("toBalanceSearchRow", () => {
  it("flattens a PersonBalance's searchable fields", () => {
    const debt = makeDebt();
    const balance: PersonBalance = {
      key: "user-2",
      person: { id: "user-2", name: "Sam", email: "sam@example.com" },
      fallbackName: "Sam",
      theyOweMe: [debt],
      iOweThem: [],
      theyOweMeTotal: 60,
      iOweThemTotal: 0,
      netBalance: 60
    };

    expect(toBalanceSearchRow(balance)).toEqual({
      personName: "Sam",
      personEmail: "sam@example.com",
      recordTitles: "Dinner split",
      netBalance: 60,
      theyOweMeTotal: 60,
      iOweThemTotal: 0
    });
  });
});

describe("balanceSearchFields", () => {
  it("expands 'search' into personName/personEmail/recordTitles", () => {
    const searchField = balanceSearchFields.find((field) => field.name === "search");
    expect(searchField?.expandsToFields).toEqual(["personName", "personEmail", "recordTitles"]);
  });

  it("targets 'search' as the default field", () => {
    expect(BALANCE_DEFAULT_SEARCH_FIELD).toBe("search");
  });
});

describe("toSettlementRequestSearchRow", () => {
  function makeRequest(overrides: Partial<SettlementRequest> = {}): SettlementRequest {
    return {
      id: "sr-1",
      sharedExpenseParticipantId: "debt-1",
      debtorUserId: "user-2",
      creditorUserId: "user-1",
      amount: 50,
      status: "pending",
      note: "Paying you back",
      debtor: { id: "user-2", name: "Sam", email: "sam@example.com" },
      creditor: { id: "user-1", name: "Jane", email: "jane@example.com" },
      sharedExpenseParticipant: makeDebt(),
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      ...overrides
    };
  }

  it("flattens a SettlementRequest's searchable fields", () => {
    expect(toSettlementRequestSearchRow(makeRequest())).toEqual({
      debtTitle: "Dinner split",
      transactionName: "Dinner out",
      debtorName: "Sam",
      debtorEmail: "sam@example.com",
      creditorName: "Jane",
      creditorEmail: "jane@example.com",
      note: "Paying you back",
      amount: 50,
      status: "pending"
    });
  });

  it("defaults every string field to '' when the linked debt/debtor/creditor/note are absent", () => {
    expect(
      toSettlementRequestSearchRow(
        makeRequest({ sharedExpenseParticipant: undefined, debtor: undefined, creditor: undefined, note: null })
      )
    ).toMatchObject({
      debtTitle: "",
      transactionName: "",
      debtorName: "",
      debtorEmail: "",
      creditorName: "",
      creditorEmail: "",
      note: ""
    });
  });
});

describe("settlementRequestSearchFields", () => {
  it("expands 'search' into every string field", () => {
    const searchField = settlementRequestSearchFields.find((field) => field.name === "search");
    expect(searchField?.expandsToFields).toEqual([
      "debtTitle",
      "transactionName",
      "debtorName",
      "debtorEmail",
      "creditorName",
      "creditorEmail",
      "note"
    ]);
  });

  it("populates the status field's options from SETTLEMENT_STATUSES", () => {
    const statusField = settlementRequestSearchFields.find((field) => field.name === "status");
    expect(statusField?.options?.length).toBeGreaterThan(0);
  });

  it("targets 'search' as the default field", () => {
    expect(SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD).toBe("search");
  });
});

describe("toSettledDebtSearchRow", () => {
  it("flattens a settled Debt's searchable fields", () => {
    const debt = makeDebt({ outstandingAmount: 0 });
    expect(toSettledDebtSearchRow(debt, "user-2")).toEqual({
      title: "Dinner split",
      description: "Jane · expense split · $40.00 settled of $100.00",
      status: "settled",
      participantName: "Friend",
      userName: "Sam",
      userEmail: "sam@example.com",
      ownerName: "Jane",
      ownerEmail: "jane@example.com",
      transactionName: "Dinner out",
      shareAmount: 100,
      paidAmount: 40,
      outstandingAmount: 0
    });
  });
});

describe("settledDebtSearchFields", () => {
  it("expands 'search' into every string field", () => {
    const searchField = settledDebtSearchFields.find((field) => field.name === "search");
    expect(searchField?.expandsToFields).toEqual([
      "title",
      "description",
      "status",
      "participantName",
      "userName",
      "userEmail",
      "ownerName",
      "ownerEmail",
      "transactionName"
    ]);
  });

  it("targets 'search' as the default field", () => {
    expect(SETTLED_DEBT_DEFAULT_SEARCH_FIELD).toBe("search");
  });
});
