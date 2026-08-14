# Code style

Standing rule — applies to every file in the monorepo. Full prose version and before/after examples live in root `CLAUDE.md`'s "Comment standard" and "File-role structure" sections; this is the condensed, always-loaded checklist.

## Comment standard

- Every exported function, class, type, interface, component, and hook gets a `/** ... */` TSDoc block: what it does (if not obvious from the name), parameters/return value (if not obvious from names/types), and any non-obvious behavior/edge case/invariant a caller needs.
- An inline `//` is only for a genuinely non-obvious **why** — a hidden constraint, a workaround, a subtle invariant. If removing the comment wouldn't confuse a future reader, don't write it.
- Private/unexported helpers don't need TSDoc, but any `//` on one still has to clear the same "non-obvious why" bar.

**Never write:**
- A comment narrating a fix, a session, or a past state of the code (`// fixed this bug`, `// this now correctly handles...`, `// regression test for #123`).
- A comment restating the next line (`// increment count` above `count++`).
- A `no-op: ...` explanation on an empty callback — document the behavior once at the thing that owns it, not at every call site.
- A comment re-explaining something already documented at a higher level.

## File-role structure

A file's role is fixed by its location — never define a type, service function, client call, controller handler, or test inline in a file of a different role:

| Role | Location |
|---|---|
| Types | `types.ts` or a `types/` folder |
| Services | `services/*.service.ts` |
| API clients (web) | `services/*.client.ts` |
| Controllers (api) | `controllers/*.controller.ts` |
| Tests | sibling `tests/` folder, matching base name |

See `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` for the full per-app folder structure this maps to.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files | `camelCase.ts` | `transactions.routes.ts` |
| Routes file | `<module>.routes.ts` | `accounts.routes.ts` |
| Service file | `<role>.service.ts` | `read.service.ts` |
| Test file | `<subject>.test.ts` in `tests/` | `create.service.test.ts` |
| Prisma models | `PascalCase` | `TransactionRelation` |
| Env vars | `SCREAMING_SNAKE_CASE` | `SYNCFY_AUTO_SYNC_ENABLED` |
| API routes | `kebab-case` | `/shared-expenses` |
| React components | `PascalCase.tsx` | `AppLayout.tsx` |
| Custom hooks | `useCamelCase.ts` | `useAuth.ts` |

## Linting

- `eslint.config.js` is flat config: `@eslint/js` + `typescript-eslint` recommended, `eslint-plugin-react-hooks` (apps/web only) for hook dependency-array correctness, `eslint-config-prettier` last to defer formatting to Prettier.
- Formatting is Prettier-owned (`.prettierrc`) — don't hand-format against ESLint style rules that Prettier already disables.
- `@typescript-eslint/no-unused-vars` allows a `^_` prefix to intentionally ignore an arg/var/caught error.
