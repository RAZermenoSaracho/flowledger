# Proposal: refine-profile-identity-layout

## Why

The Profile header currently mixes identity with account settings, and its layout can compress identity content at narrow widths. This change gives the Profile page a clear identity summary while preserving access to existing account details and editing behavior.

## What Changes

- Keep only the profile picture, full name without a visible “Name” label, email, and plan pill in the persistent header.
- Move preferred currency and member-since information into General.
- Ensure the identity summary uses the available page width and remains readable on mobile and desktop in light and dark themes.
- Preserve existing profile editing, save/cancel, avatar upload, and tab interactions.
- Do not redesign select controls or the Appearance theme selector.

## Capabilities

### New Capabilities

- `profile-identity-layout`: Defines the Profile identity header, General account summary placement, responsive width behavior, and preservation of existing identity editing interactions.

### Modified Capabilities

None.

## Impact

- `apps/web/src/pages/Profile/components/ProfileHeader.tsx`
- `apps/web/src/pages/Profile/components/GeneralTab.tsx`
- Corresponding focused component tests and Profile page tests
- No API, persistence, or dependency changes
