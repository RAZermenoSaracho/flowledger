# Spec Delta

## Purpose

Defines FlowLedger's general policy for the freshness of asset valuations and market prices. The time of the last successful update is kept and shown unobtrusively. It is information only and never a business rule. This applies to every asset class and every pricing provider.

## ADDED Requirements

### Requirement: Last successful update is preserved

Every known valuation SHALL carry the time of its last successful update:
- **Manual valuation:** the time the user set it, or the time the user entered for it.
- **Market quotation:** the time of the last successful fetch from its provider.

A valuation SHALL remain the last known value until a newer successful update replaces it. A failed update SHALL NOT change the value or its timestamp.

#### Scenario: Failed refresh keeps the timestamp
- **WHEN** a price refresh fails
- **THEN** the previous value and its last-updated time are still returned unchanged

### Requirement: No time-based freshness rules

The time elapsed since a valuation's last update SHALL NOT, on its own, cause any of the following:
- a stale flag, badge, warning color, or status change;
- invalidation of the value or its exclusion from totals;
- a disclosure.

There SHALL be no stale threshold, expiration timer, or freshness setting.

#### Scenario: Very old valuation
- **WHEN** a valuation was last updated a year ago
- **THEN** it counts like any other known valuation, and the only sign of its age is its last-updated time

### Requirement: Known versus missing

A missing valuation SHALL stay distinguishable from a known one in API responses and in the UI:
- in API responses, a missing valuation has a `null` value and a reason;
- in the UI, it is labeled "Value missing".

A missing valuation has no last-updated time.

#### Scenario: Missing has no timestamp
- **WHEN** a holding is missing a valuation
- **THEN** it shows "Value missing" and no last-updated time

### Requirement: Unobtrusive, accessible timestamp presentation

The UI SHALL present a valuation's time as "Last updated: <date and time>", with these rules:
- **Formatting:** the app's one existing date-time convention: the device's time zone and locale, with date, hours and minutes.
- **Default presentation:** a subtle tooltip on the price. Where the layout has room, a small secondary label MAY be used instead, for example in stacked mobile rows.
- **Accessibility:** the tooltip SHALL also open on keyboard focus and on tap, so it is reachable on touch devices and by keyboard, not only by mouse hover. It SHALL be announced to assistive technology.
- **Reuse:** the same presentation SHALL be used for every asset class and pricing provider.

#### Scenario: Hover, focus and tap
- **WHEN** the user hovers over a price, focuses it with the keyboard, or taps it on a touch device
- **THEN** "Last updated:" followed by the formatted date and time is shown and announced

#### Scenario: Consistent format
- **WHEN** a manual and a market valuation are shown side by side
- **THEN** both use the same "Last updated:" format, in the device's time zone
