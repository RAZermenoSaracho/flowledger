# Spec Delta

## Purpose

Provide a consistent, accessible dropdown experience across the application while preserving the distinct selection semantics and values of existing fields.

## ADDED Requirements

### Requirement: Select controls preserve their selection semantics
The system SHALL present existing single-select controls as single-select controls and existing multi-select controls as multi-select controls. Changing presentation SHALL preserve the field's option values, labels, selected value shape, empty/default behavior, disabled behavior, and change callback meaning.

#### Scenario: Single-select choice
- **WHEN** a user opens a field that previously selected one value and chooses an option
- **THEN** exactly that one option becomes the field value and the existing change behavior is invoked with the same value representation

#### Scenario: Multi-select choice
- **WHEN** a user toggles an option in a field that previously allowed multiple values
- **THEN** that option is added to or removed from the selected values without replacing the field's multi-value behavior

#### Scenario: Empty and disabled fields
- **WHEN** an existing field has no available options or is disabled
- **THEN** its existing empty presentation and inability to change its value are preserved

#### Scenario: Search controls retain their behavior
- **WHEN** a select control appears inside SearchBar or SearchComponent
- **THEN** only the select presentation changes; standalone/global/table search bars, search inputs, ordinary text inputs, and their filtering behavior remain unchanged

### Requirement: Dropdowns expose consistent visual states
The system SHALL use consistent trigger styling and icon treatment across light and dark themes, including closed, focused, selected, and disabled states. Custom menus SHALL also use consistent open, hovered, selected, disabled, and empty states, fit narrow viewports without horizontal overflow, and retain usable touch targets. Native select option popups remain browser/platform rendered and are exempt from pixel-identical menu styling and custom controlled open-state behavior.

#### Scenario: Theme changes
- **WHEN** a user views a dropdown in light or dark theme
- **THEN** the control, menu, text, borders, focus indicator, and selected state remain legible and use the corresponding application theme colors

#### Scenario: Narrow viewport
- **WHEN** a dropdown is used in a narrow viewport
- **THEN** its trigger and menu remain within the available viewport width and options remain readable or safely truncated

### Requirement: Dropdowns support accessible keyboard and assistive technology use
The system SHALL expose an accessible name, current value or selection state, disabled state, and appropriate single- or multi-select semantics. Users SHALL be able to operate open menus using the keyboard, including opening, moving among options, selecting or toggling as appropriate, and closing with Escape; focus SHALL remain visible and be managed predictably.

#### Scenario: Keyboard native single-select operation
- **WHEN** a keyboard user operates a native-backed single-select dropdown
- **THEN** the accessible name, value, disabled state, visible focus, and selection behavior are exposed by the native control and platform keyboard behavior is preserved

#### Scenario: Keyboard custom multi-select operation
- **WHEN** a keyboard user operates a multi-select dropdown
- **THEN** option selection can be toggled without closing the menu, selected options are announced, and Escape closes the menu

#### Scenario: Searchable options
- **WHEN** a user enters text in a searchable dropdown
- **THEN** only matching options are presented, the search input has an accessible name, and an empty-results state is announced accessibly
