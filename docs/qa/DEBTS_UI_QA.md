# Debts UI QA guide

Manual QA for the Debts module (Outstanding Balances, Pending Settlements, Settled History, Awaiting Acceptance, Shared Expenses) against seeded staging data. Everything is tagged `[UI QA] `; counterparties are `ui-qa-alex|blair|casey|drew@example.com`.

## Setup

Staging only: the script refuses unless `DATABASE_URL` is `localhost` / `flowledger_staging` and a user with username `razs` exists.

```bash
npm run qa:debts:seed      # idempotent; a second run creates nothing
npm run qa:debts:status    # per-section counts + scenario table with direct URLs (paste below)
npm run qa:debts:cleanup   # deletes only [UI QA] records and ui-qa-*@example.com users
npx tsx database/qa/debtsUiQa.ts cleanup --dry-run   # counts only
```

- Primary viewer: log in as `razs` (own staging account). All scenarios are visible there except where "Log in as" says otherwise.
- QA user passwords are random and live only in `~/.flowledger-ui-qa-credentials` (mode 600, outside the repo).
- Web base URL: https://flowledger-dev.razs.dev

## Scenario table

<!-- Paste the output of `npm run qa:debts:status` here after seeding. -->

## Checks per tab

Fill in pass/fail and notes per row.

### Outstanding Balances
- [ ] Per-person grouping and net totals (Alex: 4 debts, I owe; Blair: owes me; Casey; Jordan manual)
- [ ] EUR debt shown in EUR and converted into the preferred currency in totals
- [ ] Partially paid debts show outstanding, not share
- [ ] Balance detail `/debts/balances/<personKey>`: back arrow, per-row settlement form, batch settlement

### Pending Settlements
- [ ] "Requests by me" shows the Alex 35.00 request
- [ ] "Awaiting my approval" shows Blair 25.00, Blair 15.50, Casey 40.00
- [ ] Approve one, reject one, batch-approve the rest (choose income account/category)
- [ ] `?tab=pending&settlementId=<id>` highlights the row

### Settled History
- [ ] Both directions (paid Alex / Blair paid me), direct settlements (Casey, Jordan)
- [ ] `?tab=settled&debtId=<id>` highlights the row
- [ ] Rejected request (Blair 10.00) is not pending and the debt stays outstanding

### Awaiting Acceptance
- [ ] Alex dinner (razs + manual) and Blair trip (razs + Casey) are accept/reject-able and excluded from totals
- [ ] Rejected group shows Drew's rejection (owner view); log in as Casey to see the share razs rejected
- [ ] Drew's unanswered share shows as awaiting for the owner
- [ ] `?tab=awaiting&sharedExpenseId=<id>` highlights the row

### Shared Expenses
- [ ] Simple, Multiple participants (incl. manual, unaccepted), Partially settled, fully settled (Blair paid me in full), Cancelled, Editable
- [ ] `/debts/shared-expenses/<id>` detail: back arrow to `/debts?tab=sharedExpenses`, edit/delete only where guards allow
- [ ] Razs-as-participant expenses (Alex/Blair/Casey owned) are not editable by razs

## Notes
- Settlement approvals create real transactions on both sides (`Settlement: [UI QA] ...`); cleanup removes razs's side too.
- If a scenario fails mid-way the seed reports it and continues; run `cleanup` then `seed` to repair it.
