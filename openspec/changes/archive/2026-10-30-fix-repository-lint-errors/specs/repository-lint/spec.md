## Purpose

Keep repo-wide linting a trustworthy pass/fail gate for contributors and agents.

## ADDED Requirements

### Requirement: Repository lint passes
`npm run lint` from the repository root SHALL exit 0 with zero errors and zero warnings.

#### Scenario: Clean run
- **WHEN** `npm run lint` is run on the branch
- **THEN** it exits 0 and reports no problems

#### Scenario: A new warning appears
- **WHEN** a change introduces any lint warning
- **THEN** `npm run lint` exits non-zero

### Requirement: Lint scope is source, not local artifacts
ESLint SHALL NOT lint local agent worktrees under `.claude/worktrees/` or the vendored skill tooling under `.agents/skills/` and `.claude/skills/`.

#### Scenario: Worktrees present
- **WHEN** `.claude/worktrees/` contains repository copies
- **THEN** their files do not affect lint results

### Requirement: No suppression to reach green
The fix SHALL NOT add blanket rule disables, new `eslint-disable` comments, `any` types, or `--quiet`/error-level downgrades, and SHALL NOT change runtime behaviour.

#### Scenario: Diff review
- **WHEN** the change diff is reviewed
- **THEN** no `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or new `any` was added, and typecheck and all workspace tests pass
