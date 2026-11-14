# Spec Delta

## ADDED Requirements

### Requirement: Own notification models

A signed-in user SHALL be able to list, create, read, update and delete their own notification models. A model that does not exist or belongs to another user SHALL be answered with 404, indistinguishable from each other.

#### Scenario: Create and list
- **WHEN** a user creates a model and then lists models
- **THEN** the new model appears in the list, which contains only that user's models

#### Scenario: Foreign model
- **WHEN** a user reads, updates, deletes, tests or lists runs of another user's model
- **THEN** the response is 404 and nothing changes

#### Scenario: Missing model
- **WHEN** a user requests a model id that does not exist
- **THEN** the response is 404 with the same shape as for a foreign model

### Requirement: Slots and bindings

A model SHALL declare slots, each with a key, a kind (`account`, `category` or `group`), a label and a required flag. The model SHALL bind slots to records. A binding SHALL reference a non-archived record of the slot's kind that belongs to the model owner.

#### Scenario: Bind own record
- **WHEN** the owner binds an `account` slot to one of their active accounts
- **THEN** the binding is saved

#### Scenario: Bind a foreign or archived record
- **WHEN** the owner binds a slot to another user's record, to an archived record, or to a record of the wrong kind
- **THEN** the request is rejected and the binding is not saved

### Requirement: Activation rule

A new model SHALL be inactive. A model SHALL become active only when its code is valid and every required slot is bound to an eligible record. Otherwise the activation request SHALL fail with 400 listing the unbound slots. Changing slots or bindings of an active model SHALL re-apply the same check.

#### Scenario: New model is inactive
- **WHEN** a user creates a model
- **THEN** it is inactive

#### Scenario: Activation with unbound required slots
- **WHEN** the owner activates a model with required slots `card` and `general` where `general` is unbound
- **THEN** the response is 400, the error lists `general`, and the model stays inactive

#### Scenario: Activation succeeds
- **WHEN** the code is valid and all required slots are bound
- **THEN** the model becomes active

#### Scenario: Unbinding on an active model
- **WHEN** the owner removes the binding of a required slot on an active model
- **THEN** the request is rejected with 400 listing the slot

### Requirement: Code validation

The system SHALL validate model code on save and through a validate endpoint that returns a list of errors, each with line, column and message. Code SHALL be rejected when it contains: imports, class definitions, global or nonlocal statements, with statements, async constructs, await, yield or generator expressions, decorators, or match statements; any name or attribute starting with an underscore; attributes used for frame traversal or string-format traversal (names starting with `gi_`, `cr_`, `ag_`, `f_`, `tb_` or `co_`, and `format`, `format_map`, `mro`); or more than 20,000 characters. A save with invalid code SHALL fail with 400 and the line errors.

#### Scenario: Validate endpoint
- **WHEN** the user submits code to the validate endpoint
- **THEN** the response lists each error with line, column and message, or an empty list for valid code

#### Scenario: Import is rejected
- **WHEN** code contains `import os`
- **THEN** validation reports an error at that line and column

#### Scenario: Attribute traversal is rejected
- **WHEN** code contains `().__class__`
- **THEN** validation reports an error

#### Scenario: String format traversal is rejected
- **WHEN** code contains `"{0.__class__}".format(x)`
- **THEN** validation reports an error

#### Scenario: Oversized code
- **WHEN** code is longer than 20,000 characters
- **THEN** validation reports an error and save fails with 400

### Requirement: Script contract

A script SHALL define `process(text, ctx)`. `ctx` SHALL provide the server receive time as an ISO-8601 UTC string and the model's settings as string values. The script SHALL be able to use these helpers:

| Helper | Result |
|---|---|
| `expense(amount, name, account, category, group, date, currency, notes)` | an expense proposal |
| `income(...)` | an income proposal, same arguments as `expense` |
| `transfer(amount, name, account, to_account, date, currency, destination_amount, notes)` | a transfer proposal |
| `skip(reason)` | a deliberate skip, reason up to 200 characters |
| `amount(s, decimal, thousands)` | a normalized decimal string; raises `ValueError` when none is found |
| `normalize(s)` | lowercase, accents removed, whitespace collapsed |
| `parse_date(s, fmt)` | an ISO date or date-time string |
| `Decimal` | decimal numbers |
| `re` | a limited set of regular-expression functions |

