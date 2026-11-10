# Proposal

## Why

An existing transaction cannot be made shared from the app: `TransactionEditPage` has no sharing controls on desktop or mobile, and sharing can only be chosen at creation. The backend path already exists (`POST /shared-expenses` accepts an existing `transactionId`, and the web client function exists), so this is a form-level gap.

## What Changes

- ST-003 reuses ST-007's sharing draft fields (`isShared`, `sharedTitle`, `participants`) and `SharedParticipantsFields` controls, enabling them on existing, not-yet-shared transactions, on mobile and desktop.
- The save pipeline owned by ST-007 gets one conditional extra step: after `PUT /transactions/:id`, if sharing was newly enabled and no shared expense exists, call `POST /shared-expenses` with the `transactionId`.
- Partial failure: if the update succeeds and sharing creation fails, the transaction is refetched, the draft is kept with an error, and retry re-runs only the sharing step.
- Already-shared transactions show participants read-only (editing existing sharing is out of scope).
- Server: a second conversion of the same transaction returns a friendly 409 instead of a raw unique-constraint error.
- No change to `updateTransactionSchema`, no migration, no new form state or mutation pipeline.

**Depends on ST-007** (`st007-transaction-form-view`): it extends that change's draft, reducers and save function and cannot ship before it. Ships in the single B-004 PR to `razs_ai`, fourth in order (ST-005, ST-006, ST-007, ST-003, ST-024, ST-008), immediately after ST-007.

Open question from the roadmap: #017 is fixed in ST-007; #019 stays logged and unchanged because conversion does not need non-group participants (it uses the same participant picker and server rules as creation today).

## Capabilities

### New Capabilities
- `transaction-sharing-conversion`: converting an existing transaction to shared from the Form View.

### Modified Capabilities

None.

## Impact

- Web: `pages/Transactions/` draft type, validation and save pipeline additions; view sections reuse `SharedParticipantsFields`.
- API: `shared-expenses/services/create.service.ts` conflict mapping and its test.
- Docs: `docs/KNOWN_ISSUES.md` (#019 noted as unchanged).
