# KNOWN_ISSUES migration — review ledger

This is a temporary ledger for the migration to the Odoo project "Flowledger" (#56). Every other entry has been migrated to Odoo or removed as resolved; see the PR that introduced this ledger for the mapping. The full original file is in git history.

Do not add entries. New bugs, enhancements and technical debt go in Odoo. Delete this file once every decision below is resolved.

---

## #004 — `ImportedTransactionCard` action cluster doesn't use `RecordCard`

- **Original:** Import/Ignore buttons sit in a hand-rolled three-zone grid (checkbox | details | amount + category select + buttons). Moving to `RecordCard` needs a layout redesign, because `actions` only takes buttons and the select would have to move into `children` below the row.
- **Related Odoo tasks:** none.
- **Recommended decision:** DELETE. The card is a dense, form-embedded review row, not a list row, and its buttons work on all widths today. Revisit only if the import review is redesigned.
- `USER_DECISION: PENDING`

## #020 (part) — Shared-expense shares may total less than the transaction amount

- **Original:** `validateSharedExpenseParticipants` only rejects shares above the amount, so the owner keeps the remainder. The original change text said shares equal the amount. The 404 half of this entry is Odoo #157.
- **Related Odoo tasks:** #157.
- **Recommended decision:** DELETE as by design. "The owner keeps the remainder" is a valid split model, and the code is deliberate about it. Choose REDEFINE instead if shares must always equal the amount.
- `USER_DECISION: PENDING`

## #034 — Sibling-subdomain cookie risks remain after the refresh cookie became host-only

- **Original:** A compromised `razs.dev` sibling can plant cookies for FlowLedger's hosts (session fixation, tampering with the Google state cookie). `__Host-` isn't usable for the refresh cookie because it requires `Path=/`. This is an accepted risk that needs a compromised sibling first.
- **Related Odoo tasks:** #163 (the Google link callback check, which closes the most concrete consequence).
- **Recommended decision:** CREATE an `[INTENT]` to move FlowLedger to its own registrable domain, scheduled with the AWS architecture work (#153). Otherwise, DELETE as an accepted risk.
- `USER_DECISION: PENDING`

## #057 — Crypto valuations treat USDT as USD

- **Original:** Binance quotes are in USDT and the conversion layer treats 1 USDT as 1 USD, so a depeg would distort crypto values. This is disclosed as `crypto_usdt_as_usd` ("Market (Binance, USDT = USD)").
- **Related Odoo tasks:** #145 (on-chain wallets, which also needs a better pricing source).
- **Recommended decision:** DELETE as a disclosed, by-design limitation. Choose CREATE only if a USD-quoted crypto source becomes a requirement.
- `USER_DECISION: PENDING`
