## ADDED Requirements

### Requirement: Plan tier is server-controlled

The system SHALL change a user's `planType` only through a trusted server-side path. No authenticated user request, including `/users/me` updates, `/v1`, and MCP tools, SHALL set or change `planType`.

#### Scenario: Self-service plan change is rejected
- **WHEN** a signed-in user sends `PATCH /users/me/plan` with `{ "planType": "flowledger_one" }`
- **THEN** the response is 404 and the user's plan is unchanged

### Requirement: Subscription tab is read-only

If a Profile Subscription tab exists, it SHALL show the user's current plan name and description and SHALL NOT offer a control that changes the plan.

#### Scenario: Tab shows the plan without a switch
- **WHEN** a user opens Profile, Subscription
- **THEN** it shows the current plan name and description and no control that changes the plan
