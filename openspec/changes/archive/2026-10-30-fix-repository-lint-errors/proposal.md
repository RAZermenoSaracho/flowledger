## Why

`npm run lint` (`eslint .`) cannot be used as a pass/fail gate: it exits 1. `add-personal-api-keys` and `add-mcp-oauth` both have task 6.2 ("`npm run lint` passes") open and cannot be archived until the repository lints clean. KNOWN_ISSUES #008 logged this as "81 errors, 11 warnings"; a fresh run confirms those numbers for tracked code, and shows 336 more errors from local-only agent worktrees.

## Baseline (measured, full audit in the session scratchpad `lint-audit.md`)

Raw `eslint .`: **417 errors, 11 warnings** in 143 files.

| Bucket | Errors | Warnings |
|---|---|---|
| `.claude/worktrees/**` (git-excluded local checkouts, 4 copies of the repo) | 336 | 0 |
| `.agents/skills/**` and `.claude/skills/**` (tracked `.cjs` tooling, 6 files each) | 68 | 0 |
| `apps/api` | 9 | 0 |
| `apps/web` | 4 | 11 |

Excluding worktrees this is exactly 81 errors / 11 warnings (matches #008). 68 of 81 errors are configuration problems; 13 errors and 11 warnings are source.

Root causes:
- ESLint does not honour `.gitignore`/`.git/info/exclude`, so it lints nested worktree copies of the repo.
- `.cjs` scripts use `require`/`module`/`__dirname`, but the config has no Node globals for them (`no-undef`, `no-require-imports`).
- Unused imports/vars in tests and one type file (`no-unused-vars`, 8).
- `body: any` in four accounts/transactions services (`no-explicit-any`, 4).
- One `eslint-disable` directive naming a plugin that is not installed (`testing-library/no-node-access`, 1).
- `x = query.data ?? []` used as a `useMemo` dependency in six web pages (`exhaustive-deps` warnings, 11).

## What Changes

- ESLint config: add `.claude/worktrees/**`, `.agents/skills/**` and `.claude/skills/**` to `ignores`. No rule changes, no override.
- Source: remove unused identifiers, type the four `any` params from the shared Zod schemas, delete the dead eslint-disable directive, stabilise the eleven `?? []` dependencies.
- Make zero warnings the standard: `lint` script becomes `eslint . --max-warnings 0`.
- Mark KNOWN_ISSUES #008 resolved.
- No runtime behaviour change; no new CI, no new dependencies.

## Capabilities

### New Capabilities
- `repository-lint`: the repository lints clean and stays a usable gate.

### Modified Capabilities
None.

## Impact

`eslint.config.js`, `package.json` (script), 4 API service files, 3 API test/type files, ~8 web files, `docs/KNOWN_ISSUES.md`. Unblocks archiving `add-personal-api-keys` and `add-mcp-oauth`. There is no PR CI today (see CLAUDE.md); protection is the documented definition-of-done plus the strict script.
