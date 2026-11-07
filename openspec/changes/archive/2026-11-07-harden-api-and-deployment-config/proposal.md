# Proposal

## Why

No committed credentials or server secrets in the web bundle were found, but the deployment has gaps a personal-finance app shouldn't carry: HTTP isn't redirected at the edge, the web host has no HSTS or script-source CSP, services listen on all interfaces, a development server is on the public internet, and production secrets are world-readable on the host. Several smaller code defaults could also fail open if configuration changes.

## Findings

Evidence is from production `main` at `9d57822`, `flowledger_landing` at `efdfc72`, read-only host metadata, and GET-only Cloudflare settings. No secret value was read or recorded.

| ID | Severity | Confidence | Status | Trust boundary | Finding and evidence | Impact |
|---|---|---|---|---|---|---|
| F-20 | Medium | High | Confirmed (live config) | Network to browser | Cloudflare `always_use_https` is off, `min_tls_version` is 1.0. | Login page can load over HTTP, open to tampering |
| F-21 | Medium | High | Confirmed | Network to browser | No HSTS on the web host; zone HSTS is off. `apps/web/vite.config.ts` and `gateway.js` set only frame headers, on the app only. | Downgrade on first or typed visits |
| F-22 | Medium | Medium | Plausible | Internet to dev server | `flowledger-dev.razs.dev` tunnels to a Vite dev server on `*:5174` from `/Users/razs/projects/flowledger`, whose root also holds a `.env`. Vite 6.4.2 has open advisories. | A dev-server file-read flaw would expose development secrets; not tested |
| F-23 | Low to Medium | High | Confirmed; reach depends on network | LAN to services | API `*:4000`, gateway `*:5182`, and dev web `*:5174` listen on all interfaces, with the macOS firewall on. Production web is correctly on `127.0.0.1:5173`. | Bypasses Cloudflare from the local network |
| F-24 | Low to Medium | High | Confirmed | Local users to secrets | `/Users/razs/production/flowledger/.env` and its `.env.backup.*` have mode 644. Other services share this host. | Any local user or process can read production secrets |
| F-25 | Low to Medium | High | Confirmed | Repository to production host | `main` has no branch protection on a public repository, and a push deploys through a self-hosted runner. No `pull_request` trigger exists, so forks can't reach the runner. | One compromised account means code execution on the host |
| F-26 | Low in production | High | Confirmed in code; key is set in production | Internet to webhook | `accounts/providers/syncfy/syncfy.webhookSecurity.ts:148` returns "skipped" with no key, and `accounts/services/providerWebhooks.service.ts:344` rejects only "invalid". `env.ts:66` leaves the key optional. | Removing the key would silently allow forged events |
| F-27 | Low | High | Confirmed | Internet to database | `/providers/webhooks` has no limiter, and invalid requests are stored, up to 1 MB each. | Database growth |
| F-28 | Low | High | Confirmed | Secrets to logs | `morgan` "combined" logs full URLs (`app.ts:63`), including OAuth `code`, `state`, and consent `req`. All are short-lived or single-use. | Credentials-adjacent values in logs |
| F-29 | Low | High | Confirmed | Server to browser | The gateway's 502 includes upstream error text, including address and port. | Internal detail disclosure |
| F-30 | Low to Medium | Medium | Plausible per advisory | Dependencies | `npm audit --omit=dev`: 39 total, 29 high, 0 critical. Most sit under `@syncfy/authentication-widget`. Runtime-relevant: `body-parser`, `react-router`, `axios`, `vite`. Reachability wasn't verified per advisory. | Denial of service or client issues |
| F-31 | Low | High | Confirmed | Build to production | Deploy scripts run `npm install`, not `npm ci`. | Installs can drift from the lockfile |
| F-32 | Defense in depth | High | Confirmed | Configuration | `NODE_ENV` defaults to development (`env.ts:91`), which drops `Secure` from cookies. Production sets it correctly today. `JWT_SECRET` needs only 16 characters. | A configuration mistake weakens cookies silently |
| F-33 | Low | Medium | Plausible | Authenticated user to API | No page cap found on transaction reads; `reports/services/read.service.ts:281` has no `take`. Datasieve limits weren't checked. | One user can trigger heavy reads of their own data |

Reviewed with no finding: no tracked credentials across both repositories' history, only `VITE_API_URL` exposed to the web bundle, no sourcemaps by default, no XSS sinks, no raw SQL or `child_process`, fixed outbound hosts, constant-time webhook HMAC on the raw body, and well-constrained avatar uploads. `trust proxy: 1` matches the API's direct tunnel path.

## What Changes

- Owner applies edge and host settings: HTTPS redirect, TLS 1.2 minimum, restricted secrets, branch protection, `npm ci`, and access control on the dev server.
- The gateway sets security headers on every response, with a CSP starting in report-only mode, and returns a generic 502.
- Services bind to loopback.
- Webhook verification fails closed, its route gets a limiter, and bad-signature requests are no longer stored.
- Logs omit query strings, startup refuses insecure production-like configuration, reads get page caps, and vulnerable dependencies are updated where a non-major fix exists.

## Scope and non-goals

Non-goals: a WAF or paid Cloudflare plan, a reverse proxy to replace `vite preview`, moving off the shared host, zone-wide HSTS (other subdomains may not be ready), database permission changes without inspection, the `zod` major upgrade, and replacing the Syncfy widget. Deferred items are in `docs/KNOWN_ISSUES.md`. No credential rotation is recommended from repository content; rotate if the host has ever had untrusted local users.

## Capabilities

### New Capabilities
- `deployment-security`: Edge transport, response headers, network exposure, secret handling, webhook fail-closed behavior, and safe logging.

### Modified Capabilities

None.

## Impact

- **Landing repository:** `server/gateway.js`.
- **API:** `apps/api/src/config/env.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/modules/accounts/` webhook code, read services.
- **Web and root:** `apps/web/vite.config.ts`, `package.json`, `package-lock.json`.
- **Outside the repositories (owner):** Cloudflare, GitHub settings, `~/scripts/deploy-flowledger*-prod.sh`, file modes, and the dev tunnel.
- **Dependencies:** version updates only; none added.
