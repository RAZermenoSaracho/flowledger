# credit-card-reminders Specification

## Purpose
Defines in-app credit-card billing notifications, evaluated dynamically from the billing calculation. Notifications stay idempotent across restarts, repeated runs and multiple worker processes, without any stored statement.

## Requirements

### Requirement: Billing notifications

For each active, configured card, the system SHALL evaluate two periods: the latest closed period, and the most recent period whose due boundary has passed. It SHALL create in-app notifications of these types, each when its condition holds:

| Type | Condition |
|---|---|
| `credit_card_period_closed` | the latest closed period has closing debt greater than 0 |
| `credit_card_payment_due_soon` | the latest closed period's due date is 3 days away or less, its due boundary has not passed, and remaining is greater than 0 |
| `credit_card_period_partially_paid` | in the latest closed period, payments plus credits are greater than 0 and remaining is greater than 0 |
| `credit_card_period_paid` | the latest closed period has closing debt greater than 0 and remaining 0 |
| `credit_card_payment_overdue` | the most recent period whose due boundary has passed has both remaining and current card debt greater than 0 |

Each notification SHALL state:
- the card name;
- the closing debt;
- the remaining amount;
- the due date;
- the days remaining or overdue;
- the status.

Its metadata SHALL carry the account id and the period's closing date. Selecting it SHALL open that account's Credit card tab.

Other periods and archived accounts SHALL NOT generate notifications. Delivery is in-app only.

#### Scenario: Closing and due soon
- **WHEN** a period closes 2027-01-20 with debt 10000, due 2027-02-20, and stays unpaid
- **THEN** one "period closed" notification appears after closing, and one "due soon" notification appears on or after 2027-02-17, stating 10000 remaining and the days left

#### Scenario: Partial then paid
- **WHEN** 6000 and later 4000 are paid before the due date
- **THEN** one "partially paid" notification with 4000 remaining appears, then one "paid" notification, and no due-soon or overdue reminder follows the payment in full

#### Scenario: Overdue
- **WHEN** 4000 is still remaining after 2027-02-20 ends in the billing time zone, even though the next period closed at the same boundary
- **THEN** one "overdue" notification for the period closing 2027-01-20 appears

### Requirement: Idempotent delivery without statement records

Each notification SHALL carry a dedupe key built from the type, the account id and the period's closing date. The key SHALL be unique per user, enforced by the database, so each event is notified at most once per period.

Evaluation SHALL run in the existing notification worker's periodic maintenance. It SHALL add no process, scheduler or environment variable, and SHALL evaluate only cards owned by the notified user.

Restarts, repeated runs and several worker processes SHALL NOT duplicate a notification. Later edits to historical transactions SHALL NOT resend an event already notified for that period.

#### Scenario: Restart and concurrent workers
- **WHEN** two worker processes evaluate the same due-soon period, and one then restarts and evaluates again
- **THEN** exactly one due-soon notification exists for that card and closing date

#### Scenario: Edit after a notification
- **WHEN** a "partially paid" notification was sent, and the payment is later edited to a different amount
- **THEN** no second "partially paid" notification is sent for that period

#### Scenario: Settled through a later period
- **WHEN** a period is past due with 6000 remaining, but a later payment has already reduced the card's debt to 0 before the worker evaluates it
- **THEN** no overdue notification is sent

#### Scenario: Owner isolation
- **WHEN** users A and B both have cards with periods due soon
- **THEN** each user receives notifications only for their own cards

#### Scenario: Reverted payment
- **WHEN** a "paid" notification was sent, and the payment is then deleted before the due date passes
- **THEN** the period returns to pending, and the overdue reminder still fires once if it stays unpaid
