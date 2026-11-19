# FlowLedger Short-Term Roadmap — Odoo migration ledger

The Odoo project #56 ("Flowledger") is the source of truth for all pending development work. This file is only the temporary ledger for the migration of the former short-term roadmap, and is deleted once every item below has a decision and has been processed. The full original roadmap is in Git history (last full version: commit `9166fba`).

**Reconciled on 2026-11-18 (removed from this file):**

- New Odoo Backlog tasks: ST-018 (B-012) → task #144 (Binance read-only account sync), ST-019 (B-013) → task #145 (on-chain wallet sync). Their research notes (Binance reachability, `listenKey`, wallet libraries, RPC vs indexer, secret encryption) are in the task descriptions.
- Already in Odoo: ST-001 → #129, ST-002 → #128, ST-003 → #127 (all Done), ST-009 → #130 (Backlog).
- Implemented (archived OpenSpec change under `openspec/changes/archive/`): ST-004 to ST-008, ST-010, ST-011, ST-013 to ST-017, ST-023 to ST-032, and their batches B-001, B-002, B-004, B-006 to B-010, S-001 to S-007.
- Historical: ST-012 (retired), ST-021 and ST-022 (superseded), B-003, B-005, B-011 (retired), and the batch plan, completion rules and resolved open questions of completed intents.
- Still tracked in `docs/KNOWN_ISSUES.md` (migrates in a later pass): owner security follow-ups #046, Twelve Data licensing #062, custom-asset gaps #060, investment returns and cost basis #056, holding network identity #054.

Edit `USER_DECISION` below (`DELETE`, `CREATE`, `MERGE_INTO_ODOO_TASK`, `REDEFINE` or `PENDING`). Nothing here is processed while its decision is `PENDING`.

---

### MIGRATION REVIEW — ST-020: User-configured external sync

**Status:** REVIEW_REQUIRED

**Reason:** UNCLEAR_SCOPE

**Original intent:**

> **Objective:** Advanced users can have FlowLedger pull quantities or prices from an external API they configure.
>
> **Scope:** Outbound, FlowLedger-initiated sync from a user-configured endpoint into holdings. These are not inbound callbacks. Before starting, confirm the need remains after ST-016 to ST-019, since this is the riskiest intent and may turn out to be unnecessary.
>
> **Acceptance criteria:**
> - A user can configure, test, and remove an external source for a holding, with credentials stored securely.
> - Requests to private, loopback, link-local, and metadata addresses are refused, including through DNS rebinding and redirects.
> - Timeouts and response-size limits are enforced, and failures leave the last value in place with a visible status.
> - The user can see what kind of data each source updates, and manual overrides still win.
>
> **Dependencies:** ST-015, and ST-018 for credential storage.
>
> **Relevant existing architecture:** There are no worker, queue, or persistent-connection facilities. The only background facility is an in-process `setInterval`. Outbound `fetch` calls today go only to fixed hosts, so this would be FlowLedger's first user-controlled outbound request.
>
> **Open questions:**
> - Is REST polling enough, and is WebSocket support needed at all? WebSockets would add long-lived connections to a process that has none today.
> - How do users map an arbitrary response to a value, without building a transformation language?
>
> Batch B-014 (dependencies B-009, B-012): "Configurable outbound sources with SSRF protection, if the go/no-go check confirms the need." Testing: blocked private and metadata addresses, DNS rebinding, redirects, timeouts, and size limits. Done when a user can configure and test a source, with every request protected. It may be dropped at its go/no-go check; if it goes ahead, discovery should re-evaluate splitting it.
>
> SSRF research: [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): HTTPS only, validate all resolved addresses, pin the validated IP, disable or re-validate redirects, and limit time and response size.

**Related Odoo tasks:** #144 (supplies the credential storage this reuses), #145

**Analysis:** The roadmap itself made this conditional: it exists only if a need remains after #144 and #145, it is the riskiest intent (first user-controlled outbound request, SSRF), and it may be dropped. Creating it now as an unconditional backlog task would overstate a commitment; dropping it would lose the SSRF design notes.

