## Context

`startTestDatabase()` starts one `postgres:16-alpine` container per integration/e2e file (44 files; vitest 4 forks, `maxWorkers: 2`). testcontainers 12.2.1 starts a Ryuk reaper (`testcontainers/ryuk:0.14.0`, Docker `AutoRemove=true`) and registers the run's session id (`org.testcontainers.session-id` label) over a TCP socket. When all sockets are closed for 10 s, Ryuk removes everything carrying the session label and exits. docker-test-vm (Vagrant + VirtualBox, 2 GB, 2 vCPU, `~/scripts/docker-test-vm/Vagrantfile`, not under git) has `LiveRestoreEnabled=false` and no other known workloads.

## Evidence

Proven by repro on the VM (one small file, `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` set):
- SIGKILL of the whole vitest tree after Postgres was up, SIGKILL as soon as Ryuk appeared, SIGKILL of only the top-level process, and a second run started while the first run's Ryuk was draining: in all four, containers, Ryuk and volumes were gone within about 15 s (0/0).
- A client connecting to a draining Ryuk is refused (`ECONNREFUSED`), not silently accepted (one probe).

Proven by reading testcontainers 12.2.1:
- If connecting to Ryuk fails (4 s retry budget) the container is never created, so a slow host cannot create an unprotected container through a Ryuk timeout; longer Ryuk timeouts would change nothing.
- After connecting, the client only logs a warning if the Ryuk socket closes; it never reconnects or recreates Ryuk.
- `stop()` defaults to `timeout: 0` (SIGKILL, exit 137) and `remove` is a separate second call, so an exited-137 container that was not removed means the process died between the two calls or the reaper was absent.

Ruled out: VM stop or daemon restart (VM up since Nov 23 14:20, no live-restore, and the same session had both exited and still-running containers); an orphan process holding the Ryuk socket (none alive now).

Not determined: why no reaper covered session 432aff99f51a. Leading hypothesis, inferred: Ryuk or its port proxy died mid-run under memory pressure on the 2 GB VM (`OOMKilled=false` with 137 is how a host-level OOM kill looks), `AutoRemove` removed Ryuk, the client never noticed. Confirming needs the VM kernel log (belongs to #193).

## Why the host, not the repo (preference order)

1. **Docker/test-infrastructure configuration on the VM: sufficient.** No dockerd option garbage-collects containers (`daemon.json` has no TTL), so a timer-driven sweep is the smallest host-side mechanism. It handles every cause of reaper loss at once, including unknown ones, covers volumes through `docker rm -v`, and needs no repo change.
2. Test-runner config or lifecycle hooks: cannot help. `globalTeardown`, `afterAll` and process exit hooks do not run on SIGKILL or after a crash, which is exactly the failing case; Ryuk is already the out-of-process mechanism and is the thing that went missing.
3. Test-only repo changes (tmpfs data dir, self-terminating Postgres entrypoint): not needed once level 1 exists, so dropped. They would only bound the damage inside one repo while leaving other leftovers (Created Ryuk, exited containers) untouched.

## Sweep selection rule

The script inspects every container (all states). A container is selected only if ALL of the following hold:

1. It carries the label `org.testcontainers=true`. Anything without this label is never listed, inspected for removal or touched.
2. It is not a running Ryuk (`org.testcontainers.ryuk=true` and state `running`).
3. If it is `running`: no container in state `running` carries `org.testcontainers.ryuk=true` with the same `org.testcontainers.session-id` value. (Exited or created containers skip this check; they cannot affect a live run.)
4. Its `Created` time is older than N, with N = 3 hours.

Action on a selected container: `docker rm -f -v <id>` with `--apply`; without it, print `id state session age image` and exit 0. Volumes: only the anonymous volumes of removed containers, via `-v`; the script never calls `docker volume prune`, `container prune`, `system prune` or touches networks and images.

Why an active run cannot match:
- **Run with a live Ryuk:** its running containers fail rule 3; its transient exited ones fail rule 4 (they exist for milliseconds between `stop` and `remove`).
- **Run whose Ryuk died:** rule 3 no longer protects its running Postgres, but rule 4 does: one container lives for one test file (leaked ones lived 1 to 3 minutes; hooks are bounded at 180 s start and 60 s stop, tests at seconds), so it is minutes old, never 3 hours. It becomes selectable only after 3 hours, at which point it is by definition not part of an active file.
- **Unrelated workloads:** they lack the label (set only by testcontainers), so rule 1 excludes them regardless of state or age.
- **A new run starting during the sweep:** its containers are seconds old (rule 4), and a Ryuk it reuses is running (rule 2).
- Residual risk, stated: a single test file that runs longer than N with a dead Ryuk would be removed. N is far above any file today; the sweep logs every removal to the journal so this would be visible.

Mode: the script lists by default; the systemd timer passes `--apply`. The owner may choose to run the timer list-only first and review the journal before enabling removal.

## Sketch of the artifacts (for the implementer)

- `sweep-testcontainers.sh` (about 25 lines of bash, `docker ps -a --filter label=org.testcontainers=true --format ...`, `docker inspect --format '{{.Created}}'`, `date -d`), run as root by systemd.
- `testcontainers-sweep.service` and `testcontainers-sweep.timer` (`OnCalendar=hourly`, `Persistent=true`), installed to `/etc/systemd/system`.
- `Vagrantfile`: add a second provisioner named `sweep` that copies the three files and runs `systemctl enable --now testcontainers-sweep.timer`. It must be a separate provisioner: re-running the existing inline provisioner reinstalls Docker and runs `systemctl restart docker`, which would kill every running container. For the existing VM run `vagrant provision --provision-with sweep` (no halt, no reload, no dockerd restart).

## Tracking

Odoo (read-only search of projects and tasks):
- There is no infrastructure or homelab project. The closest is **RAZS Server (id 62)**, which holds only "Weekly server documentation audit" tasks; **AI Server (id 1)** holds product ideas; **RAZS Project (id 55)** is the development-workflow engine.
- No task about docker-test-vm, Vagrant, testcontainers cleanup or the VM exists outside Flowledger (id 56): #196 (this), #193 (host Node instability and resource pressure) and #190 (done, .env in worktrees).

Recommendation: keep #196 in Flowledger (56) narrowed to the repo-side work (the `docs/TESTING.md` section and acceptance verification against the FlowLedger suite), and create one companion task in RAZS Server (62) for the VM sweep (files in `~/scripts/docker-test-vm`), linked from #196. Reason: the implementation lives outside the repository, but the symptom, the acceptance run and the docs belong to FlowLedger, and project 56's workflow rules (prefix, tags, stages) are FlowLedger-specific. If the owner prefers one task, move #196 to 62 and drop this OpenSpec change in favor of a runbook plus the docs section.

## Risks

- Removal rule bug: mitigated by list-by-default, the strict label gate, and verification tasks that prove active containers are skipped.
- The hourly timer adds a little load to a 2 GB VM: one `docker ps` and a few inspects.
- Stopped leftovers can exist for up to N plus one hour before removal.

## Open questions (owner)

- Timer removes automatically (`--apply`) or list-only first?
- N = 3 hours acceptable?
- One task (move #196 to project 62) or two (keep #196 in 56, companion in 62)?
- Confirm applying the sweep to the running VM with `vagrant provision --provision-with sweep` is approved when the time comes (no halt/reload).
- For #193: check the VM kernel log for OOM kills around Nov 23 15:34 to 16:02.
