# Proposal

## Why

Access tokens now live only in memory, and the refresh token is in an HttpOnly cookie. The remaining risk is hypothetical: if an XSS ever lands, injected script runs as the user. No XSS is confirmed. The web app has no raw-HTML sinks, no inline scripts and no data-driven URLs, and React escapes output.

The application's Content Security Policy is still report-only, with no reporting endpoint, so nothing blocks an injected inline script or event handler today. Enforcing a CSP is the established defense for this. Moving the access token into a cookie is not: an XSS could still act through the user's session, so it wouldn't remove that ability (see design.md).

## What Changes

- Application pages (the web app's `vite preview` server, which production runs behind the gateway) send an **enforced** `Content-Security-Policy`:
  - Scripts may come from the app's own origin plus the two hosts the Syncfy widget loads scripts from: `www.paybook.com` and Google Tag Manager.
  - Inline scripts, `eval`, inline event handlers, plugins, `<base>` rewriting and framing are not allowed.
- No change to authentication, cookies, tokens, API, MCP or OAuth.
- The landing pages keep the gateway's report-only policy. They're out of scope.

## Capabilities

### New Capabilities

### Modified Capabilities
- `deployment-security`: application pages enforce the CSP; the landing pages remain report-only.

## Impact

- `apps/web/vite.config.ts`, plus a header test.
- Risk: the Syncfy widget might need a source this policy blocks. Mitigation: a staging walkthrough, a required manual bank-connection test before production, and a one-line rollback.
