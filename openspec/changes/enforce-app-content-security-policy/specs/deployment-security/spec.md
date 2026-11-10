# Spec Delta

## MODIFIED Requirements

### Requirement: Web responses carry security headers

Every response from the production web host, for both landing and application pages, SHALL include `X-Content-Type-Options: nosniff`, a `Referrer-Policy`, a `Permissions-Policy`, and protection against framing.

Application pages SHALL carry an enforced Content Security Policy:
- Scripts are limited to the app's origin and the hosts required by the Syncfy widget.
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
