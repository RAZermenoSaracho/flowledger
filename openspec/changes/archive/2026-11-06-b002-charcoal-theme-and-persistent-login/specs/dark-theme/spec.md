# Spec Delta

## Purpose

Defines a neutral charcoal dark theme that stays readable and preserves FlowLedger's brand colors while leaving the light theme unchanged.

## ADDED Requirements

### Requirement: Neutral dark surfaces

In dark mode, page, card, and raised surfaces, borders, and hover states SHALL use neutral gray values with no blue tint. Brand and semantic colors, such as emerald, pine, coral, and red, SHALL stay as they are.

#### Scenario: Dark palette is neutral
- **WHEN** the dark palette is evaluated
- **THEN** every step has equal red, green, and blue channels

#### Scenario: Brand accent preserved
- **WHEN** a primary action or success state renders in dark mode
- **THEN** it keeps its existing emerald or pine color

### Requirement: Dark mode contrast and hierarchy

Dark-mode text from the palette's 100 to 500 steps SHALL have at least 4.5:1 contrast on page, card, and raised surfaces. Page, card, and raised surfaces SHALL be distinct, ordered steps.

#### Scenario: Muted text on a raised surface
- **WHEN** the palette's 500 step is measured against its 800 step
- **THEN** the contrast ratio is at least 4.5:1

#### Scenario: Surface hierarchy
- **WHEN** a card sits on the page and a hover state sits on the card
- **THEN** each surface is lighter than the one beneath it

### Requirement: Readable charts and native controls in dark mode

Chart tooltips and axis labels SHALL be readable in dark mode, and native select popups and date inputs SHALL render in the dark color scheme.

#### Scenario: Chart tooltip
- **WHEN** a user opens a Dashboard or Reports chart tooltip in dark mode
- **THEN** it shows a dark surface with text meeting 4.5:1 contrast

#### Scenario: Chart axis
- **WHEN** a chart with axes renders in dark mode
- **THEN** axis labels use a palette text color meeting 4.5:1 contrast on the card surface

#### Scenario: Native select popup
- **WHEN** a user opens a native select in dark mode on desktop or mobile
- **THEN** its options are readable

### Requirement: Light theme unchanged

Light mode SHALL resolve to the same color values as before this change.

#### Scenario: Light values preserved
- **WHEN** any `slate` utility renders without the dark theme active
- **THEN** it resolves to Tailwind's default `slate` value for that step
