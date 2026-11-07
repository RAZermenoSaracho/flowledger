# Spec Delta

## ADDED Requirements

### Requirement: Dropdown menus are not clipped by page layout

Dropdown menus on list pages SHALL stay fully visible and usable when the page content is shorter than the menu, without the page growing to fill the viewport. The page layout SHALL NOT create a scroll container that clips them.

#### Scenario: Empty list

- **WHEN** a user opens the filter menu on a page with no records, such as Accounts or Transactions
- **THEN** the whole menu is visible and operable, and the main content area shows no inner scrollbar

#### Scenario: Narrow viewport

- **WHEN** the same menu opens at a 360px viewport width
- **THEN** it stays within the viewport width and the page has no horizontal scroll
