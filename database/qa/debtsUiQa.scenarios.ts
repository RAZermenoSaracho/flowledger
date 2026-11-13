/** QA counterparties created by the Debts UI QA seed (`ui-qa-<key>@example.com`). */
export const QA_USER_KEYS = ["alex", "blair", "casey", "drew"] as const;

/** Any actor in a scenario: the primary viewer (`razs`) or a QA counterparty. */
export type Who = "razs" | (typeof QA_USER_KEYS)[number];

/** Per-actor QA account keys: `checking` and `cash` are USD, `eur` is a EUR savings account. */
export type AcctKey = "checking" | "cash" | "eur";

/** A participant: an actor key, or any other string for a manual (non-app) participant. */
export type Part = Who | string;

/** One post-creation action, performed through the application services. `p` picks the participant row. */
export type Step =
  | { do: "accept" | "reject"; p: Who }
  | { do: "request"; p: Who; amount: string; acct?: AcctKey }
  | { do: "approve" | "rejectRequest" | "direct"; p: Part }
  | { do: "cancel" };

/** Which deep links `status` prints for a scenario. */
export type LinkKind = "balance" | "pending" | "awaiting" | "settled" | "se" | "tx";

/** One QA scenario: an owner-paid expense shared with participants, then steps that drive it to the target state. */
export type Scenario = {
  section: string;
  /** Transaction name, shared-expense title and idempotency key (unique per owner). */
  name: string;
  owner: Who;
  amount: string;
  daysAgo: number;
  /** Owner's payment account; `eur` makes the debt EUR-denominated. */
  acct?: AcctKey;
  parts: { p: Part; share: string }[];
  steps: Step[];
  expected: string;
  feature: string;
  links: LinkKind[];
  /** Account to log in as when checking the scenario (defaults to razs). */
  viewer?: Who;
};

const P = "[UI QA] ";

