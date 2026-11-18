## MODIFIED Requirements

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
