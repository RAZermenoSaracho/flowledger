# Tasks

Work on a feature branch from the latest `razs_ai`, after `fix-access-token-purpose-validation` is deployed. Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Read `docs/TESTING.md` first.

## 1. Close exposure gaps

- [ ] 1.1 In `shared-expenses/services/read.service.ts`, return `publicTransactionSelect` to non-owners and the full transaction to owners, in list and detail reads. Verify `services/tests/read.service.test.ts` asserts both shapes.
- [ ] 1.2 Check each `apps/web/src` consumer of shared-expense transaction fields, then narrow the web type for participants. Verify `npm run typecheck -w apps/web` and affected component tests pass with a participant fixture.
- [ ] 1.3 Scope `settleDebtDirectly`'s load by creditor in the query. Verify `debts/services/tests/update.service.test.ts` keeps the uniform 404 for a non-creditor and an unknown id.
- [ ] 1.4 Apply a three-character minimum and 10-result cap to web user search through the shared schema, and show a hint in the search inputs. Verify schema, route, and component tests, then flip `docs/KNOWN_ISSUES.md` #022 to `[RESOLVED]`.

## 2. Isolation regression suite

- [ ] 2.1 Add `apps/api/src/tests/integration/financialIsolation.integration.test.ts`, with an anonymous table asserting 401 on every protected mount in `apps/api/src/app.ts`. Verify by temporarily confirming each row fails when authentication is removed in a local-only experiment, then discard the experiment.
- [ ] 2.2 Add cross-user read, update, and delete rows for accounts, transactions, imported transactions (including batch `ids` and `filtered` modes), categories, notifications, API keys, and OAuth grants. Verify each asserts 404 and that the second user's record is unchanged in the database.
- [ ] 2.3 Add filter-escape rows for transaction and imported-transaction queries, using a top-level `or` expression. Verify only the caller's rows are returned.
- [ ] 2.4 Add role rows: creditor-only settlement actions, participant and non-participant shared-expense reads, group member versus admin actions, and `/v1` scope enforcement for a read-only key. Verify each denial leaves data unchanged.
- [ ] 2.5 Add a note to `docs/TESTING.md` that new user-data mounts must add rows to this suite. Verify the note appears in the API integration section.

## 3. Finish

- [ ] 3.1 Run `npm run typecheck`, `npm run lint`, and `npm run test`, with the Docker test VM running. Verify all pass, and record any finding the new suite exposes as a blocker or a `docs/KNOWN_ISSUES.md` entry.
- [ ] 3.2 On `flowledger-dev.razs.dev`, open a shared expense as owner and as participant with synthetic users. Verify both views render and the participant response omits owner-only fields in browser tools.
