## MODIFIED Requirements

### Requirement: Imported-transaction review
`PATCH /v1/imported-transactions/:id`, `POST /v1/imported-transactions/:id/ignore`, `/unignore` and `/import` SHALL call the same controllers and services as the web app's `/transactions/imported/:id` routes with identical authorization, validation and errors; an id of another user or a missing id SHALL return 404 and a row in the wrong status SHALL return 400. The batch routes `POST /v1/imported-transactions/batch-ignore`, `/batch-unignore` and `/batch-import` SHALL accept only `{ selection: { mode: "ids", ids: [1 to 50 ids] } }` (plus an optional `categoryId` for import) and SHALL reject the `filtered` mode, an empty list and more than 50 ids with 400. A batch SHALL validate every row before changing any and SHALL be atomic: one row in the wrong status or without a valid category returns 400 with a per-row `errors` list and changes nothing, and a failure while writing any row SHALL roll back every row of the batch. Every requested id that is missing or not the caller's SHALL fail the batch with 400 and an `errors` entry for that id; the message SHALL be identical for a missing id and another user's id, and nothing SHALL change. A `filtered`-mode batch import that resolves to more than 500 rows SHALL fail with 400 and change nothing. Each route SHALL require `write` and be audited.

#### Scenario: Batch is all-or-nothing
- **WHEN** a batch includes one row that is not pending
- **THEN** the response is 400 listing that row and every other row is unchanged

#### Scenario: Failure mid-write rolls back
- **WHEN** creating one row of a batch import fails after other rows were created in the same request
- **THEN** no `Transaction` from the batch exists and every row is still pending

#### Scenario: Unknown or foreign id fails the batch
- **WHEN** a batch names one id that does not exist and one that belongs to another user, plus valid pending ids
- **THEN** the response is 400 with the same `errors` message for both ids, no row is imported and B's row is unchanged

#### Scenario: Batch limits
- **WHEN** a batch uses `mode: "filtered"`, an empty `ids`, or 51 ids
- **THEN** the response is 400 and nothing changes

#### Scenario: Set category
- **WHEN** a write key patches a pending imported row with a category of the matching type
- **THEN** the response is 200 and the row has that category; a category of the wrong type returns 400

#### Scenario: Ignore and unignore
- **WHEN** a write key ignores a pending row and then unignores it
- **THEN** the status goes pending, ignored, pending; ignoring a non-pending row returns 400

#### Scenario: Import
- **WHEN** a write key imports a pending row that has a category
- **THEN** the response is 201, a transaction exists for the user, the row is processed, and importing it again returns 400

#### Scenario: Cross-user
- **WHEN** user A's write key acts on user B's imported row
- **THEN** single routes return 404 and batch routes act on nothing; B's row is unchanged

#### Scenario: Read key
- **WHEN** a read-only key calls any review route
- **THEN** the response is 403 and nothing changes
