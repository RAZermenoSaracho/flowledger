# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Reports filters are an always-visible bar`
- TO: `### Requirement: Reports filters collapse on small screens`

## MODIFIED Requirements

### Requirement: Reports filters collapse on small screens

Below `lg`, the Reports page SHALL collapse its filters behind a Filters button, closed by default, that expands and collapses From, To, Groups, Categories, Currency, and Net or Gross. From `lg`, the page SHALL show them as one always-visible bar with no Filters button. Collapsing SHALL NOT clear any selected filter or entered value. The controls SHALL stack responsively (one column on phones, two from `md`, a single horizontal row of four from `xl`).

#### Scenario: Collapsed by default on a phone

- **WHEN** the Reports page opens at 390 px
- **THEN** a Filters button is visible, and the filter controls are hidden until it is pressed

#### Scenario: Controls present on a phone

- **WHEN** a user presses the Filters button at 360 px
- **THEN** From, To, Groups, Categories, Currency, and Net or Gross are all visible

#### Scenario: Always visible on desktop

- **WHEN** the Reports page opens at 1440 px
- **THEN** every control is visible and there is no Filters button

#### Scenario: Values survive collapsing

- **WHEN** a user enters a date, collapses the filters, and expands them again
- **THEN** the entered value and report results are unchanged

#### Scenario: Active filters while collapsed

- **WHEN** filters are active and the controls are collapsed
- **THEN** the button indicates that filters are active
