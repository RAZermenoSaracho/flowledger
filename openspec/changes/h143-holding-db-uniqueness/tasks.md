# Tasks

## 1. Investigation

- [x] 1.1 Read Odoo #143, the `Holding` model, the migrations, `applyHoldingChanges`, and the REST/v1/MCP callers; identify the NULL-exchange race (design "Root cause").
- [x] 1.2 Audit staging for conflicting rows and non-upper-case codes (none).

## 2. Database

- [x] 2.1 Add migration `20261118120000_holding_unlinked_uniqueness` with the partial unique index (D1, D2).
- [x] 2.2 Check on a scratch database that `prisma migrate diff` stays empty with the index present.

## 3. API

- [x] 3.1 Document in `applyHoldingChanges` that the database indexes decide concurrent creates and that `P2002` maps to the duplicate 400 (D3, D4).

## 4. Tests

- [x] 4.1 Add `apps/api/src/tests/integration/holdingUniqueness.integration.test.ts`. It covers:
  - concurrent duplicate creates, two and five at a time;
  - concurrent create against update;
  - linked duplicates;
  - MCP and REST error shape;
  - the allowed distinct identities;
  - case normalization;
  - remove and re-add;
  - totals and transactions unchanged;
  - that the index exists.
- [x] 4.2 Show the race tests fail without the index.
- [x] 4.3 Typecheck, lint and full test suites pass.

## 5. Docs

- [x] 5.1 `docs/DATA_MODEL.md`: describe the partial index; `docs/KNOWN_ISSUES.md`: resolve #061.

## 6. Release (staging only)

- [ ] 6.1 Open a PR to `razs_ai`, merge, and apply the migration to staging; check the index, the services, and that staging holdings are unchanged.
- [ ] 6.2 Update Odoo #143 for acceptance. Production promotion, archive and closure wait for owner approval.
