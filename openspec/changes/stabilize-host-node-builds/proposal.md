# Proposal

## Why

Node processes on the self-hosted deploy and staging host (MacBookPro11,4, macOS 12.7.6) intermittently segfault: 28 `node-*.ips` reports since 2026-11-18, two production deploys that passed only on a rerun (runs 45311609817 and 45905593560), and vitest workers dying under load. FlowLedger pins Node 24, but Node 24 officially requires macOS 13.5 or newer for x64 (`BUILDING.md`, v24.x). This Mac cannot be upgraded past macOS 12.7.x, so the host runs an unsupported Node and OS combination.

Evidence collected on 2026-11-26 (details in `design.md`):

- All 28 reports are `EXC_BAD_ACCESS` inside V8, almost all in garbage collection, with an unmapped faulting address that is usually 256 KB page aligned.
- In the same bounded loop on this host, Node 24.15.0 segfaulted in about 4 of 52 build runs and Node 22.23.1 in 0 of 30. The difference is suggestive but not statistically conclusive.
- Two kernel panics (`pmap_pv_remove ... Possible memory corruption`, 2026-11-18 and 2026-11-22) hit unrelated processes. The host has a memory-integrity problem independent of Node.

## What Changes

- Pin the repository to Node 22 LTS: `.nvmrc`, root `engines`, and the Node version references in `CLAUDE.md`.
- After the owner approves, make the deploy script and the host default Node 22 (outside the repo; see `design.md`, "Infrastructure steps").
- Owner-run hardware diagnostics for the two kernel panics (no repo change).
- No change to application code, VM settings, or retry policy unless the acceptance runs still fail on Node 22.

## Capabilities

### New Capabilities
- `node-runtime`: the Node major version the repository, deploys and verification runs use, and the crash-free build and test requirement on the host.

### Modified Capabilities

## Impact

- `.nvmrc`, root `package.json` (`engines`), `CLAUDE.md`, and any README or docs that name Node 24.
- The production runtime changes with the host default Node (API, worker and web restart under the deploy shell's Node). That is an infrastructure change and needs separate owner approval.
- Overlap with task #196: this change does not touch `apps/api` vitest or testcontainers configuration, the Docker VM, or the Docker integration tests.
