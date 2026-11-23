## ADDED Requirements

### Requirement: Plan tier is server-controlled

The system SHALL change a user's `planType` only through a trusted server-side path. No authenticated user request, including `/users/me` updates, `/v1`, and MCP tools, SHALL set or change `planType`.

#### Scenario: Self-service plan change is rejected
- **WHEN** a signed-in user sends `PATCH /users/me/plan` with `{ "planType": "flowledger_one" }`
- **THEN** the response is 404 and the user's plan is unchanged

#### Scenario: Profile update cannot set the plan
- **WHEN** a signed-in user sends `PATCH /users/me` or MCP `update_preferences` including `planType`
- **THEN** the field is ignored and the plan is unchanged

### Requirement: Subscription tab is read-only

The Profile Subscription tab SHALL show the user's current plan name and description and SHALL NOT offer a control that changes the plan.

#### Scenario: Free user views the tab
- **WHEN** a free user opens Profile, Subscription
- **THEN** the tab shows the Free plan name and description and no Upgrade or Downgrade button

#### Scenario: Paid user views the tab
- **WHEN** a `flowledger_one` user opens the tab
- **THEN** it shows FlowLedger One and no Downgrade button