/** Every Debts UI QA scenario, in creation order. Amounts are chosen so partial/full states are obvious. */
export const SCENARIOS: Scenario[] = [
  // Outstanding
  { section: "Outstanding", name: `${P}Outstanding - I owe Alex (dinner)`, owner: "alex", amount: "80.00", daysAgo: 55,
    parts: [{ p: "razs", share: "40.00" }], steps: [{ do: "accept", p: "razs" }],
    expected: "I owe Alex 40.00 USD outstanding", feature: "iOwe list, balances grouping (4 debts with Alex, net 175.00)", links: ["balance", "se", "tx"] },
  { section: "Outstanding", name: `${P}Outstanding - I owe Alex (taxi)`, owner: "alex", amount: "60.00", daysAgo: 48,
    parts: [{ p: "razs", share: "30.00" }], steps: [{ do: "accept", p: "razs" }],
    expected: "I owe Alex 30.00 USD outstanding", feature: "Multiple debts with the same person", links: ["balance", "se"] },
  { section: "Outstanding", name: `${P}Outstanding - I owe Alex (groceries)`, owner: "alex", amount: "90.00", daysAgo: 41,
    parts: [{ p: "razs", share: "45.00" }], steps: [{ do: "accept", p: "razs" }],
    expected: "I owe Alex 45.00 USD outstanding", feature: "Multiple debts with the same person", links: ["balance", "se"] },
  { section: "Outstanding", name: `${P}Outstanding - Blair owes me (concert)`, owner: "razs", amount: "120.00", daysAgo: 36,
    parts: [{ p: "blair", share: "60.00" }], steps: [{ do: "accept", p: "blair" }],
    expected: "Blair owes me 60.00 USD", feature: "owedToMe list, Blair balance detail", links: ["balance", "se", "tx"] },
  { section: "Outstanding", name: `${P}Outstanding - Blair owes me EUR (hotel)`, owner: "razs", amount: "200.00", daysAgo: 30, acct: "eur",
    parts: [{ p: "blair", share: "100.00" }], steps: [{ do: "accept", p: "blair" }],
    expected: "Blair owes me 100.00 EUR (balances total converted to USD)", feature: "Different-currency debt, preferred-currency conversion", links: ["balance", "se"] },
  { section: "Outstanding", name: `${P}Outstanding - Jordan owes me (manual)`, owner: "razs", amount: "50.00", daysAgo: 28,
    parts: [{ p: "[UI QA] Jordan", share: "25.00" }], steps: [],
    expected: "Manual participant Jordan owes me 25.00 USD; no settlement request possible", feature: "Manual (non-app) debt, balances key participant:<id>", links: ["balance", "se"] },
  { section: "Outstanding + Shared Expenses", name: `${P}Shared Expense - Partially settled (Blair rent)`, owner: "razs", amount: "300.00", daysAgo: 45,
    parts: [{ p: "blair", share: "200.00" }],
    steps: [{ do: "accept", p: "blair" }, { do: "request", p: "blair", amount: "75.00" }, { do: "approve", p: "blair" }],
    expected: "Blair share 200.00, paid 75.00, outstanding 125.00, participant status partial, expense open", feature: "Partial settlement, partially settled shared expense", links: ["balance", "se", "settled"] },
  { section: "Outstanding", name: `${P}Outstanding - Partially paid to Alex (internet)`, owner: "alex", amount: "200.00", daysAgo: 44,
    parts: [{ p: "razs", share: "100.00" }],
    steps: [{ do: "accept", p: "razs" }, { do: "request", p: "razs", amount: "40.00" }, { do: "approve", p: "razs" }],
    expected: "I owe Alex 60.00 outstanding (40.00 already paid)", feature: "Partial settlement in the iOwe direction", links: ["balance", "se"] },

  // Pending settlement requests
  { section: "Pending Settlements", name: `${P}Settlement - Requested by me (Alex 35.00)`, owner: "alex", amount: "140.00", daysAgo: 20,
    parts: [{ p: "razs", share: "70.00" }],
    steps: [{ do: "accept", p: "razs" }, { do: "request", p: "razs", amount: "35.00" }],
    expected: "Pending request 35.00 from me to Alex, awaiting Alex (Requests by me); outstanding 70.00, 35.00 pending", feature: "Requests by me", links: ["pending", "balance"] },
  { section: "Pending Settlements", name: `${P}Settlement - Pending my approval (Blair 25.00)`, owner: "razs", amount: "100.00", daysAgo: 18,
    parts: [{ p: "blair", share: "50.00" }],
    steps: [{ do: "accept", p: "blair" }, { do: "request", p: "blair", amount: "25.00" }],
    expected: "Blair requested 25.00 (Checking); awaiting my approval", feature: "Awaiting my approval, approve/reject, batch approval", links: ["pending", "balance"] },
  { section: "Pending Settlements", name: `${P}Settlement - Pending my approval (Blair 15.50)`, owner: "razs", amount: "50.00", daysAgo: 15,
    parts: [{ p: "blair", share: "20.00" }],
    steps: [{ do: "accept", p: "blair" }, { do: "request", p: "blair", amount: "15.50", acct: "cash" }],
    expected: "Blair requested 15.50 from Cash; awaiting my approval", feature: "Batch approval (second request, different amount/account)", links: ["pending"] },
  { section: "Pending Settlements", name: `${P}Settlement - Pending my approval (Casey 40.00)`, owner: "razs", amount: "80.00", daysAgo: 12,
    parts: [{ p: "casey", share: "60.00" }],
    steps: [{ do: "accept", p: "casey" }, { do: "request", p: "casey", amount: "40.00" }],
    expected: "Casey requested 40.00; awaiting my approval", feature: "Awaiting my approval from a different person (batch across people)", links: ["pending", "balance"] },

  // Settled history
  { section: "Settled + Shared Expenses", name: `${P}Settled - I paid Alex in full`, owner: "alex", amount: "60.00", daysAgo: 52,
    parts: [{ p: "razs", share: "30.00" }],
    steps: [{ do: "accept", p: "razs" }, { do: "request", p: "razs", amount: "30.00" }, { do: "approve", p: "razs" }],
    expected: "Settled history: I paid Alex 30.00 via approved settlement", feature: "Settled history, debtor direction", links: ["settled", "se"] },
  { section: "Settled + Shared Expenses", name: `${P}Settled - Blair paid me in full`, owner: "razs", amount: "80.00", daysAgo: 50,
    parts: [{ p: "blair", share: "40.00" }],
    steps: [{ do: "accept", p: "blair" }, { do: "request", p: "blair", amount: "40.00" }, { do: "approve", p: "blair" }],
    expected: "Settled history: Blair paid me 40.00; shared expense status settled", feature: "Settled history, creditor direction, fully settled shared expense", links: ["settled", "se", "tx"] },
  { section: "Settled", name: `${P}Settled - Direct settlement (Casey)`, owner: "razs", amount: "90.00", daysAgo: 33,
    parts: [{ p: "casey", share: "30.00" }], steps: [{ do: "accept", p: "casey" }, { do: "direct", p: "casey" }],
    expected: "Settled history: Casey 30.00 marked paid directly (no settlement transactions)", feature: "settleDebtDirectly", links: ["settled", "se"] },
  { section: "Settled", name: `${P}Settled - Manual participant settled directly (Jordan)`, owner: "razs", amount: "40.00", daysAgo: 27,
    parts: [{ p: "[UI QA] Jordan", share: "20.00" }], steps: [{ do: "direct", p: "[UI QA] Jordan" }],
    expected: "Settled history: manual Jordan 20.00 marked paid", feature: "Direct settlement of a manual participant", links: ["settled", "se"] },
  { section: "Settled (rejected request)", name: `${P}Settled - Rejected request (Blair 10.00)`, owner: "razs", amount: "60.00", daysAgo: 24,
    parts: [{ p: "blair", share: "30.00" }],
    steps: [{ do: "accept", p: "blair" }, { do: "request", p: "blair", amount: "10.00" }, { do: "rejectRequest", p: "blair" }],
    expected: "Blair 30.00 still outstanding; one rejected settlement request (10.00) in history; nothing pending", feature: "Rejected settlement request history", links: ["balance", "se", "tx"] },

  // Awaiting acceptance
  { section: "Awaiting Acceptance", name: `${P}Awaiting acceptance - Alex shared dinner (razs + manual)`, owner: "alex", amount: "100.00", daysAgo: 8,
    parts: [{ p: "razs", share: "30.00" }, { p: "[UI QA] Sam", share: "20.00" }], steps: [],
    expected: "Proposed share of 30.00 awaiting my response; excluded from totals", feature: "Awaiting acceptance with a manual co-participant; accept/reject", links: ["awaiting"] },
  { section: "Awaiting Acceptance", name: `${P}Awaiting acceptance - Blair shared trip (razs + Casey)`, owner: "blair", amount: "150.00", daysAgo: 6,
    parts: [{ p: "razs", share: "50.00" }, { p: "casey", share: "50.00" }], steps: [{ do: "accept", p: "casey" }],
    expected: "My proposed share 50.00 awaiting response; Casey already accepted", feature: "Awaiting acceptance with another app user who accepted", links: ["awaiting"] },
  { section: "Awaiting Acceptance (rejected)", name: `${P}Awaiting acceptance - Rejected by Drew`, owner: "razs", amount: "60.00", daysAgo: 10,
    parts: [{ p: "drew", share: "30.00" }], steps: [{ do: "reject", p: "drew" }],
    expected: "Drew rejected his 30.00 share; appears in Rejected group for me as owner", feature: "Rejected shares group (owner view)", links: ["awaiting", "se"] },
  { section: "Awaiting Acceptance (rejected)", name: `${P}Awaiting acceptance - Rejected by me (Casey)`, owner: "casey", amount: "70.00", daysAgo: 9,
    parts: [{ p: "razs", share: "35.00" }], steps: [{ do: "reject", p: "razs" }],
    expected: "I rejected the 35.00 share; visible to Casey (owner) as rejected, excluded from my totals", feature: "Rejected share from the participant side (log in as Casey to see the Rejected group)", links: ["awaiting"], viewer: "casey" },
  { section: "Awaiting Acceptance", name: `${P}Awaiting acceptance - I shared with Drew (no response)`, owner: "razs", amount: "80.00", daysAgo: 5,
    parts: [{ p: "drew", share: "40.00" }], steps: [],
    expected: "Drew's 40.00 share is proposed; shown to me as awaiting acceptance", feature: "Awaiting acceptance, owner view; Drew can accept/reject", links: ["awaiting", "se"] },

  // Shared Expenses tab
  { section: "Shared Expenses", name: `${P}Shared Expense - Simple (Alex)`, owner: "razs", amount: "40.00", daysAgo: 22,
    parts: [{ p: "alex", share: "20.00" }], steps: [{ do: "accept", p: "alex" }],
    expected: "Open expense, one accepted participant, nothing paid", feature: "Simple 1-participant shared expense", links: ["se", "tx"] },
  { section: "Shared Expenses", name: `${P}Shared Expense - Multiple participants`, owner: "razs", amount: "200.00", daysAgo: 14,
    parts: [{ p: "alex", share: "50.00" }, { p: "blair", share: "50.00" }, { p: "casey", share: "40.00" }, { p: "[UI QA] Jordan", share: "30.00" }],
    steps: [{ do: "accept", p: "alex" }, { do: "accept", p: "blair" }],
    expected: "4 participants: Alex/Blair accepted, Casey proposed, Jordan manual; owner share 30.00", feature: "Multiple participants incl. manual and unaccepted", links: ["se", "tx"] },
  { section: "Shared Expenses", name: `${P}Shared Expense - Cancelled`, owner: "razs", amount: "30.00", daysAgo: 16,
    parts: [{ p: "alex", share: "15.00" }], steps: [{ do: "cancel" }],
    expected: "Status cancelled; Alex's share still proposed (never counted)", feature: "Cancelled shared expense", links: ["se"] },
  { section: "Shared Expenses", name: `${P}Shared Expense - Editable`, owner: "razs", amount: "60.00", daysAgo: 3,
    parts: [{ p: "[UI QA] Jordan", share: "20.00" }], steps: [],
    expected: "Open, manual participant only, no payments: safe to edit/delete in the UI", feature: "Editing shared expense structure and title", links: ["se", "tx"] }
];
