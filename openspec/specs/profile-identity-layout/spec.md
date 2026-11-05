# profile-identity-layout Specification

## Purpose

Defines the Profile identity header and General account summary so users can scan account identity, find account details, and use Profile reliably across screen sizes and themes.

## Requirements

### Requirement: Profile header contains identity summary only
The Profile page SHALL keep the profile picture, full name, email address, and current plan pill in its persistent header. The displayed full name SHALL have no visible “Name” label; the name editing control SHALL retain an accessible name. Preferred currency and member-since information SHALL be presented in General rather than the header.

#### Scenario: Header and General placement
- **WHEN** a user views Profile with account details loaded
- **THEN** the header shows the profile picture, full name without a visible Name label, email, and plan pill, while General shows preferred currency and member-since information

### Requirement: Profile layout uses available width responsively
The Profile identity summary SHALL use the available content width without horizontal page overflow at a 375 CSS-pixel viewport and at a 1280 CSS-pixel viewport. Long names and email addresses SHALL wrap or otherwise remain readable without compressing the profile picture or clipping the plan pill. Layout, text, and controls SHALL remain legible in both light and dark themes.

#### Scenario: Narrow mobile viewport with long identity values
- **WHEN** Profile is displayed at 375 CSS pixels with a long name and email in either theme
- **THEN** identity text remains readable, the profile picture and plan pill remain visible, and the page has no horizontal overflow

#### Scenario: Desktop viewport
- **WHEN** Profile is displayed at 1280 CSS pixels in either theme
- **THEN** the identity summary and General details use the available content area without an unintended narrow column or clipped content

### Requirement: Existing profile interactions remain available
Relocating account details SHALL preserve profile picture upload, name and email editing, validation feedback, save and cancel behavior, and Profile tab navigation. Changing or displaying preferred currency SHALL preserve its existing behavior.

#### Scenario: Edit and save identity
- **WHEN** a user edits a valid name or email and saves the change
- **THEN** the existing save flow persists the edit and returns to the updated identity display

#### Scenario: Cancel invalid or unsaved identity edit
- **WHEN** a user cancels an unsaved identity edit or receives existing field validation feedback
- **THEN** the existing cancel and validation behavior remains available

#### Scenario: Change profile picture and navigate tabs
- **WHEN** a user selects a profile picture or switches Profile tabs
- **THEN** the existing avatar upload selection and tab navigation behavior remains available
