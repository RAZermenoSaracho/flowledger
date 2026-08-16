---
description: Review the current diff against FlowLedger's specific conventions and constraints
---

Review the pending changes (`git diff` against the merge base with `main`, plus any staged/unstaged changes) against FlowLedger's own conventions — this is narrower and more repo-specific than a generic code review. Check every changed file for:

**Ownership & security (root CLAUDE.md constraints)**
- Every Prisma query touching user data scopes by `userId` in the `where` clause, not a load-then-check in JS.
- No `passwordHash`, OAuth secret, provider API key, or webhook signature key appears in a response, log line, or error message.
- The Syncfy webhook HMAC check (`accounts/providers/syncfy/syncfy.webhookSecurity.ts`) is untouched or, if touched, still enforced.
- No bank login credential (username, password, OTP, card number) is being stored anywhere.
- No `.env` file was modified; new env vars are documented in `.env.example` and added to the Zod schema in `apps/api/src/config/env.ts`.

**File-role structure & comment standard**
- Every changed file's content matches its location's role (see `.claude/rules/code-style.md`) — no type/service/client/controller/test defined inline in the wrong kind of file.
- Every new/changed exported function, class, type, interface, component, or hook has a TSDoc block that explains current behavior — not a comment narrating what changed.
- No comment violates the "never write" list in `.claude/rules/code-style.md` (fix narration, restating the next line, no-op explanations, re-explaining something documented elsewhere).

**Testing**
- Every new/changed `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` file has a matching test under its `tests/` folder, same base name.
- The test uses the right mocking layer for its kind (see `.claude/rules/testing.md`) — service unit tests never hit a real DB, web component tests go through `msw`, not a mocked `.client.ts`.

**Module-specific conventions**
- `apps/api` changes: `asyncHandler()` wraps every controller, `serialize()` is called before `res.json()`, no inline Zod schema in a routes file, no `process.env.*` read directly.
- `apps/web` changes: no direct `fetch`/`apiRequest` outside `services/*.client.ts`, no filtering/sorting/grouping logic added client-side that belongs in `read.service.ts`, no inline `style` prop.

Report findings grouped by severity (blocking vs. worth fixing vs. nit). For each finding, cite the file/line and which rule it violates. Do not silently fix anything — report first.
