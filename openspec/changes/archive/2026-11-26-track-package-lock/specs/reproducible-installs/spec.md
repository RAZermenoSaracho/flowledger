## ADDED Requirements

### Requirement: Root lockfile is tracked
The repository SHALL track the root `package-lock.json` and SHALL NOT ignore it.

#### Scenario: Lockfile is versioned
- **WHEN** `git ls-files package-lock.json` runs on a fresh clone
- **THEN** it lists the file and `git check-ignore package-lock.json` reports nothing

### Requirement: Installs are reproducible
Deploys and verification SHALL install dependencies with `npm ci` at the repository root.

#### Scenario: Clean clone passes checks
- **WHEN** `npm ci` is run on a fresh clone followed by typecheck, lint and test
- **THEN** all pass and `package-lock.json` is unchanged