Amounts SHALL be decimal strings. Account, category and group arguments SHALL be slot keys. The script SHALL never see record ids or credentials. Returning nothing SHALL be a skip with reason `no result`. An uncaught exception SHALL be a failure carrying the exception type, message and line. Any other return value SHALL be a failure with `invalid result`.

#### Scenario: Plata purchase
- **WHEN** the Plata example script from the design processes `Compraste $1,234.50 MXN en OXXO con tu tarjeta terminación 1234`, with slot `card` bound to the user's account and `general` to their category
- **THEN** the outcome is an expense proposal with amount `"1234.50"`, currency MXN, name `OXXO`, and the bound account and category

#### Scenario: Promotion is skipped
- **WHEN** the same script processes `¡Aprovecha 10% de cashback!`
- **THEN** the outcome is a skip with reason `promotion`

#### Scenario: Float amount
- **WHEN** a script returns a proposal whose amount is a number instead of a string
- **THEN** the outcome is a failure with `invalid result`

#### Scenario: No result
- **WHEN** the function returns nothing
- **THEN** the outcome is a skip with reason `no result`

#### Scenario: Uncaught exception
- **WHEN** a script calls `amount()` on text containing no number
- **THEN** the outcome is a failure showing `ValueError`, its message and the line number

#### Scenario: Slot keys, not ids
- **WHEN** a script inspects its inputs
- **THEN** no record id or credential is available to it

### Requirement: Sandbox guarantees

Scripts SHALL run in an isolated sandbox process, separate from the API, that is created fresh for every execution and ends with it. The script SHALL have no access to the filesystem, the environment, the process, other users' data, or any network API. Each execution SHALL be limited to 2 seconds of script time, 256 MB of memory, 4,000 characters of input text, 64 KB of output and 4 KB of captured printed output. Exceeding a limit SHALL end the execution and produce a failure with reason `timeout` or `resource_limit`. A pathological regular expression or runaway loop SHALL NOT stall the API.

#### Scenario: Infinite loop
- **WHEN** a script loops forever
- **THEN** the execution is ended after the time limit, the outcome is a failure with `timeout`, and other API requests stay responsive

#### Scenario: Catastrophic regular expression
- **WHEN** a script runs a backtracking-prone pattern on long input
- **THEN** the outcome is a failure with `timeout` and the API stays responsive

#### Scenario: Memory exhaustion
- **WHEN** a script builds a huge string or list
- **THEN** the outcome is a failure with `resource_limit`

#### Scenario: No state between runs
- **WHEN** one execution sets a value and a later execution reads it
- **THEN** the later execution does not see the value

#### Scenario: Oversized input
- **WHEN** a test or run is requested with more than 4,000 characters of text
- **THEN** it is rejected before any script runs

### Requirement: Side-effect-free test

`POST /notification-models/:id/test` SHALL run unsaved draft code and settings against the model's bindings and return the outcome (`proposal`, `skip` or `error`), the proposal, a transaction preview with slot keys resolved to record names, the skip reason or error with its line, and the captured printed output. It SHALL NOT create a transaction or a run. The test SHALL run outside the notification queue under a fixed playground cap of 2 concurrent tests per process and 1 per user; when the cap is reached the response SHALL be 503.

#### Scenario: Test unsaved draft
- **WHEN** the owner tests text with draft code that differs from the saved code
- **THEN** the draft code is executed and the saved model is unchanged

#### Scenario: Preview with names
- **WHEN** a test produces a proposal
- **THEN** the response includes a transaction preview naming the bound account and category

#### Scenario: Nothing is created
- **WHEN** a test completes in any outcome
- **THEN** no transaction and no run exist as a result

#### Scenario: Error with line
- **WHEN** the draft raises an exception
- **THEN** the response has outcome `error` with the message, line and any printed output

#### Scenario: No capacity
- **WHEN** the playground cap is reached
- **THEN** the response is 503

#### Scenario: Foreign model
- **WHEN** a user tests another user's model
- **THEN** the response is 404
