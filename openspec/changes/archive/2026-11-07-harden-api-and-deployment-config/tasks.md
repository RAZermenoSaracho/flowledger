# Tasks

Application work uses a feature branch from the latest `razs_ai`. Landing work uses a fresh clone at `/Users/razs/projects/flowledger_landing`, never the production checkout, and pushing it needs owner approval. Every changed file under `controllers/`, `services/`, `utils/`, `hooks/`, or `components/` gets its matching test. Never print or record a secret value.

## 1. Owner actions (no code; agents don't perform these)

- [ ] 1.1 In Cloudflare, enable Always Use HTTPS and set minimum TLS to 1.2, first confirming other `razs.dev` apps are compatible. Verify `curl -I http://flowledger.razs.dev/` returns a redirect to HTTPS, and that the zone settings read back as expected.
- [ ] 1.2 Run `chmod 600` on `/Users/razs/production/flowledger/.env`, move its `.env.backup.*` out of the application directory with mode 600, and check `~/backups` dump permissions. Verify with `ls -l`. Rotate secrets only if the host has had untrusted local users.
- [ ] 1.3 On GitHub, protect `main`: require a pull request, block force pushes and deletions, and apply the rules to administrators if practical. Verify a read of the branch protection API returns the rules.
- [ ] 1.4 Put `flowledger-dev.razs.dev` and `api-flowledger-dev.razs.dev` behind Cloudflare Access, with bypass paths for required OAuth and webhook callbacks, or stop the tunnels while unused. Verify an unauthenticated browser is stopped at Access.
- [ ] 1.5 Change `~/scripts/deploy-flowledger-landing-prod.sh` from `npm install` to `npm ci`, since that repository tracks its lockfile. The app repository ignores its lockfile, so its script can't use `npm ci` until `docs/KNOWN_ISSUES.md` #043 is done. Verify on the next landing deploy that the lockfile is unchanged.

## 2. Configuration and webhook (API)

- [x] 2.1 Before deploying, confirm by pass or fail only that production has the webhook signing key and a `JWT_SECRET` of at least 32 characters. Verify the result is recorded with no value or exact length.
- [x] 2.2 Add `env.ts` refinements for the webhook key and the production secret length, and derive `Secure` cookies from an HTTPS web origin, since staging runs HTTPS with `NODE_ENV=development`. Verify `config/tests/` covers each failure, with error messages naming variables only.
- [x] 2.3 Remove the "skipped" signature result, reject unverified events in `providerWebhooks.service.ts`, including the non-Syncfy branch, and stop storing bad-signature requests. Verify service tests, including that HMAC verification still runs on the raw body.
- [x] 2.4 Add a limiter on `/providers/webhooks`. Verify a route test gets 429 past the limit, and that a signed event within the limit succeeds.

## 3. Logging, binding, and limits (API and web)

- [x] 3.1 Replace `morgan`'s format with one that omits query strings. Verify a test or captured log line for `/auth/google/callback?code=x&state=y` contains neither value.
- [x] 3.2 Bind the API to `127.0.0.1` in `server.ts`. Change the `start:web` script and Vite `server.host` to loopback. Verify locally with `lsof`.
- [x] 3.3 Raise the minimum versions of `vite`, `react-router-dom`, `express` (which pins `body-parser`) within their majors, and override transitive `axios`, because the lockfile isn't tracked and `npm audit fix` alone wouldn't reach production. Verify `npm audit --omit=dev` shows those packages no longer flagged, and that the app builds.
- [x] 3.4 Log the remaining dependency advisories, with reasons, in `docs/KNOWN_ISSUES.md`. Verify each remaining high item has either a reason or an owner decision.
- [x] 3.5 Check datasieve's limits and existing client pagination, then add default and maximum page sizes to transaction reads and a bound on report reads. Verify service tests at and above the maximum, and that web list pages still load all pages.

## 4. Gateway (landing repository)

- [x] 4.1 Add a `proxyRes` handler setting HSTS (`max-age=300` to start), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options: DENY`, and `Content-Security-Policy-Report-Only` per D3. Bind to `127.0.0.1` and return a fixed 502 message. Verify locally with `curl` against stub upstreams, on landing, app, and 502 responses.
- [x] 4.2 After deploying, confirm `https://flowledger.razs.dev/` and `https://api-flowledger.razs.dev/health` both load, and that `lsof` shows loopback listeners for the API, web, landing, and gateway. Verify immediately, and revert if either hostname fails.

## 5. Header rollout (owner and implementer)

- [ ] 5.1 With report-only active, walk through login, Google sign-in, dashboard, reports, avatar upload, and a Syncfy connection in a browser with the console open. Verify the required sources are recorded, and adjust the policy until no required feature reports a violation.
- [ ] 5.2 Switch the CSP to enforcing, and raise HSTS to one year after a day without issues. Verify the walkthrough still passes, and record header values in the change.

## 6. Finish

- [x] 6.1 Update `README.md` or `.env.example` for changed requirements, without values, and document the owner settings in `docs/PROVIDER_SYNC.md` where webhook behavior changes. Verify `npm run typecheck`, `npm run lint`, and `npm run test` pass.

## Results

Pre-deploy checks passed: production has the signing key and a `JWT_SECRET` of at least 32 characters. The first deploy failed at the web typecheck because production's untracked lockfile left two `vite` copies; a root override fixed it. Open: owner settings (group 1), and the CSP walkthrough and HSTS raise (group 5). The CSP is report-only and HSTS is `max-age=300`.
