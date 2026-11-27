## ADDED Requirements

### Requirement: Node major is pinned to a version the build host supports
The repository SHALL declare one Node major in `.nvmrc` and root `package.json` `engines`, and that major SHALL be one the deploy host's operating system officially supports.

#### Scenario: Pin matches the supported version
- **WHEN** `.nvmrc` and `engines.node` are read
- **THEN** both name Node 22 and `CLAUDE.md` names the same version

### Requirement: Builds and tests run clean on the pinned Node
Under the pinned Node on the deploy host, repeated builds and test runs SHALL finish without a Node process crash.

#### Scenario: Repeated builds
- **WHEN** `npm run build` runs 20 consecutive times on the host with the VMs running
- **THEN** every run exits 0 and no new `node-*.ips` report appears

#### Scenario: Repeated test runs
- **WHEN** the shared, web and API unit test suites run 5 consecutive times
- **THEN** every run exits 0 and no new `node-*.ips` report appears
