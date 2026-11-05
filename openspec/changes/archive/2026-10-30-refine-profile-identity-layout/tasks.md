# Tasks

## 1. Profile header layout

- [x] 1.1 Update the Profile header to show only picture, full name without a visible Name label, email, and plan pill; retain accessible edit labels and existing edit/save/cancel/error behavior, verified by focused header tests.
- [x] 1.2 Correct nested Profile width/wrapping so long identity values fit at 375px and 1280px in light and dark themes without horizontal overflow or clipped avatar/plan, verified by responsive CSS inspection. Actual viewport rendering requires manual browser review because jsdom does not perform layout.

## 2. General account summary

- [x] 2.1 Move preferred currency and member-since into General using existing account data and formatting, verified by GeneralTab checks for loaded and loading states.
- [x] 2.2 Update focused header, GeneralTab, and Profile page tests to verify field placement and preserve avatar, identity editing, currency, and tab interactions.

## Validation

- Focused Profile tests: 18 passed, including avatar/identity editing, currency saving and clearing, loading, accessible hidden labels, and draft preservation across tab switches.
- Full frontend coverage run: 131 files, 930 tests passed; configured thresholds passed. Repository lint/typecheck and frontend build passed.
- Actual 375px/1280px light/dark rendering still requires manual browser review; responsive CSS and DOM interactions were inspected/tested without claiming browser layout measurements.
