# Design

## Context

See proposal.md for motivation. `ProfilePage` renders `<Card className="grid grid-cols-1 gap-6">` with a `ProfileHeader` followed by the tab panel. `Card` already supplies `min-w-0` plus `p-4`. Within `ProfileHeader`, the identity row changes from a column to `sm:flex-row`; the text wrapper has `min-w-0`, but its internal email/currency area is a two-column `sm:grid-cols-2`, and the header's identity content shares a row with an inflexible 5rem avatar. These nested layout choices create the compression point for long identity content at intermediate/narrow widths. The profile page’s parent card itself is not fixed-width; preserve its full available width and ensure nested children can shrink/wrap.

## Goals / Non-Goals

**Goals:** Meet the `profile-identity-layout` behavior contract; preserve current profile data and mutation flows; ensure the header and General summary fit the viewport at 375px and 1280px in both themes.

**Non-Goals:** Change profile APIs or persistence, validation rules, tab routing, shared Card or field primitives, select controls, or the Appearance selector.

## Decisions

- Lift the existing `useProfileDetails` instance to `ProfilePage` and pass its result to the header and General. This preserves one draft and the header's save/cancel flow while currency is edited in a tab that unmounts during navigation. Remove currency and member-since presentation from the header, retaining the plan pill and identity fields.
- Extend `GeneralTab` using existing user data and `useProfileDetails`-provided currency label/date formatting as appropriate; avoid duplicate requests or new models.
- Limit responsive class changes to Profile-specific markup. Ensure each nested grid/flex child can shrink (`min-w-0`), and avoid forcing email and other long values into an overly narrow parallel column. At small widths, allow natural wrapping/stacking; at desktop, allow the summary to occupy the parent card's available width.
- Preserve visible text contrast through existing light/dark utility patterns. Do not modify shared dropdown or theme selector components.

Alternatives considered: adding width constraints to the outer card would worsen the available-width problem; changing shared Card/field primitives would broaden scope unnecessarily. A new summary component is not justified for one display area.

## Risks / Trade-offs

- Moving fields may detach them from their existing formatting/loading states → reuse the existing user fields and formatting and cover loading plus loaded states in component tests.
- Long unbroken email/name strings may still exceed the available line width → specify safe wrapping and verify no horizontal page overflow at 375px.
- Header assertions currently expect currency in the header → update focused tests to verify its General location and retain editing/save/cancel assertions.
- Layout classes alone do not prove visual legibility in both themes → include 375px and 1280px light/dark review in acceptance verification.
