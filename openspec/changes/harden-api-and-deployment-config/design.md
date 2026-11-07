# Design

## Context

See `proposal.md`. Topology read from the host: Cloudflare to `cloudflared` on the same machine, which also serves other applications from the `razs.dev` zone, then to local ports through `/etc/cloudflared/config.yml`. Production web runs `vite preview` on loopback under pm2. The gateway fronts only `flowledger.razs.dev`; `api-flowledger.razs.dev` goes straight to the API, whose `helmet` already sets HSTS and `nosniff`.

## Goals / Non-Goals

**Goals:** fix verified exposure with settings and small code changes, in independently safe steps.

**Non-Goals:** see `proposal.md`.

## Security invariants

1. Secrets never appear in URLs, logs, reports, or the web bundle.
2. A missing security configuration stops startup or rejects the request. It never skips the check.
3. Only `cloudflared` reaches production processes.
4. Owner-only settings are recorded as verifiable results, never as secret values.

## Decisions

### D1. Separate owner actions from code

Task group 1 needs no deployment and can happen right away, in any order. Each change has its own undo. Nothing in the code groups depends on it, except that HSTS should follow the HTTPS redirect.

### D2. Gateway owns web-host headers

The gateway already fronts both landing and app, so one `proxyRes` handler covers both origins. `vite.config.ts` keeps its frame headers for direct preview and dev use. Cloudflare transform rules were not chosen, because this would leave policy outside version control.

*Alternative:* zone-wide HSTS. Other subdomains (Odoo, n8n, and others) may not be ready, and a mistake there is slow to undo, so HSTS stays per-host.

### D3. CSP in report-only first

`default-src 'self'`, with `script-src` for self and the Syncfy widget host, `connect-src` for self and the API, `style-src` with `'unsafe-inline'` for Tailwind and the widget, `img-src` self, API, and `data:`, `frame-ancestors 'none'`, and `base-uri 'self'`. The exact Syncfy sources are unknown until exercised, so a report-only period precedes enforcement. No reporting endpoint is added; violations are read in the browser console during the task 3.2 walkthrough.

### D4. HSTS ramp

Start at `max-age=300`, then raise to one year after a day with no HTTPS issues, without `preload`.

### D5. Fail closed on webhooks at two levels

A zod refinement in `env.ts` requires the signing key when the API key is present. The service treats anything except a verified result as rejected, and the "skipped" result goes away. A non-Syncfy provider branch also rejects by default, so a future provider must bring a verifier. Production has the key set today, which task 2.1 confirms by presence only before deploying, because otherwise startup would fail.

### D6. Rate limit webhook before verification, and stop storing bad signatures

Use `createRateLimiter` by IP. Set the limit well above normal Syncfy volume, and watch 429s on first deploy. Keep the diagnostic log line, without the payload. Requests with a valid signature but an invalid body may continue to be recorded for debugging.

### D7. Morgan logs paths only

A custom format using `req.path`-equivalent values replaces `combined`, keeping method, status, length, timing, referrer host, and user agent. This loses query-based debugging, which doesn't justify keeping codes and tokens in logs.

### D8. Bind to loopback, in code

`app.listen(env.API_PORT, "127.0.0.1")`, `server.listen(GATEWAY_PORT, "127.0.0.1")`, and `--host 127.0.0.1` in `start:web` and Vite's `server.host`. `cloudflared` reaches `localhost` already. It may try `::1` first and then fall back, so task 4.2 verifies the tunnel right after deploying. This is a fixed value rather than a new variable. LAN device testing can use the dev tunnel.

### D9. Dev hostname behind Cloudflare Access

Free for small teams, needs no code, and also covers `api-flowledger-dev`. Webhooks or OAuth callbacks that must reach the dev API need explicit bypass paths, and task 1.4 lists them. If that's too much friction, stop the dev tunnels while they aren't in use. Serving `vite preview` instead would reduce the file-read surface, but it wouldn't add authentication.

### D10. Dependency updates limited to non-major fixes

Run `npm audit fix` without `--force`, then update `vite`, `react-router-dom`, and transitive `body-parser` and `axios` within their majors. `zod` 4 is a major migration across every schema; input is bounded by the 1 MB body limit, so it's logged rather than bundled here. The widget's install-time tree has no available fix and is logged.

## Risks / Trade-offs

- [HTTPS redirect breaks another `razs.dev` app] → The setting is zone-wide. Owner checks the listed apps, or scopes it with a per-host rule instead.
- [Enforced CSP breaks the bank-connection flow] → Report-only first, and a complete Syncfy walkthrough before enforcing. Revert is one line.
- [Lower limits block legitimate Syncfy bursts] → Generous first value, and signed events are checked in logs after deploy.
- [`JWT_SECRET` length check blocks startup] → Task 2.1 checks length before deploying, printing only pass or fail. If it's short, rotate first; that ends live access tokens, which recover through refresh.
- [Loopback binding fails with the tunnel] → Task 4.2 checks public hostnames immediately after restart. Revert restores them.

## Migration Plan

**Deployment order:** after `fix-access-token-purpose-validation`. Owner actions in group 1 may begin immediately, even before it. Code groups are independent of the other changes.

1. Owner settings (group 1).
2. Pre-deploy configuration checks (2.1).
3. API and web through the `main` workflow.
4. Gateway through its own workflow, with owner approval.
5. CSP report-only walkthrough, then enforcement in a later small commit.

**Compatibility:** no API contract changes other than capped pages, which clients already paginate after task 3.5 confirms it.

**Rollback:** Cloudflare and GitHub settings revert in their dashboards. HSTS can't be withdrawn instantly, which is why D4 ramps it. Code changes revert by commit. Keep the removed `.env.backup.*` outside the application directory with restricted permissions until the owner is sure it isn't needed.
