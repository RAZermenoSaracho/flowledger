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

## Infrastructure runbook (separate owner approval required; none of it is done by the repository change)

Read-only findings (`pm2 jlist`, 2026-11-27): all six apps run in `fork_mode` with `script` = `~/.nvm/versions/node/v24.15.0/bin/npm` and `interpreter` = `~/.nvm/versions/node/v24.15.0/bin/node`. The app's saved `PATH` also contains the v24 `bin`, so the `node` that `npm run start` spawns is v24 too. The nvm default alias therefore does not move these apps, and `pm2 restart --update-env` cannot change the interpreter. Each app must be deleted and started again with the Node 22 paths. Settings to preserve: `kill_timeout` 15000 on both workers, `exp_backoff_restart_delay` 1000 on `flowledger-prod-worker` only (the deploy script's start command), everything else default. The apps read their configuration through `dotenv` in the checkout (`apps/api/src/config/env.ts`), so a fresh `pm2 start` needs no exported variables. `flowledger-gateway` and `flowledger-landing` are out of scope.

Common shell prelude for every step below (interactive shell of the PM2 owner; it does not change the nvm default):

```bash
source ~/.nvm/nvm.sh && nvm use 22
export NODE22="$(dirname "$(nvm which 22)")"; export NODE22_BIN="$NODE22/node" NPM22_BIN="$NODE22/npm"
"$NODE22_BIN" -v   # expect v22.x
```

### (a) Staging: flowledger-dev-api, -worker, -web

Order: staging first, verify, then production. Run the prelude, then:

```bash
cd /Users/razs/projects/flowledger/apps/api
pm2 delete flowledger-dev-api    && pm2 start "$NPM22_BIN" --name flowledger-dev-api    --interpreter "$NODE22_BIN" -- run start
pm2 delete flowledger-dev-worker && pm2 start "$NPM22_BIN" --name flowledger-dev-worker --interpreter "$NODE22_BIN" --kill-timeout 15000 -- run start:worker
cd /Users/razs/projects/flowledger
pm2 delete flowledger-dev-web    && pm2 start "$NPM22_BIN" --name flowledger-dev-web    --interpreter "$NODE22_BIN" -- run start:web
```

Verify (read-only): `pm2 jlist | node -e 'for(const p of JSON.parse(require("fs").readFileSync(0)))if(/flowledger-dev-/.test(p.name))console.log(p.name,p.pm2_env.status,p.pm2_env.exec_interpreter,p.pm2_env.node_version)'` shows `online`, a v22 interpreter and `22.x`; `curl -fsS http://127.0.0.1:4001/health` and `curl -fsI http://127.0.0.1:5174/` succeed (adjust the health path to the real route); run the staging smoke checks from the owner's acceptance list.

Rollback (a): rerun the three commands with `NODE24=~/.nvm/versions/node/v24.15.0/bin`, substituting `$NODE24/npm` and `$NODE24/node` for `$NPM22_BIN` and `$NODE22_BIN`, after `nvm use 24` in the same shell so the saved `PATH` is v24 again.

### (b) Production: flowledger-prod-api, -worker, -web

Only after staging has run clean on Node 22 and the owner gives the production gate. Run the prelude, then:

```bash
cd ~/production/flowledger/apps/api
pm2 delete flowledger-prod-api    && pm2 start "$NPM22_BIN" --name flowledger-prod-api    --interpreter "$NODE22_BIN" -- start
pm2 delete flowledger-prod-worker && pm2 start "$NPM22_BIN" --name flowledger-prod-worker --interpreter "$NODE22_BIN" --kill-timeout 15000 --exp-backoff-restart-delay 1000 -- run start:worker
cd ~/production/flowledger/apps/web
pm2 delete flowledger-prod-web    && pm2 start "$NPM22_BIN" --name flowledger-prod-web    --interpreter "$NODE22_BIN" -- run preview -- --host 127.0.0.1 --port 5173
```

Verify as in (a) with the `flowledger-prod-` filter and ports 4000 and 5173. Each `delete` plus `start` is a short outage for that app; run one app at a time and confirm `online` before the next.

Rollback (b): same three commands with the v24 binaries (see (a) rollback), then `pm2 save` (step d).

### (c) Deploy script: `~/scripts/deploy-flowledger-prod.sh`

Chosen: source nvm and use the repository pin, placed after `git pull origin main` and before `npm ci`. It beats a hard-coded binary path because it follows `.nvmrc` (patch updates need no script edit), and it works in the self-hosted runner's non-interactive shell because it does not rely on the login profile: nvm is sourced explicitly. A missing Node 22 makes `nvm use` fail and `set -e` aborts the deploy before anything changes.

```bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use          # reads .nvmrc (22) from ~/production/flowledger; fails the deploy if not installed
node -v
npm ci
```

The same shell then runs `prisma`, `npm run build`, and the `pm2 restart ... --update-env` lines. Those restarts keep each app's pinned interpreter, so the apps stay on whatever step (b) set; `--update-env` refreshes the saved `PATH` to Node 22. For the one fallback branch that does `pm2 start npm ... flowledger-prod-worker`, add `--interpreter "$(nvm which 22)"`. Dry run before the first real deploy: `bash -c 'source ~/.nvm/nvm.sh && cd ~/production/flowledger && nvm use && node -v'` from a non-login shell.

As deployed: `pm2` is a global package installed only under Node 24, so after `nvm use` the script no longer finds it on `PATH`; the first deploy failed with exit code 127 at `pm2 restart`, after the build. The script captures `PM2_BIN="$(command -v pm2)"` before `nvm use` and calls it through a `pm2` shell function. The step (b) commands must run with the Node 22 `bin` first on `PATH` (the prelude's `nvm use 22`); otherwise the `node` that npm spawns is still v24.

Rollback (c): restore the previous script (`cp` the backup taken before editing, e.g. `~/scripts/deploy-flowledger-prod.sh.bak-193`) or delete the four added lines.

### (d) Persist

After (a) and (b) are verified, `pm2 save` so a reboot resurrects the Node 22 definitions. Rollback: after any rollback above, `pm2 save` again. Until saved, a reboot restores the old Node 24 definitions.

### (e) Rollback

Each step above carries its own rollback. The nvm default alias is not changed by any step. Reverting the repository pin is a revert of the #193 pull request plus a redeploy.

## Risks

- The production API runtime moves from Node 24 to 22. Mitigation: typecheck, lint and unit tests on 22 first, then staging before production.
- The panics may indicate failing hardware; Node 22 could hide, not cure, that. Task 4 records the owner's diagnostic result.
- The statistics are weak (0 of 30 versus about 4 of 52). Acceptance requires a larger run on the final configuration.
