# valuation-timestamps Specification

## Purpose
Defines FlowLedger's general policy for the freshness of asset valuations and market prices. The time of the last successful update is kept and shown unobtrusively. It is information only and never a business rule. This applies to every asset class and every pricing provider.

## Requirements

### Requirement: Last successful update is preserved

Every known valuation SHALL carry the time of its last successful update:
- **Manual valuation:** the time the user set it, or the time the user entered for it.
- **Market quotation:** the time of the last successful fetch from its provider. For stock and ETF quotes, whose provider reports when the price applies, it SHALL be that provider quote time, and the time of the last successful provider check SHALL be kept and shown separately as "Last checked".

A valuation SHALL remain the last known value until a newer successful update replaces it. A failed update SHALL NOT change the value or its timestamp.

#### Scenario: Failed refresh keeps the timestamp
- **WHEN** a price refresh fails
- **THEN** the previous value and its last-updated time are still returned unchanged

#### Scenario: Quote time and check time differ
- **WHEN** a stock quote that applies at Friday's close is checked successfully on Saturday
- **THEN** "Last updated" shows Friday's quote time and "Last checked" shows Saturday's check

### Requirement: No time-based freshness rules

The time elapsed since a valuation's last update SHALL NOT, on its own, cause any of the following:
- a stale flag, badge, warning color, or status change;
- invalidation of the value or its exclusion from totals;
- a disclosure.

There SHALL be no expiration timer or freshness setting that invalidates a value.

**Exception, for stock and ETF market quotes only (`security-holding-prices`):** a quote MAY be flagged stale when either condition holds:
- the most recent provider attempt failed;
- the provider reported the market open while returning a quote older than twice the configured refresh interval.

A stale quote SHALL still count in totals. Elapsed time since the last check never marks it stale on its own.

#### Scenario: Very old valuation
- **WHEN** a manual or crypto valuation was last updated a year ago
- **THEN** it counts like any other known valuation, and the only sign of its age is its last-updated time

#### Scenario: Failed stock refresh
- **WHEN** the latest refresh of a stock quote failed
- **THEN** the quote keeps its value and times, still counts in totals, and is flagged stale

### Requirement: Known versus missing

A missing valuation SHALL stay distinguishable from a known one in API responses and in the UI:
- in API responses, a missing valuation has a `null` value and a reason;
- in the UI, it is labeled "Value missing".

A missing valuation has no last-updated time.

A known valuation with no genuine update time, such as cash at par or the identity USDT quotation, SHALL have a `null` timestamp. The system SHALL NEVER invent a timestamp, and the UI SHALL show no "Last updated" for it.

#### Scenario: Identity quotation has no timestamp
- **WHEN** a USDT holding is valued by the identity quotation
- **THEN** its valuation time is `null` and no "Last updated" is shown

#### Scenario: Missing has no timestamp
- **WHEN** a holding is missing a valuation
- **THEN** it shows "Value missing" and no last-updated time

### Requirement: Unobtrusive, accessible timestamp presentation

The UI SHALL present a valuation's time as "Last updated: <date and time>", with these rules:
- **Formatting:** `YYYY/MM/DD HH:mm` (24-hour, for example "Last updated: 2026/11/16 19:14") in the device's time zone, the same for every user and locale.
- **Default presentation:** a subtle tooltip on the price. Where the layout has room, a small secondary label MAY be used instead, for example in stacked mobile rows.
- **Accessibility:** the tooltip SHALL also open on keyboard focus and on tap, so it is reachable on touch devices and by keyboard, not only by mouse hover. It SHALL be announced to assistive technology.
- **Reuse:** the same presentation SHALL be used for every asset class and pricing provider.

#### Scenario: Hover, focus and tap
- **WHEN** the user hovers over a price, focuses it with the keyboard, or taps it on a touch device
- **THEN** "Last updated:" followed by the formatted date and time is shown and announced

#### Scenario: Consistent format
- **WHEN** a manual and a market valuation are shown side by side
- **THEN** both use the same "Last updated:" format, in the device's time zone
