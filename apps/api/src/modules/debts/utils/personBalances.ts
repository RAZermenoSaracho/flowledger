type BalanceDebt = {
  id: string;
  userId: string | null;
  participantName: string;
  debtorUserId?: string | null;
  creditorUserId?: string | null;
  outstandingAmount: number;
  outstandingAmountInPreferredCurrency: number;
  user: { id: string; name: string; email: string } | null;
  sharedExpense: {
    ownerUserId: string;
    owner: { id: string; name: string; email: string };
  };
};

type PersonBalance = {
  key: string;
  person: { id: string; name: string; email: string } | null;
  fallbackName: string;
  theyOweMe: BalanceDebt[];
  iOweThem: BalanceDebt[];
  theyOweMeTotal: number;
  iOweThemTotal: number;
  netBalance: number;
};

function participantName(debt: BalanceDebt) {
  return debt.user?.name ?? debt.participantName;
}

function partyName(debt: BalanceDebt, userId: string | null | undefined) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId) return debt.sharedExpense.owner.name;
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
