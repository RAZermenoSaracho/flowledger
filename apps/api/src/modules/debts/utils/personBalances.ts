import { publicUserLabel } from "../../users/utils/publicUser.js";

/** A user as shown to another user; `displayName` is absent or null unless the user opted into showing their name. */
type PublicUserLike = { id: string; username: string; nickname?: string | null; displayName?: string | null };

function userLabel(user: PublicUserLike) {
  return publicUserLabel({ username: user.username, nickname: user.nickname ?? null, displayName: user.displayName ?? null });
}

type BalanceDebt = {
  id: string;
  userId: string | null;
  participantName: string;
  debtorUserId?: string | null;
  creditorUserId?: string | null;
  outstandingAmount: number;
  outstandingAmountInPreferredCurrency: number;
  user: PublicUserLike | null;
  sharedExpense: {
    ownerUserId: string;
    owner: PublicUserLike;
  };
};

type PersonBalance = {
  key: string;
  person: PublicUserLike | null;
  fallbackName: string;
  theyOweMe: BalanceDebt[];
  iOweThem: BalanceDebt[];
  theyOweMeTotal: number;
  iOweThemTotal: number;
  netBalance: number;
};

function participantName(debt: BalanceDebt) {
  return debt.user ? userLabel(debt.user) : debt.participantName;
}

function partyName(debt: BalanceDebt, userId: string | null | undefined) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId) return userLabel(debt.sharedExpense.owner);
  if (userId === debt.userId) return participantName(debt);
  if (!debt.userId && (userId === debt.debtorUserId || userId === debt.creditorUserId)) {
    return participantName(debt);
  }
  return undefined;
}

function otherParty(debt: BalanceDebt, viewerUserId: string) {
  const otherUserId =
    debt.debtorUserId === viewerUserId ? debt.creditorUserId : debt.debtorUserId;
  const person =
    otherUserId === debt.sharedExpense.ownerUserId
      ? debt.sharedExpense.owner
      : otherUserId === debt.userId
        ? debt.user
        : null;

  return {
    key: otherUserId ?? `participant:${debt.id}`,
    person,
    fallbackName: partyName(debt, otherUserId) ?? participantName(debt) ?? "Unknown user"
  };
}

/** Groups a viewer's owed-to-me and i-owe debts by counterparty into per-person balance summaries, sorted by largest net balance first. */
export function buildPersonBalances(
  viewerUserId: string,
  owedToMe: BalanceDebt[],
  iOwe: BalanceDebt[]
): PersonBalance[] {
  const byPerson = new Map<string, PersonBalance>();

  function ensureBalance(debt: BalanceDebt) {
    const party = otherParty(debt, viewerUserId);
    const existing = byPerson.get(party.key);
    if (existing) return existing;

    const next: PersonBalance = {
      key: party.key,
      person: party.person,
      fallbackName: party.fallbackName,
      theyOweMe: [],
      iOweThem: [],
      theyOweMeTotal: 0,
      iOweThemTotal: 0,
      netBalance: 0
    };
    byPerson.set(party.key, next);
    return next;
  }

  owedToMe.forEach((debt) => {
    const balance = ensureBalance(debt);
    balance.theyOweMe.push(debt);
    balance.theyOweMeTotal +=
      debt.outstandingAmountInPreferredCurrency ?? debt.outstandingAmount;
  });
  iOwe.forEach((debt) => {
    const balance = ensureBalance(debt);
    balance.iOweThem.push(debt);
    balance.iOweThemTotal +=
      debt.outstandingAmountInPreferredCurrency ?? debt.outstandingAmount;
  });

  return Array.from(byPerson.values())
    .map((balance) => ({
      ...balance,
      netBalance: balance.theyOweMeTotal - balance.iOweThemTotal
    }))
    .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
}
