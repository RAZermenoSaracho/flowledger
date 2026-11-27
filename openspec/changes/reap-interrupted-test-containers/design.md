## Context

`startTestDatabase()` starts one `postgres:16-alpine` container per integration/e2e file (44 files). Vitest 4 runs each file in its own forked process (`maxWorkers: 2`). testcontainers 12.2.1 starts a Ryuk reaper (`testcontainers/ryuk:0.14.0`, created with Docker `AutoRemove=true`) under a file lock; later processes reuse a running Ryuk and register their session id over a TCP socket. Ryuk config (from its startup log): `connection_timeout=1m`, `reconnection_timeout=10s`, `remove_retries=10`. When all client sockets are closed for 10 s, Ryuk removes every container, network and volume with the session label and exits.

## Evidence

Proven by repro on docker-test-vm (one small file, `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` set):
- SIGKILL of the whole vitest tree after Postgres was up, SIGKILL as soon as Ryuk appeared, SIGKILL of only the top-level process, and a second run started while the first run's Ryuk was draining: in all four, containers, Ryuk and volumes were gone within about 15 s (counts back to 0/0). Ryuk verbose log: `client connected`, `client disconnected` at the kill, `prune check clients=0` 10 s later, `removed containers=1`, `done`.
- A client connecting to a Ryuk that is draining is refused (`ECONNREFUSED` at disconnect + 10.15 s), not silently accepted. One probe; the sub-second drain window was not swept exhaustively.
- Postgres data on tmpfs creates no volume; a Postgres container started with entrypoint `timeout <n> docker-entrypoint.sh` and command `postgres` becomes ready normally and exits cleanly after `n` seconds.

Proven by reading testcontainers 12.2.1:
- If connecting to Ryuk fails (4 s retry budget), `getReaper` throws and the container is never created. A slow or loaded host therefore cannot produce an unprotected container through a Ryuk connection timeout; a longer `RYUK_CONNECTION_TIMEOUT` would change nothing because the client gives up first.
- Once connected, the client only logs a warning if the Ryuk socket closes; it never reconnects, recreates Ryuk or re-registers its session.
- `stop()` defaults to `timeout: 0` (SIGKILL), so every normally stopped container exits 137, and `remove` is a separate second call. An exited-137 container that was not removed means the process died or aborted between the two calls, or the reaper was absent.
- `withAutoRemove` in testcontainers is the client-side remove-on-stop flag, not Docker's `AutoRemove`; there is no public API to set Docker's flag on the Postgres container.
- A failed `beforeAll` or hook timeout does not persist a container by itself: `container` is assigned right after `start()`, and Ryuk reaps what is left when the process exits.

Facts from the incident that rule out earlier theories:
- The VM has not stopped since Nov 23 14:20 and Docker has `LiveRestoreEnabled=false`, so a VM stop or daemon restart cannot explain a session that has both exited-137 and still-running containers. VM stop is dropped as the cause.
- No vitest process or Ryuk container is alive now, so a three-day orphan holding the Ryuk socket is not supported either (a live socket would postpone reaping indefinitely, but nothing indicates one existed).

Not determined: why no reaper covered session 432aff99f51a. Leading hypothesis (inferred, not reproduced): Ryuk, or its published-port proxy, died mid-run under memory pressure on the 2 GB VM (`OOMKilled=false` with exit 137 is the signature of a host-level OOM kill, which Docker does not flag), `AutoRemove` removed Ryuk, the client never noticed, and containers alive at that moment, plus those whose `afterAll` had stopped but not yet removed them, survived. This cannot be confirmed without the VM kernel log; checking it belongs to #193 together with the memory pressure itself.

## Decisions

1. **Keep Ryuk, no Ryuk timeout tuning.** It works in every reproducible interruption, and no timeout path that applies to this setup was found.
2. **Data on tmpfs** via `.withTmpFs({ "/var/lib/postgresql/data": "rw" })`. Removes the volume leak class; the data is throwaway. Cost: the data lives in VM RAM; test databases are tens of MB and at most two run at once.
3. **Bounded lifetime** via `.withEntrypoint(["timeout", "1200", "docker-entrypoint.sh"]).withCommand(["postgres"])` with the 1200 s value in one named constant. Works whatever the cause of reaper loss (OOM, crashed Ryuk, orphan): the container stops itself, frees its RAM, and with tmpfs leaves only a tiny stopped container. The ceiling is well above the longest test file (hook budgets are 180 s start plus 60 s stop, files run a few minutes at most); if a file ever exceeds it, the failure is loud (connection errors), not silent.
4. **Document, do not automate, leftover cleanup.** A read-only `curl` listing of `org.testcontainers=true` containers and volumes, and a per-id removal step run by a human. Destructive operations need approval and never run automatically.
5. **Rejected: vitest `globalSetup` with one container and per-file databases.** The evidence does not show per-file containers cause the leak, and reaper loss would leak one container instead of many but still leak. It would rewrite the helper contract used by 44 files, need a template-database step and weaken per-file isolation. Any load benefit belongs to #193.
6. **Rejected: disabling Ryuk, wrapping `stop()`/`remove` in retries, a custom reaper or watchdog process.** More code than the self-terminating container and no better bound.

## Risks

- tmpfs uses VM RAM (2 GB). Mitigation: the full-suite acceptance run must pass with unchanged results and no hook timeouts.
- A test file that legitimately runs over 20 minutes would fail; none comes close today.
- Stopped (exited) containers can still remain after reaper loss until someone removes them; they hold no volume and no RAM.

## Open questions

- Owner decision: documentation only for leftover listing, or a small `scripts/` wrapper? Default: documentation only.
- Owner decision: lifetime ceiling of 20 minutes acceptable?
- For #193: check the VM kernel log (`dmesg`) for OOM kills around Nov 23 15:34 to 16:02 to confirm or refute the leading hypothesis.
