# Proposal

## Why

The Profile General tab shows identity fields only. Users have no place that states their overall financial position or how much they saved last month, although FlowLedger already holds balances, debts, exchange rates and monthly cashflow. ST-008 adds two read-only metrics, estimated net worth and monthly savings rate, built only from existing data, and is honest about where each figure is approximate.

## What Changes

- New read endpoint `GET /reports/financial-overview?timeZone=` returns both metrics, computed entirely in the API for the signed-in user.
- **Estimated net worth** (preferred currency): non-archived account balances, plus what people owe the user, minus what the user owes, counting only `accepted` shared-expense shares; `proposed` and `rejected` shares are excluded and disclosed as "N awaiting acceptance (not counted)". Items with no exchange rate are named and excluded, and the result is marked partial. Credit-card debt reduces it, an overpaid card raises it, and same-currency transfers and debt settlements leave it unchanged.
- **Savings rate** for the last complete calendar month in the user's time zone: (net income - net expenses) / net income. Zero or negative income is "unavailable", a month with no income or expense transactions is "not enough data", and expenses above income give a negative rate. A missing rate makes only this metric unavailable.
- A "Financial overview" section on the Profile General tab, read-only, at mobile width and in both themes. It shows the units, the period, the "estimate" or "recorded" label, and one grouped list of disclosures that appear only when they apply.
- No migration, no new classification, no user configuration, no raw SQL.

## Capabilities

### New Capabilities
- `financial-overview`: the two metrics, their disclosures and the Profile section.

### Modified Capabilities

None. `profile-identity-layout` is not modified.

## Impact

- `packages/shared` (response and query schemas), `apps/api/src/modules/reports/` (controller, `financialOverview.service.ts`, route), `apps/web/src/pages/Profile/` (new section and hook), `apps/web/src/services/reports.client.ts`, plus docs lines.
- Dependency: relies on `st003-convert-transaction-to-shared`'s consent capability (`shared-expense-consent`, the `accepted`/`proposed`/`rejected` acceptance state), which lands earlier in the PR.
- Ordering: the section is appended as a child of `GeneralTab`, which `st005-reusable-editable-form-view` migrates. Implement this change after ST-005 so it applies on top of that migration. It takes no `profile` prop and uses no Form View state.
- Delivery: ships in the single B-004 PR to `razs_ai`, sixth and last in order (ST-005, ST-006, ST-007, ST-003, ST-024, ST-008), after ST-024.
- Risk: figures depend on how users recorded transactions. Mitigation: labels and disclosures required by the spec.
