/** The single counting predicate: only `accepted` shares count toward debts, balances, totals and settlement requests. Also exported for ST-008. */
export function isCountedShare(share: { acceptance: "proposed" | "accepted" | "rejected" }) {
  return share.acceptance === "accepted";
}
