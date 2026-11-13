import type { ReactNode } from "react";

/** Field-level validation messages keyed by field name; nested rows use dotted keys such as `participants.2.share`. */
export type FormErrors = Record<string, string>;

/** Options for `useFormDraft`. */
export type UseFormDraftOptions<T extends object> = {
  /** Saved values the draft starts from; `null` while the entity is still loading. */
  initial: T | null;
  /** Returns an error per invalid field; any entry blocks `save`. */
  validate: (values: T) => FormErrors;
  /** Persists the draft (may run several requests); `changedKeys` lists the top-level keys that differ from `initial`. */
  save: (values: T, changedKeys: (keyof T & string)[]) => Promise<void>;
};

/** The state `FormView` reads from a draft; every `FormDraft` satisfies it. */
export type FormDraftControls = {
  isDirty: boolean;
  isSaving: boolean;
  /** Errors for touched fields (plus server errors); `FormView` disables Save while non-empty. */
  fieldErrors: FormErrors;
  saveError: string | null;
  save: () => Promise<void>;
  cancel: () => void;
};

/** Result of `useFormDraft`. */
export type FormDraft<T extends object> = FormDraftControls & {
  /** Current draft values; an empty object while `initial` is `null`. */
  values: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Applies a pure reducer so coupled fields change together; nothing is persisted. */
  update: (fn: (draft: T) => T) => void;
  /** Resets one field to its saved value. */
  revertField: (key: keyof T) => void;
  /** Top-level keys that differ from the saved values. */
  changedKeys: (keyof T & string)[];
};

/** One tab of a `FormView`; `content` is mounted only while the tab is active. */
export type FormViewTab = {
  id: string;
  label: string;
  badge?: ReactNode;
  content: ReactNode;
};

/** Props of `EditableField`. */
export type EditableFieldProps = {
  label: string;
  /** Keeps the label for assistive tech but hides it visually. */
  hideLabel?: boolean;
  error?: string;
  /** Renders plain text (`display`, else the children) instead of a control. */
  readOnly?: boolean;
  /** Plain-text value for the read-only variant. */
  display?: ReactNode;
  /** Whether this field differs from its saved value; shows the dirty marker and arms Escape. */
  dirty?: boolean;
  /** Called when Escape is pressed in a dirty field. */
  onRevert?: () => void;
  /** The control. A native element (`input`, `select`, `textarea`) gets the label, error and invalid wiring; a custom control must wire its own. */
  children?: ReactNode;
};

/** A column of a `RelatedList`. */
export type RelatedListColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
};

/** Props of `RelatedList`. */
export type RelatedListProps<Row> = {
  title: string;
  rows: Row[];
  /** Stable row key; use the client `tempId` for rows not yet saved. */
  rowKey: (row: Row) => string;
  columns: RelatedListColumn<Row>[];
  isLoading?: boolean;
  error?: string | null;
  emptyText: string;
  onAdd?: () => void;
  addLabel?: string;
  onRemove?: (row: Row) => void;
  /** Defaults to every row being removable. */
  canRemove?: (row: Row) => boolean;
  /** Rendered after the rows; hidden while loading, on error or when empty. */
  footer?: ReactNode;
  /** Rendered at the right of the title row, beside the add button (e.g. a pager). */
  headerActions?: ReactNode;
};

/** DataSieve offset pagination object sent as `pagination` in a list query. */
export type OffsetPagination = { kind: "offset"; page: number; pageSize: number };

/** DataSieve range pagination: the rows at positions `offset` to `offset + limit - 1` (zero-based `offset`). */
export type RangePagination = { kind: "range"; offset: number; limit: number };

/** One labelled section of a grouped `ListView`. */
export type ListGroup<T> = { key: string; label: ReactNode; items: T[] };

/**
 * Controlled state of the range pager. A server list sends `{kind:"range", offset, limit}` from it;
 * a client-side list can pass `total = items.length` and render `items.slice(offset, offset + limit)`.
 */
export type ListPagerState = {
  offset: number;
  limit: number;
  /** `null` while unknown; 0 hides the pager. */
  total: number | null;
  hasNext: boolean;
  isFetching: boolean;
  onRangeChange: (offset: number, limit: number) => void;
};

/** Selection state a `ListView` reads to render row checkboxes and the selection bar. */
export type ListSelection = {
  count: number;
  allMatching: boolean;
  /** Whether "Select all N matching" is offered once the whole window is selected. */
  canSelectAllMatching: boolean;
  /** Total matching rows, used in the "Select all N matching" label. */
  total?: number;
  isSelected: (id: string) => boolean;
  /** Toggles one row; while `allMatching`, falls back to `windowIds` minus `id`. */
  toggle: (id: string, windowIds?: string[]) => void;
  /** Selects or deselects every id of the visible window. */
  setWindow: (ids: string[], on: boolean) => void;
  selectAllMatching: () => void;
  clear: () => void;
};

/** Props of `ListView`: a model-agnostic list shell; rows come from `items` or `groups` (not both). */
export type ListViewProps<T> = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Rendered once below the header, never cloned (a re-created `SearchBar` would re-trigger its query callback). */
  toolbar?: ReactNode;
  items?: T[];
  groups?: ListGroup<T>[];
  /** Stable key per row. */
  rowKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Accessible name of a row's selection checkbox; defaults to "Select record N". */
  itemLabel?: (item: T) => string;
  layout?: "stack" | "grid";
  isLoading?: boolean;
  error?: string | null;
  emptyText: ReactNode;
  /** Total matching rows when larger than the rows shown (no-pager lists render "shown of total"). */
  total?: number;
  pager?: ListPagerState;
  selection?: ListSelection;
  /** Module buttons rendered in the selection bar. */
  bulkActions?: ReactNode;
};

/** Props of the controlled `Tabs` strip. `idPrefix` namespaces tab/panel ids (`${idPrefix}tab-${id}`) so several tab sets can share a page. */
export type TabsProps = {
  tabs: FormViewTab[];
  activeId: string;
  onSelect: (id: string) => void;
  idPrefix?: string;
  compact?: boolean;
};
