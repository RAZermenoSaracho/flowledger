## 1. Docker test host (outside the repo, `~/scripts/docker-test-vm`; owner approval required before touching the running VM)

- [ ] 1.1 Write `sweep-testcontainers.sh` implementing the selection rule in `design.md`: list by default, `--apply` runs `docker rm -f -v` on selected ids and logs each removal; no prune commands.
- [ ] 1.2 Write `testcontainers-sweep.service` (oneshot, runs the script with `--apply`) and `testcontainers-sweep.timer` (`OnCalendar=hourly`, `Persistent=true`).
- [ ] 1.3 Add a separate Vagrant provisioner named `sweep` that installs the three files and enables the timer. Do not modify the existing inline provisioner (it restarts dockerd).
- [ ] 1.4 Install on the running VM with `vagrant provision --provision-with sweep` only (no halt, no reload, no dockerd restart).

## 2. Documentation (repo)

- [ ] 2.1 In `docs/TESTING.md` (Vagrant VM section), document the sweep and its selection rule, the read-only listing command (Engine API `curl` for containers filtered by label `org.testcontainers=true`, plus `/volumes`), and that nothing in the repository removes containers.

## 3. Verification (record results in the Odoo tasks)

- [ ] 3.1 List mode on the VM with a labelled test container younger than 3 hours (live Ryuk), an unlabelled container, and a running Ryuk: the script selects none of them and removes nothing.
- [ ] 3.2 Create a labelled `sleep` container with no Ryuk and a lowered N (via script argument or environment variable) in a scratch run: list mode selects it, `--apply` removes it with its anonymous volume, and an unlabelled container created at the same time survives.
- [ ] 3.3 `systemctl list-timers` shows the timer active and the journal shows a clean run.
- [ ] 3.4 Run `npm run test -w apps/api` once against the VM: results and duration match a pre-change baseline taken the same way, and the VM then lists 0 testcontainers containers and 0 volumes.
- [ ] 3.5 SIGKILL one integration file's process tree after Postgres is up; within 2 minutes the VM lists 0 containers and 0 volumes.
