# deployment-security Specification

## Purpose
Defines the transport, response-header, network-exposure, secret-handling, and logging guarantees of the deployed service, so that a configuration mistake fails visibly rather than silently weakening protection.

## Requirements

### Requirement: Production traffic uses modern HTTPS

FlowLedger production hosts SHALL redirect HTTP to HTTPS, refuse TLS versions below 1.2, and send HSTS on HTTPS responses.

#### Scenario: Plain HTTP request
- **WHEN** a browser requests a production host over HTTP
- **THEN** it is redirected to HTTPS before any application content loads

#### Scenario: HSTS present
- **WHEN** a browser receives an HTTPS response from the web or API host
- **THEN** the response contains `Strict-Transport-Security` with a maximum age of at least one year once rollout completes

### Requirement: Web responses carry security headers

Every response from the production web host, for both landing and application pages, SHALL include `X-Content-Type-Options: nosniff`, a `Referrer-Policy`, a `Permissions-Policy`, and protection against framing.

Application pages SHALL carry an enforced Content Security Policy:
- Scripts are limited to the app's origin, the hosts required by the Syncfy widget, and the Cloudflare Web Analytics beacon host.
- Inline script, `eval`, plugins and `<base>` rewriting are disallowed.
- Network requests are allowed to the app's own origin and its API, and to the HTTPS and WSS endpoints the Syncfy widget uses.

Landing pages SHALL carry at least a report-only Content Security Policy.

#### Scenario: Landing page
- **WHEN** a visitor loads the landing page
- **THEN** all listed headers are present, including framing protection

#### Scenario: Consent page in a frame
- **WHEN** another site frames an application page
- **THEN** the browser refuses to render it

#### Scenario: Injected inline script on an application page
- **WHEN** markup containing an inline `<script>` or an inline event handler reaches an application page
- **THEN** the browser refuses to run it

#### Scenario: Injected script after enforcement
- **WHEN** an application page attempts to load a script from an origin outside the policy
- **THEN** the browser blocks it

#### Scenario: Required integrations
- **WHEN** the policy is enforced
- **THEN** sign-in with email and password, Google sign-in, the MCP consent page, and the Syncfy connection flow continue to work

### Requirement: Internal services are not directly reachable

Production application processes SHALL listen only on the loopback interface. Development servers SHALL NOT be reachable from the public internet without access control.

#### Scenario: Production listeners
- **WHEN** the production API, web, landing, and gateway processes are running
- **THEN** each listens on loopback only, and the tunnel still serves their public hostnames

#### Scenario: Development hostname without authorization
- **WHEN** an unauthorized visitor opens a development hostname
- **THEN** access control stops the request before it reaches the development server

### Requirement: Secrets stay restricted on the host

Production environment files and backups SHALL be readable only by the service account. No stale secret backup SHALL remain in an application directory.

#### Scenario: File permissions
- **WHEN** production secret files are listed
- **THEN** each has mode 600 or stricter

### Requirement: Production deploys are controlled

Changes SHALL reach the production branch only through a reviewed pull request with no force-pushes, and deploys SHALL install exactly what the lockfile records.

#### Scenario: Direct push to the production branch
- **WHEN** anyone attempts a direct or force push to `main`
- **THEN** GitHub rejects it

#### Scenario: Install at deploy
- **WHEN** a deploy runs
- **THEN** it fails rather than altering dependencies if the lockfile disagrees with the manifest

### Requirement: Webhooks fail closed

The provider webhook SHALL reject any event whose signature can't be verified, including when no signing key is configured. The API SHALL refuse to start with a provider enabled and no signing key. Requests failing signature checks SHALL NOT be stored, and the route SHALL be rate limited.

#### Scenario: Missing key at startup
- **WHEN** a Syncfy API key is configured without a webhook signing key
- **THEN** the API refuses to start, and names the missing variable without printing any value

#### Scenario: Bad signature
- **WHEN** a webhook arrives with an invalid or missing signature
- **THEN** the response rejects it, nothing is processed, and no row is stored

#### Scenario: Valid signature
- **WHEN** a correctly signed event arrives
- **THEN** it is processed as before

#### Scenario: Request flood
- **WHEN** one source exceeds the webhook rate limit
- **THEN** further requests get 429 before signature work or database writes

### Requirement: Logs and errors do not expose sensitive values

Request logs SHALL omit query strings. Error responses from the API and gateway SHALL NOT reveal internal addresses, stack traces, or tokens.

#### Scenario: OAuth callback logged
- **WHEN** a request with `code` and `state` parameters is logged
- **THEN** the log line has the path but neither parameter

#### Scenario: Upstream down
- **WHEN** the gateway can't reach an upstream
- **THEN** the 502 body is a fixed message with no address or port

### Requirement: Configuration mistakes fail at startup

The API SHALL refuse to start when `JWT_SECRET` is shorter than 32 characters in production. Session cookies SHALL be `Secure` whenever the web origin uses HTTPS, whatever `NODE_ENV` is, because staging deliberately runs HTTPS outside production mode.

#### Scenario: Short production secret
- **WHEN** `NODE_ENV` is `production` and `JWT_SECRET` is shorter than 32 characters
- **THEN** startup fails with a message naming the variable and no value

#### Scenario: HTTPS staging
- **WHEN** `WEB_APP_URL` is HTTPS and `NODE_ENV` isn't `production`
- **THEN** the API starts, and its cookies are `Secure`

### Requirement: List reads are bounded

List endpoints for financial records SHALL apply a default and a maximum page size. Report queries SHALL stay within the caller's own data, and SHALL be bounded by a maximum date span or record count.

#### Scenario: Oversized page request
- **WHEN** a client requests more records than the maximum
- **THEN** the response contains at most the maximum, and indicates how to continue, or the request gets 400
