# Spec Delta

## ADDED Requirements

### Requirement: Notification ingest route

In addition to the allowlisted routes, `/v1` SHALL expose `POST /v1/notification-models/:id/notifications`. As the single exception to the rule that POST requires write, this route SHALL require the ingest scope. It SHALL pass the shared `/v1` rate limiter and SHALL emit exactly one audit line with operation `notification.ingest` and the run id, without the notification text. Its behavior is defined by the notification-ingestion capability.

#### Scenario: Ingest scope required
- **WHEN** a write-scoped key posts to the route
- **THEN** the response is 403

#### Scenario: Rate limited
- **WHEN** a caller exceeds the shared `/v1` limit
- **THEN** the response is 429

#### Scenario: Audit line
- **WHEN** a notification is accepted
- **THEN** exactly one audit line is emitted with operation `notification.ingest` and the run id, and it contains no notification text
