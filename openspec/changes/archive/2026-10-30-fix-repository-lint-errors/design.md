## Context

`eslint.config.js` is flat config, `js` + `typescript-eslint` recommended, react-hooks scoped to `apps/web`. Script: `"lint": "eslint ."`. See proposal for the measured baseline.

## Decisions

1. **Ignore `.claude/worktrees/**`** (same `ignores` edit as decision 2). Untracked, local-only duplicates of the repo; absent in a clean checkout, and they inflate counts 4x. Not source.
2. **Ignore vendored skill tooling, no `.cjs` override.** The 68 errors are all CommonJS complaints in 14 tracked `.cjs` scripts under `.agents/skills/**` and `.claude/skills/**` (duplicated third-party skill scripts we do not own or run in the product). Add `.agents/skills/**` and `.claude/skills/**` to the existing `ignores` array. Rejected: a `.cjs` override with Node globals and `no-require-imports` off, which is more config to maintain to lint code nobody edits.
3. **Source fixes, not suppression.**
   - Unused identifiers: delete them (8 sites).
   - `body: any`: use `z.infer` of the existing shared create/update schema for that resource (check callers first; controllers already validate with these schemas). If a shared schema does not exist for a body, stop and report rather than inventing `unknown`/`any`.
   - `testing-library/no-node-access` directive: the rule is not enabled, so delete the comment; the test line stays.
   - `exhaustive-deps`: `const x = data ?? []` creates a new array every render. Replace with `useMemo(() => data ?? [], [data])` or hoist a module-level `const EMPTY: readonly T[] = []`; behaviour identical.
4. **Warnings policy: zero.** Only 11 warnings, one pattern, so fix them and set `--max-warnings 0`, otherwise warnings silently rot back.
5. **Regression protection.** No PR CI exists and none is added here. The strict script plus CLAUDE.md's existing "run lint before done" rule, and closing #008, are the protection.

## Risks

- Typing `body` may expose real type mismatches at call sites; resolve by fixing types, not casting. Verified by `npm run typecheck`.
