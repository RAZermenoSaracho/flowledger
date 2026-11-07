# search-filter-chips Specification

## Purpose
Defines keyboard removal of active filter chips in the search bar.

## Requirements

### Requirement: Backspace removes the last chip from an empty search input

When the `SearchBar` search input is empty and has focus, pressing Backspace SHALL remove the last chip (the last group-by chip if any, otherwise the last filter chip) and keep focus in the input. When the input contains text, or a modifier key is held, or an IME composition is active, Backspace SHALL only edit text. Delete in the search input SHALL only edit text, because no chip follows the caret.

#### Scenario: Remove the last chip

- **WHEN** the input is empty with two filter chips and the user presses Backspace
- **THEN** the second chip is removed, the first remains, and focus stays in the input

#### Scenario: Text editing preserved

- **WHEN** the input contains "caf" and the user presses Backspace
- **THEN** the input contains "ca" and no chip is removed

#### Scenario: No chips

- **WHEN** the input is empty with no chips and the user presses Backspace
- **THEN** nothing changes

### Requirement: Held keys remove at most one chip

A repeated keydown from a held Backspace or Delete key SHALL NOT remove a chip.

#### Scenario: Held Backspace

- **WHEN** the user holds Backspace in an empty input with three chips
- **THEN** exactly one chip is removed

### Requirement: Focused chips respond to Backspace and Delete

When a chip's remove button has focus, Backspace and Delete SHALL remove that chip, like Enter and Space. Focus SHALL then move to the search input, or to the filter menu button when there is no search input.

#### Scenario: Delete on a focused chip

- **WHEN** a chip's remove button has focus and the user presses Delete
- **THEN** that chip is removed and focus moves to the search input

### Requirement: Chip removal is announced

Each keyboard or pointer removal of a chip SHALL be announced through a polite live region as "Removed {chip text} filter".

#### Scenario: Announcement

- **WHEN** a chip is removed
- **THEN** the live region contains "Removed {chip text} filter"
