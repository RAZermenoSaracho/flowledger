# Design

## Evidence (host, 2026-11-26)

| Check | Result |
|---|---|
| Crash reports | 28 `node-*.ips` (3 on 11-18, 10 on 11-23, 15 on 11-26), all `EXC_BAD_ACCESS`. Faulting frames sit in V8 marking and scavenging (`ConcurrentMarking::RunMajor`, `Scavenger::Process`, `ScavengePage`, `SizeFromMap`, string-table clearing), plus one in `SourceTextModule::Evaluate`. |
| Fault kind | 27 of 28 are `KERN_INVALID_ADDRESS`, most at 256 KB page-aligned addresses (`...0000`, `...80000`): V8 touches a heap page that is not mapped. One is `KERN_PROTECTION_FAILURE`. |
| Clustering | Bursts at 11-18 19:11-19:14, 11-23 08:35-08:40 and 11-26 15:29-15:37 (the #179 verification work), each with many concurrent Node processes. Not every burst coincides with a deploy. |
| Kernel panics | Two in `/Library/Logs/DiagnosticReports`: 2026-11-18 07:01 and 2026-11-22 21:18, both `Possible memory corruption: pmap_pv_remove ...`, panicking unrelated processes (a Chrome renderer and Claude). Kernel page-table bookkeeping was corrupted on this host. |
| Memory | 16 GiB soldered DDR3, non-ECC, status OK. Swap 588 MB of 2 GB used and 81% free system-wide when sampled. Two `VBoxHeadless` processes at about 3.9 GB RSS each although both guests are configured with 2048 MB. Pressure at crash time is not proven. |
| Node support | Node 24 x64 requires macOS >= 13.5 (v24.x `BUILDING.md`); Node 22 x64 requires macOS >= 11 (v22.x). `MacBookPro11,4` cannot run anything newer than macOS 12.7.x. |
| Bounded reproduction | Worktree, normal host load, VMs running. `npm run build -w packages/shared`: Node 24.15.0 2 segfaults (exit 139) in 30 runs, Node 22.23.1 0 in 20. Full `npm run build`: Node 24 about 2 segfaults in 14 runs (6 of those counted before the Prisma client was generated) and 0 in 8 afterwards, Node 22 0 in 10. Totals: Node 24 about 4 of 52, Node 22 0 of 30. |
| Node 22 compatibility | `@types/node` is already `^22`. The notification sandbox test (`runScript.test.ts`, uses `--permission` and `--allow-fs-read`) passes 24/24 on 22.23.1. |

## Root cause assessment

- Proven: the crashes are memory-access faults in V8 garbage collection on an unsupported Node and OS pairing, and the host had two kernel memory-corruption panics.
- Inferred, not proven: the Node 24 binary on macOS 12 is the main trigger, because Node 22 showed no crash in 30 runs on the same host and load. A latent hardware or VirtualBox fault may also contribute (the panics) and would persist after the Node change.
- Not supported as primary cause: VM memory pressure. The faults are unmapped-address accesses, not OOM kills, and sampled free memory was high. Pressure may raise the crash rate and is not ruled out.

## Decisions

1. Move the repository to Node 22 LTS. It is the smallest change that removes the unsupported pairing. Rejected alternatives:
   - `--no-sparkplug` or other V8 flags on Node 24: our signatures are GC-wide, and the platform stays unsupported.
   - Upgrading macOS: not possible on this model.
   - Capping VM memory or serializing deploys against tests: speculative until Node 22 is measured, and it changes shared infrastructure. Revisit only if the acceptance runs fail.
   - An automatic build retry in the deploy script: hides crashes. Revisit only if Node 22 still fails.
2. Runway: Node 22 maintenance ends 2027-04-30. Before then the owner needs a host that can run a newer Node, or this decision is revisited.
3. The kernel panics are handled by owner diagnostics, not code.

## Infrastructure steps (separate owner approval required; none are done by this change)

| Step | Touches | Command or edit | Rollback |
|---|---|---|---|
| Host default Node | nvm default alias of the user running the runner and PM2 | `nvm alias default 22` | `nvm alias default 24` |
| Deploy script uses the repo pin | `~/scripts/deploy-flowledger-prod.sh`, before `npm ci` | source nvm, then `nvm use` in the checkout | revert the script edit |
| Restart onto Node 22 | PM2 apps `flowledger-prod-*` and `flowledger-dev-*` | next deploy runs `pm2 restart ... --update-env` | restore the default to 24 and redeploy |
| Hardware diagnostics | none | owner runs Apple Diagnostics (hold D at boot) and a memory test, and reviews the panics | none |

Before changing PM2 apps, confirm read-only which Node binary each app uses (`pm2 describe <app>`).

## Risks

- The production API runtime moves from Node 24 to 22. Mitigation: typecheck, lint and unit tests on 22 first, then staging before production.
- The panics may indicate failing hardware; Node 22 could hide, not cure, that. Task 4 records the owner's diagnostic result.
- The statistics are weak (0 of 30 versus about 4 of 52). Acceptance requires a larger run on the final configuration.
