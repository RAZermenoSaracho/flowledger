# Design

## Context

- `SearchBar` keeps chips as `domain.children` plus `groupBys`, rendered in one row before the `type="search"` input. `SearchComponent` has a similar row but no page renders it.
- `AppLayout.tsx:56` puts `overflow-x-hidden overflow-y-visible` on `<main>`. Per the CSS overflow spec, `visible` paired with a non-visible axis computes to `auto`, so the existing code comment is wrong and `<main>` is a scroll container sized to its in-flow content. The filter panel is `absolute top-full`, so on a short page it extends past `<main>`'s padding box and is clipped behind an inner scrollbar. No other ancestor between the panel and `<main>` clips: `Card`, `PageHeader` and `SearchBar`'s container have no overflow, and the clipping `overflow-hidden` in `SearchBar` wraps only the input row. All of Accounts, Transactions (including Imported), Categories, Groups, Shared Expenses and Debts render through `<main>`.
- `SYNCFY_AUTO_SYNC_ENABLED` is the only boolean env var (grep of `z.coerce.boolean` and `z.boolean` in `apps/api/src` finds no other). Only `getSyncfyAutoSyncSchedulerConfig` reads it; `resyncSyncfyConnection` and the webhook path do not.

## Decisions

**Chips: Backspace-removes-last, as in MUI Autocomplete and Gmail.** Conditions are met when the input value is empty (so the caret is at the start), `event.repeat` is false, no modifier is held, and `isComposing` is false. Removal is immediate with no select-then-delete step, because chips are individually restorable and `Clear all` already exists. Repeats are ignored so a held key cannot wipe every filter.

**Delete does nothing in the input.** Chips sit before the caret, so forward-delete has no target. MUI removes the first chip here, which surprises users. Delete and Backspace act on a chip only when its remove button has focus.

**Focus and announcement.** The input keeps focus after Backspace removal. After removing a focused chip, focus moves to the input, or to the menu button when the bar has no input, because the removed button leaves the DOM. A visually hidden `role="status"` element in `SearchBar` is set to "Removed {text} filter". Every removal path calls one local `removeChip(id)`, so pointer and keyboard behave identically.

**Layout: `overflow-x-clip` on `<main>`.** `clip` does not create a scroll container and leaves the other axis `visible`, so menus can overflow `<main>` and the document scrolls normally. The `Card` `min-w-0` already prevents grid blowout; `clip` keeps the intent of `overflow-x-hidden` (no horizontal page scroll). Tailwind 3.4 ships the class. Alternatives: portal the menu (new component and positioning code, rejected) or add per-page bottom padding (a page hack, rejected). Safari before 16 ignores `overflow-x: clip` and shows horizontal overflow only if some content exceeds the width, which the audit found none do.

**Boolean parsing: one private helper in `env.ts`.** `z.preprocess` trims and lowercases and turns `""` into `undefined`, then `z.enum(["true","false","1","0"]).default("false")` is transformed to a boolean. Invalid values fail like any other env error. With one boolean today, the helper is not exported; the next flag reuses it in the same file.

## Risks / Trade-offs

- [Backspace on empty input now deletes data] → Mitigated by repeat guard, announcement, and the existing Clear all.
- [jsdom cannot measure layout] → Unit test asserts the class contract; browser QA checks the real clipping on Accounts and Transactions with empty lists.
- [`.env` files that set the flag to `yes` now fail startup] → Intended. Accepted values are documented, and the repo's `.env.example` already uses `true`.
