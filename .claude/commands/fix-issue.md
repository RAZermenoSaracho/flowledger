---
description: Implement a described bug fix or feature following FlowLedger's conventions
argument-hint: <issue description or task>
---

Implement the following, on branch `razs_ai` (never `main`): $ARGUMENTS

Before writing any code:
1. Read root `CLAUDE.md` plus whichever of `apps/api/CLAUDE.md` / `apps/web/CLAUDE.md` / `database/CLAUDE.md` / `packages/shared/CLAUDE.md` applies to the area you're touching.
2. Check `docs/DATA_MODEL.md`, `docs/AUTH_FLOW.md`, `docs/PROVIDER_SYNC.md`, or `docs/DOMAIN_LOGIC.md` if the task touches that domain.
3. Locate the existing pattern for similar code (e.g. a sibling service/controller/component) and follow it rather than inventing a new shape.

While implementing:
- Follow `.claude/rules/code-style.md` (TSDoc, file-role structure) and, for backend work, `.claude/rules/api-conventions.md`.
- Validate all API input with a shared Zod schema from `packages/shared/src/schemas/` — add one there if it doesn't exist yet, don't inline it.
- Scope every data query by `userId`.
- Add or update the matching test per `.claude/rules/testing.md` / `docs/TESTING.md` for every changed `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` file.

Before considering the task done, run: `npm run typecheck`, `npm run lint`, `npm run test` (there is no CI gate to catch this later — see root CLAUDE.md's testing section). Fix anything they surface.

Report back what changed, file by file, and flag anything ambiguous in the task description that you had to make a judgment call on.