**Recommended decision:** CREATE (as a Backlog task whose first acceptance criterion is the go/no-go check after #144 and #145, depending on #144)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — ST-008 deferred metric: Emergency fund coverage

**Status:** REVIEW_REQUIRED

**Reason:** UNCLEAR_SCOPE

**Original intent:**

> | Metric | User value | Required inputs and availability | Complexity | Main correctness risk | Prerequisites, migration, configuration | Related intents | Disposition |
> |---|---|---|---|---|---|---|---|
> | Emergency fund coverage | High | No marker for liquid accounts, a designated fund, or essential expenses | Medium | Treating all balances as emergency savings and all spending as essential | Needs account designation and essential-expense classification, with migration and user configuration | No current intent provides this | **Include later** |
>
> None of the deferred metrics gets its own intent yet. Each one needs new data and a product decision first, and should become an intent only when that need is confirmed. Emergency fund coverage and fixed vs variable expenses wait for a confirmed need for the classification they share.

**Related Odoo tasks:** None

**Analysis:** Marked "include later" but explicitly not an intent until the need is confirmed. It needs a new liquid-account designation and an essential-expense classification, so it is a product decision, not a ready task.

**Recommended decision:** DELETE (the record stays in Git history; re-file in Odoo when the need is confirmed)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — ST-008 deferred metric: Fixed vs variable expenses

**Status:** REVIEW_REQUIRED

**Reason:** UNCLEAR_SCOPE

**Original intent:**

> | Metric | User value | Required inputs and availability | Complexity | Main correctness risk | Prerequisites, migration, configuration | Related intents | Disposition |
> |---|---|---|---|---|---|---|---|
> | Fixed vs variable expenses | Medium | No recurring or fixed marker on categories or transactions | Medium | One category can mix both kinds | Needs a user-controlled classification, with migration and configuration | Could share a classification with emergency fund coverage | **Include later** |

**Related Odoo tasks:** None. `ROADMAP.md` lists "Recurring transaction detection", which may overlap and is reconciled when that file migrates.

**Analysis:** Same status as emergency fund coverage: no intent until the need and the classification are decided.

**Recommended decision:** DELETE (re-evaluate together with `ROADMAP.md` recurring-transaction detection)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Pre-production data policy and engineering principles

**Status:** REVIEW_REQUIRED

**Reason:** OTHER

**Original intent:**

> ## Engineering principles
>
> - **Minimal implementation:** build the smallest maintainable thing that meets the requirement, with no speculative abstractions or dependencies.
> - **Reuse before abstraction:** extract shared code only when a real second consumer exists.
> - **Incremental delivery:** every intent is independently understandable, implementable, and verifiable.
> - **Architecture consistency:** follow `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, and `docs/TESTING.md`.
> - **Security and data correctness:** enforce user isolation, keep secrets and payloads out of logs, and never request wallet keys or bank credentials. Say so when a financial figure is partial or stale.
> - **Efficient AI-agent orchestration:** Opus orchestrates, Sonnet investigates, and atomic work goes to Codex through `/codex:rescue` when that saves effort. `/ponytail:ponytail` challenges complexity.
>
> ## Pre-production data policy
>
> FlowLedger is in early testing with a small group of trusted users, so clean, correct financial models take priority over compatibility with test records created under incorrect behavior.
>
> - No complicated migration, backfill, or legacy compatibility layer is added merely to preserve incorrect test financial records.
> - A clean reset of affected test financial data is an acceptable strategy for a breaking financial-model change.
> - The relevant OpenSpec proposal documents any reset: affected tables, dependencies, and intended scope.
> - A reset uses the smallest safe scope that leaves a coherent dataset; it does not assume all records must go.
> - User accounts, authentication, credentials, configuration, and unrelated data are preserved unless separately authorized.
> - **A destructive reset never runs automatically. The exact operation requires the product owner's explicit approval before execution.**

**Related Odoo tasks:** None (not backlog work)

**Analysis:** These are standing rules, not pending work, so they do not belong in Odoo. The data policy exists nowhere else in the repo (archived OpenSpec changes cite it by name), so deleting this file would lose it. The principles are mostly covered by `CLAUDE.md` and `.claude/rules/`.

**Recommended decision:** REDEFINE (move the data policy into `database/CLAUDE.md` as standing policy; drop the principles already covered by `CLAUDE.md`)

**USER_DECISION:** PENDING

**USER_NOTES:**

---
