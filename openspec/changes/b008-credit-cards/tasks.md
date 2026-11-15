# Tasks

## 1. Data model and shared contracts

- [x] 1.1 Add the additive Prisma migration `b008_credit_cards`:
  - six nullable `Account` columns and `PaymentDueRule`;
  - `Transaction.creditCardKind` and `CreditCardKind`;
  - `Notification.dedupeKey` with `@@unique([userId, dedupeKey])`;
  - five `NotificationType` values.

  Verify `npm run prisma:migrate` and `npm run prisma:generate` succeed, and that `docs/DATA_MODEL.md` documents each field.
- [x] 1.2 Extend the shared account schemas with the card fields. Use a flat base object so `.shape` keeps working for MCP, and a refinement for card-only, all-or-none and due ≤ next-closing rules. Add `creditCardKind` to the transaction schemas. Verify with shared schema tests for valid, non-card, partial-cycle and due-after-closing cases, and for each allowed and rejected `creditCardKind` combination.

## 2. ST-013: card rules and metrics

- [x] 2.1 Fix `normalizeAccountType` so `debit|d[eé]bito` is matched before `card|tarjeta`. Verify `providerAccountMetadata.test.ts` with "Debit Card", "Tarjeta de Débito" and "Tarjeta de Crédito".
- [x] 2.2 In the account create and update services, enforce card-only fields against the merged stored type, and clear them when the type leaves `credit_card`. Verify with service tests for reject, accept and type-change clearing.
- [x] 2.3 Validate `creditCardKind` (payment, refund, cashback, interest) in `prepareTransactionInput`, so every write path is covered. A `refund` requires `expenseOffsetCategoryId`, and the kind is cleared when the transaction no longer qualifies. Card income needs no category: the import path's "category required" check and the `needsClassification` filter skip income on credit cards. Verify with validation, import and list-filter tests for each allowed and rejected combination.
- [x] 2.4 Add `nonCardIncomeWhere` in `reports/utils/reportFilters.ts` and apply it to the income totals of:
  - the summary and by-category reports;
  - `cashflowReportWhere`;
  - the financial-overview savings-rate query;
  - the income bucket of `/transactions/summary`.

  Leave `offsetReportWhere` unchanged. Pass the account type into `calculateMonthlyCashflow`. Add the `creditCardCredits` aggregate, with its breakdown, to the report summary. Verify with report, cashflow, overview and transactions-summary tests for the five reporting scenarios in `credit-card-accounts`, plus an unchanged-totals regression for a user with no cards.

## 3. ST-014: billing calculator

- [x] 3.1 Add `accounts/utils/creditCardCycle.ts`: closing-date clamp, `close`/`due` instants in the billing time zone via `Intl`, both due rules, and period/window enumeration. Verify with util tests for every "Billing period boundaries" scenario, including 23:59 and 00:00 local, a bare-date `00:00Z` transaction, February, leap years and year boundaries.
- [x] 3.2 Extract `transactionBalanceDelta(tx, accountId)` from `calculateAccountBalance`, which then sums it; verify the existing `transactionCalculations` tests still pass unchanged. Then add `accounts/utils/creditCardBilling.ts` (`buildCardBilling`). It maps entries to `{ date, delta, role }` through that same delta, then in one ordered pass derives:
  - metrics;
  - closing debt;
  - payments and credits per window;
  - remaining and on-time remaining;
  - status;
  - confirmed interest;
  - the ADB estimate.

  It then pages the periods. Verify with util tests for design rows 1–15, multiple overdue periods, overpayment, credit balance at closing, estimate unavailability, estimate rounding (MXN 2 decimals, JPY 0), and exact-decimal sums with no float drift.
- [x] 3.3 Add the billing read service with `loadCardEntries(userId, accountIds)`, which runs two indexed queries (by `accountId` and by `transferToAccountId`) scoped by `userId` and supports several cards at once. The service then calls `buildCardBilling`. Add the controller and `GET /accounts/:id/credit-card?page=` with `serialize()`. Verify with service tests using `mockDeep<PrismaClient>()` that exactly two queries run, and with `accounts.routes.test.ts` for 200, non-card 404, cross-user 404 and an unconfigured card.
- [x] 3.4 Add `possibleDuplicates` to pending rows in the imported-list read service, using one batched query per page. Verify with a read service test for an amount and ±5-day match, an already-linked exclusion, and no N+1 queries.

## 4. API surface

- [x] 4.1 Add `GET /v1/accounts/:id/credit-card` to the `/v1` allowlist with `read` scope. Verify v1 route tests for scope, parity and cross-user 404.
- [x] 4.2 Add MCP `get_credit_card` and accept the new fields on the account and transaction tools, then update the tool-count test. Verify MCP tests for parity, a transfer created through MCP being recognized as a payment, and cross-user not-found.
- [x] 4.3 Add an integration test in `src/tests/integration/`. The 6,000 payment created through web, `/v1`, MCP and a notification-model `createTransaction` must produce identical billing responses, and editing or deleting it must recalculate. Verify it passes against testcontainers Postgres.
- [x] 4.4 Add the billing endpoint to `financialIsolation.integration.test.ts`, covering cross-user web and `/v1` access and anonymous requests. Verify the suite passes.

## 5. Reminders

- [x] 5.1 Make `createNotifications` persist `dedupeKey` with `skipDuplicates`. Verify with a create service test for duplicate keys.
- [x] 5.2 Add `notifications/services/creditCardReminders.service.ts`. It loads configured active cards through `loadCardEntries`, reuses `buildCardBilling`, and evaluates both the latest closed period and the most recent period past its due date. It emits the five keyed notifications. Verify with tests for:
  - closed, due soon at 3 days, partial, paid and overdue;
  - overdue when due equals the next closing;
  - no resend after a history edit;
  - no overdue when current debt is 0;
  - per-owner isolation;
  - archived cards skipped.
- [x] 5.3 Call the service from `NotificationRunWorker`'s maintenance timer. Verify with a worker test that repeated and concurrent runs leave one notification per key.

## 6. Web

- [x] 6.1 Add `services/creditCard.client.ts`, `hooks/useCreditCard.ts` and msw handlers. Verify with hook tests.
- [x] 6.2 Add `CreditCardSection`: General tab, registered through `AccountTypeSections`, same draft and Save, time zone defaulting to the device. Verify with a component test for card-only visibility and a single-request save.
- [x] 6.3 Add `CreditCardTab`:
  - metrics and highlighting;
  - estimate vs confirmed interest;
  - the paginated periods table on the shared list components, with stacked records on mobile;
  - period drill-down to the Transactions tab with a date-range scope;
  - Pay, Record external payment and Record interest charge links with `state.from`.

  Verify with component tests for over-limit, no-limit, unconfigured, the overdue label and the prefill URLs.
- [x] 6.4 Extend `transactionPrefill.ts` with `transferToAccountId` and `creditCardKind`. Add the "Card entry" coupling and field for card income and expense. Verify with util and form tests.
- [x] 6.5 Show possible-duplicate hints in import review, and labels and click targets for the five notification types. Verify with import-review, `NotificationsMenu` and `notificationTarget` tests.

## 7. Docs, seed and verification

- [x] 7.1 Document card accounting, the window allocation, classification, the estimate model and its limitations, and reminders in `docs/DOMAIN_LOGIC.md`. Seed one configured card with pre- and post-closing purchases and a transfer payment. Verify `npm run prisma:seed` succeeds.
- [x] 7.2 Run `npm run typecheck`, `npm run lint` and `npm run test`, including the integration suites on the Docker VM. Confirm everything passes.
