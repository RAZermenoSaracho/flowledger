# Proposal

## Why

Three unrelated defects hurt daily use: filter chips cannot be removed from the keyboard, filter dropdowns are clipped by the page layout on short lists, and `SYNCFY_AUTO_SYNC_ENABLED=false` starts the Syncfy scheduler (KNOWN_ISSUES #027).

## What Changes

- **Chip removal:** In the `SearchBar` search input, Backspace on an empty input removes the last chip. A focused chip's remove button also responds to Backspace and Delete. Held-key repeats never remove chips, and each removal is announced.
- **Dropdown clipping:** `<main>` in `AppLayout` uses `overflow-x-hidden`, which forces its vertical overflow to `auto`, so it becomes a scroll container that clips absolutely positioned menus extending past a short page. Switch it to `overflow-x-clip` so no scroll container is created. This one change covers every list page.
- **Auto-sync flag:** Replace `z.coerce.boolean()` with an explicit parser. `true`/`1` enable, `false`/`0` or empty or unset disable, and anything else fails startup. Manual sync is unaffected.

## Capabilities

### New Capabilities

- `search-filter-chips`: Keyboard removal and announcement of active filter chips in `SearchBar`.
- `syncfy-auto-sync`: Configuration of the Syncfy background scheduler.

### Modified Capabilities

- `select-dropdowns`: Menus are never clipped by the page layout.

## Impact

- **Web:** `components/SearchBar.tsx`, `layout/AppLayout.tsx`.
- **API:** `config/env.ts`.
- **Docs:** `.env.example`, `README.md`, `docs/PROVIDER_SYNC.md`, `docs/KNOWN_ISSUES.md` (#027).
- **Out of scope:** `SearchComponent` has chips but no page renders it. Date and time filters are in `fix-transaction-date-display`. No new dependencies.
