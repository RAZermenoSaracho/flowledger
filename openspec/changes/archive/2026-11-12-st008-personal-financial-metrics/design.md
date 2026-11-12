# Design

## Context

Existing pieces reused as is: `calculateAccountBalance` (signed, uses the account's recorded currency), `calculateMonthlyCashflow` (month bucketing in a time zone, transfers skipped, net values), `balanceDebt`, `getExchangeRate`, `resolveReportCurrency` (USD fallback) and `roundMoney`. `listAccounts` and `listDebts` convert with `Promise.all`, so one missing rate fails the whole call. The overview must degrade per item instead, so it does not call them.

## Decisions

1. **One endpoint, two isolated metrics.** `GET /reports/financial-overview?timeZone=` returns `{ currency, netWorth, savingsRate }`. Each metric is computed in its own try, so a failure in one is reported on that metric and the other still returns. Query validated by a shared Zod schema (`timeZone` only; the currency is always the preferred one). Thin controller in `asyncHandler`; all logic in `reports/services/financialOverview.service.ts`; response through `serialize()`.
2. **Net worth.** Read the user's non-archived accounts and their transactions with `where: { userId }`, compute balances with `calculateAccountBalance`, and convert each account with `Promise.allSettled`. Add receivables and subtract payables from outstanding debts (outstanding debts whose share is `accepted`, including manual participants, who are always `accepted`; `proposed` and `rejected` shares are skipped and the `proposed` ones counted as `awaitingAcceptance`), converted per item the same way. A rejected conversion puts the account or debt name in `excluded` and sets `partial: true`. The response carries the total and the three components (accounts, owed to me, I owe).
3. **Credit cards and transfers.** Balances are signed, so card debt is negative and an overpaid card positive. A same-currency transfer is a debit and a credit of the same amount, so net worth is unchanged without special handling. Settlement creates a paired debtor expense and creditor income and reduces the debt, so net worth is unchanged apart from rate differences.
4. **Savings rate.** Resolve the previous complete month as `YYYY-MM` in the request's `timeZone` (default UTC, validated as an IANA zone by the shared schema). Fetch that month's income and expense transactions (transfers excluded, pending imports never present as they are not `Transaction` rows), convert each with `Promise.allSettled`, and reuse `calculateMonthlyCashflow` for net income and net expenses. Outcomes: `ok` (rate may be negative), `no_data` (no income or expense transactions in the month), `unavailable_income` (net income <= 0), `unavailable_rate` (a conversion failed). The rate is returned as a percentage rounded with `roundMoney`.
   **Consent dependency:** the acceptance filter and its counting rule come from `st003-convert-transaction-to-shared`'s consent capability (landing earlier in the PR). The read stays unscoped to any draft: no Form View coupling, no writes.
5. **Disclosures are computed by the API** and returned as a list of codes, so the web only maps codes to text. Codes: `archived_balance_excluded` (an archived account has a non-zero balance), `rates_missing` (via `excluded`), `past_month_current_rates` (savings amounts not in the preferred currency), `cross_currency_effects` (a cross-currency transfer, or a transaction whose currency differs from its account's), `investment_recorded_balance`, `synced_balances`. Awaiting-acceptance is a count (`awaitingAcceptance`) on the net worth, shown as "N awaiting acceptance (not counted)" only when N > 0. A code is present only when it applies.
6. **Web.** `FinancialOverviewSection` with its own `useFinancialOverview` query hook and a function in `reports.client.ts` that sends the device `Intl` time zone. Appended as a child of `GeneralTab`. It is read-only and takes no props from the profile. Disclosures render in one grouped list. States: loading, error (section only), partial, unavailable, not enough data.
7. **Out of scope.** Emergency fund, debt-to-income, personal inflation, fixed vs variable expenses and investment returns are deferred by the roadmap.

## Risks / Trade-offs

- Cashflow for a past month converts at current rates, which is disclosed rather than solved (no rate history exists).
- A card payment recorded as an expense counts twice and cannot be detected; the label says so.
- Fetching all of a user's account transactions is the same cost `listAccounts` already pays.

## Open Questions

- None blocking. The exact wording of the labels follows the roadmap table (English with the Spanish names from the roadmap).
