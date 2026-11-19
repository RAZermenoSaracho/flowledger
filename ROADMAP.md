# FlowLedger Roadmap — Odoo migration ledger

The Odoo project #56 ("Flowledger") is the source of truth for all pending development work. This file is only the temporary ledger for the migration of the former long-term roadmap, and is deleted once every item below has a decision and has been processed. The full original roadmap is in Git history (last full version: commit `c4d886f`).

**Reconciled on 2026-11-18 (removed from this file):**

- New Odoo Backlog tasks: Milestone 15 asset allocation reporting → #147; Milestone 17 monthly and category budgets with budget alerts → #148; Milestone 16 categorization rules → #149.
- Already in Odoo: Milestone 11 (Binance API integration) → #144; Milestone 12 (crypto wallet accounts) → #145 for on-chain wallets, with the per-token balances delivered by the B-009 `Holding` model instead of the proposed `crypto_balances` and `currencies` tables.
- Implemented: Milestones 4 to 10; Milestone 13 (accounts show native and preferred-currency balances, `currentBalanceInPreferredCurrency`); Milestone 15 investment accounts and portfolio tracking (B-009 holdings, B-010 securities); Milestone 16 duplicate detection (possible-duplicate hints in import review).
- Superseded: Milestone 14 ("exchange rates live only"). Transactions persist applied amounts and rates (ST-023), and holdings keep manual prices and cached quotes. The current rules are in `docs/DOMAIN_LOGIC.md`, and fiat rates come from Frankfurter, not Google.
- Still tracked in `docs/KNOWN_ISSUES.md` (migrates in a later pass): Milestone 15 performance reporting, as investment transactions with cost basis (#056, #060).
- Moved to permanent documentation: product vision, priorities, principles and success criteria → `README.md`. The provider-agnostic rule was already in `CLAUDE.md`; architecture, capabilities and Syncfy details were already in `CLAUDE.md`, `README.md` and `docs/`. The named example providers (Belvo, Plaid, MX, Open Banking) were illustrations, not committed work; adding a specific provider becomes an Odoo task when one is chosen.

Edit `USER_DECISION` below (`DELETE`, `CREATE`, `MERGE_INTO_ODOO_TASK`, `REDEFINE` or `PENDING`). Nothing here is processed while its decision is `PENDING`.

---

### MIGRATION REVIEW — Milestone 16: Automatic categorization and merchant recognition

**Status:** REVIEW_REQUIRED

**Reason:** PARTIAL_OVERLAP

**Original intent:**

> # Milestone 16 - Financial Automation
>
> Status: PLANNED
>
> Goals:
>
> - Automatic transaction categorization
> - Categorization rules
> - Recurring transaction detection
> - Merchant recognition
> - Duplicate detection

(This item covers "Automatic transaction categorization" and "Merchant recognition". The rules and duplicate detection are reconciled above, and recurring detection is the next item.)

**Related Odoo tasks:** #149 (user-defined categorization rules)

**Analysis:** With #149, rule-based categorization is covered. "Automatic" categorization beyond rules means learned or AI inference, which overlaps the AI assistant question below. Merchant recognition (normalizing noisy bank descriptions to a merchant) could improve rule matching, but its value isn't proven until rules exist.

**Recommended decision:** DELETE (revisit after #149 ships, if rules prove insufficient)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestone 16: Recurring transaction detection

**Status:** REVIEW_REQUIRED

**Reason:** UNCLEAR_SCOPE

**Original intent:**

> - Recurring transaction detection (Milestone 16 - Financial Automation, PLANNED)

**Related Odoo tasks:** None. Overlaps the "fixed vs variable expenses" metric, which you deleted in phase 1 with a note to reconsider it here.

**Analysis:** The goal names a technique but no user outcome. Possible outcomes are a subscriptions and bills list, upcoming-payment reminders, or a fixed/variable split in reports, and each is a different task. Detection from irregular bank descriptions is also heuristic.

**Recommended decision:** REDEFINE (name the outcome you want, e.g. "list of recurring charges with next expected date", then I create it)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestone 17: Savings goals

**Status:** REVIEW_REQUIRED

**Reason:** UNCLEAR_SCOPE

**Original intent:**

> # Milestone 17 - Budgeting
>
> Status: PLANNED
>
> Goals:
>
> - Monthly budgets
> - Category budgets
> - Savings goals
> - Budget alerts
> - Forecasting

(This item covers "Savings goals". Budgets and alerts are #148, and forecasting is the next item.)

**Related Odoo tasks:** #148

**Analysis:** Two different models are possible: a goal tracked against a designated account's balance, or a virtual allocation of money across goals. They differ in data model and net-worth implications, so this is a product decision.

**Recommended decision:** REDEFINE (choose the progress source, then I create it)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestones 17 and 18: Forecasting / cashflow forecasting

**Status:** REVIEW_REQUIRED

**Reason:** DUPLICATE_CANDIDATE

**Original intent:**

> - Forecasting (Milestone 17 - Budgeting, PLANNED)
> - Cashflow forecasting (Milestone 18 - AI Financial Assistant, PLANNED)

**Related Odoo tasks:** #148

**Analysis:** The two goals are the same intent listed twice. A useful forecast needs recurring-charge data (previous item) and, ideally, budgets (#148), so it depends on decisions not yet made.

**Recommended decision:** DELETE (re-file as one task once recurring detection and budgets exist)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestone 18: AI Financial Assistant

**Status:** REVIEW_REQUIRED

**Reason:** PRODUCT_MISALIGNMENT

**Original intent:**

> # Milestone 18 - AI Financial Assistant
>
> Status: PLANNED
>
> Goals:
>
> - Spending insights
> - Budget recommendations
> - Cashflow forecasting
> - Financial anomaly detection
> - Personalized financial recommendations
>
> AI features must operate on user-authorized financial data only.

**Related Odoo tasks:** None. Cashflow forecasting is handled in the previous item.

**Analysis:** FlowLedger already exposes user-authorized data to external AI assistants (Claude, Grok, Meta AI Muse) through its MCP server with OAuth, and those assistants already provide insights and recommendations. An in-app assistant would duplicate that and add LLM cost and data-processing obligations. The authorization rule is already covered by `CLAUDE.md` ownership enforcement.

**Recommended decision:** DELETE (the MCP integration is the AI direction; file specific MCP tools as Odoo tasks when needed)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestone 19: Mobile Applications

**Status:** REVIEW_REQUIRED

**Reason:** PRODUCT_MISALIGNMENT

**Original intent:**

> # Milestone 19 - Mobile Applications
>
> Status: PLANNED
>
> Goals:
>
> - iOS application
> - Android application
> - Shared API backend
> - Push notifications

**Related Odoo tasks:** None

**Analysis:** FlowLedger is web-first and already runs as an installed home-screen app on iOS, and the shared API backend exists. Native apps would be a large new codebase. Push notifications are the one goal with clear user value, and web push to the installed app could deliver it without native apps.

**Recommended decision:** REDEFINE (replace with a "web push notifications for the installed app" task; drop native apps)

**USER_DECISION:** PENDING

**USER_NOTES:**

---

### MIGRATION REVIEW — Milestone 20: SaaS Platform

**Status:** REVIEW_REQUIRED

**Reason:** PRODUCT_MISALIGNMENT

**Original intent:**

> # Milestone 20 - SaaS Platform
>
> Status: PLANNED
>
> Goals:
>
> - Subscription plans
> - Premium integrations
> - Premium reporting
> - AI subscription features
> - Multi-tier account management
>
> Only pursue monetization after the platform reaches maturity and reliability
> targets.

**Related Odoo tasks:** None. Twelve Data's "internal non-display" licensing (`docs/KNOWN_ISSUES.md` #062) and other free-tier provider terms constrain commercial use.

**Analysis:** The milestone gates itself on maturity that hasn't been reached. A Free / FlowLedger One plan switch already exists in Profile → Subscription, with no billing. Monetization needs product and licensing decisions before it can become tasks.

**Recommended decision:** DELETE (re-file as concrete tasks when monetization is approved)

**USER_DECISION:** PENDING

**USER_NOTES:**

---
