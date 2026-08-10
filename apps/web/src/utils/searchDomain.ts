// Generic, model-agnostic query domain for <SearchBar>/<FilterBuilder>
// (src/components/). Nothing in this file knows about any specific
// module's fields — every module passes its own SearchFieldConfig[]
// (field name/label/type/allowed operators/options) and gets an
// Odoo-style AND/OR condition tree compiled into a DSQL `where` tree.
//
/**
 * Every DSQL operator this UI can compose. Mirrors
 * `@razsdev/datasieve-query-language`'s own operator catalog (see that
 * package's `src/operators/operators.ts`) — this module never invents an
 * operator DSQL doesn't already define. `exists`/`notExists`/`childOf`/
 * `parentOf` are omitted: they're relation/hierarchy-only and don't apply
 * to the scalar-field search UI this powers.
 */
export type Operator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "notIn"
  | "like"
  | "ilike"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "between"
  | "isNull"
  | "isNotNull";

/** Human-readable label for each {@link Operator}, used when rendering a condition as a filter pill or dropdown option. */
export const OPERATOR_LABELS: Record<Operator, string> = {
  "=": "is",
  "!=": "is not",
  ">": "greater than",
  ">=": "at least",
  "<": "less than",
  "<=": "at most",
  in: "is any of",
  notIn: "is none of",
  like: "matches",
  ilike: "contains",
  contains: "contains",
  startsWith: "starts with",
  endsWith: "ends with",
  between: "is between",
  isNull: "is empty",
  isNotNull: "is not empty"
};

/**
 * UI-facing field type — every one of these maps to a DSQL-valid operator
 * subset (`OperatorsFor<V>` in datasieve-query-language). "enum" isn't a
 * distinct DSQL value type (an enum is just a string), but gets its own
 * curated operator set here since pattern-matching operators (contains/
 * startsWith/...) don't make sense against a closed value set.
 */
export type FieldType = "string" | "number" | "date" | "boolean" | "enum";

/** Default {@link Operator} choices offered per {@link FieldType}; a `SearchFieldConfig.ops` override replaces this. */
export const DEFAULT_OPERATORS_BY_TYPE: Record<FieldType, Operator[]> = {
  string: ["=", "!=", "ilike", "startsWith", "endsWith", "in", "notIn", "isNull", "isNotNull"],
  number: ["=", "!=", ">", ">=", "<", "<=", "between", "in", "notIn", "isNull", "isNotNull"],
  date: [">=", "<=", "between", "isNull", "isNotNull"],
  boolean: ["=", "!=", "isNull", "isNotNull"],
  enum: ["=", "!=", "in", "notIn", "isNull", "isNotNull"]
};

/** One selectable value for an enum/options-backed field's value picker. */
export type FieldOption = { label: string; value: string };

/** One module's declaration of a filterable/searchable field, passed to `<SearchBar>`/`<FilterBuilder>` to drive their field picker, operator choices, and value widget. */
export type SearchFieldConfig = {
  /** DSQL field path this condition filters on. */
  name: string;
  label: string;
  type: FieldType;
  /** Overrides the type's default operator set (see DEFAULT_OPERATORS_BY_TYPE). */
  ops?: Operator[];
  /** Renders the value picker as a select/checklist instead of free input. */
  options?: FieldOption[];
  /**
   * When present, a condition on this field compiles to an OR across
   * these real field names instead of `name` directly — e.g. a "Full
   * name" field spanning firstName/lastName. General-purpose; not used
   * by <SearchBar>'s quick-search box, which always targets one real
   * field (see its `defaultSearchField` prop).
   */
  expandsToFields?: string[];
};

/** A field offered in `<SearchBar>`'s "Group by" picker. */
export type GroupableField = { name: string; label: string };
/** A field offered in `<SearchBar>`'s "Sort by" picker. */
export type SortableField = { name: string; label: string };
export type SortDirection = "asc" | "desc";

/** Resolves the operator choices for a field: its own `ops` override, or the {@link FieldType}'s default set. */
export function operatorsForField(field: Pick<SearchFieldConfig, "type" | "ops">): Operator[] {
  return field.ops ?? DEFAULT_OPERATORS_BY_TYPE[field.type];
}

/**
 * The DSQL wire shape — mirrors `@razsdev/datasieve-query-language`'s
 * `WhereInput<T>` one-to-one, just without compile-time field-path typing
 * (this module has no single `T`; each consumer's fields are typed only
 * via `SearchFieldConfig.name` being a plain string).
 */
export type WhereCondition = { field: string; op: string; value?: unknown };
/** A DSQL `where` tree: {@link WhereCondition} leaves combined with unbounded AND/OR/NOT nesting. */
export type WhereNode =
  | WhereCondition
  | { and: WhereNode[] }
  | { or: WhereNode[] }
  | { not: WhereNode };

/** A condition's raw value: multi-select fields use `string[]`, a single value (incl. each "between" bound individually) uses `string`, and "between" as a whole uses `[string, string]`. */
export type ConditionValue = string[] | string | [string, string];

// --- Domain tree: leaf conditions + unbounded AND/OR nesting -------------

/** One leaf condition in the editable domain tree `<FilterBuilder>` renders and edits — compiles to a {@link WhereCondition} via {@link domainToWhere}. */
export type DomainConditionNode = {
  type: "condition";
  id: string;
  fieldName: string;
  operator: Operator;
  value: ConditionValue;
};

/** One AND/OR group in the editable domain tree, holding conditions and/or nested groups. */
export type DomainGroupNode = {
  type: "group";
  id: string;
  connector: "and" | "or";
  children: DomainNode[];
};

export type DomainNode = DomainConditionNode | DomainGroupNode;

function makeId() {
  return Math.random().toString(36).slice(2);
}

/** Creates an empty root/nested group for a new domain tree or a new nested AND/OR group. */
export function createEmptyGroup(connector: "and" | "or" = "and"): DomainGroupNode {
  return { type: "group", id: makeId(), connector, children: [] };
}

/** Chooses the initial value for a new condition on `field` with `operator`, matching whatever the value widget will show as already-selected (so the condition doesn't read as incomplete before the user touches it). */
export function defaultValueForField(
  field: Pick<SearchFieldConfig, "type" | "options">,
  operator: Operator
): ConditionValue {
  if (field.options && (operator === "in" || operator === "notIn")) return [];
  if (operator === "between") return ["", ""];
  if (field.options) return field.options[0]?.value ?? "";
  // FilterBuilder's boolean picker has no blank option (just True/False),
  // so the default must match what it visually shows first — otherwise
  // the condition would report incomplete (empty value) until the user
  // touches a control that already looks selected.
  if (field.type === "boolean") return "true";
  return "";
}

/** Creates a new condition node on `field`, defaulting to its first available operator and that operator's default value. */
export function createCondition(field: SearchFieldConfig): DomainConditionNode {
  const operator = operatorsForField(field)[0]!;
  return {
    type: "condition",
    id: makeId(),
    fieldName: field.name,
    operator,
    value: defaultValueForField(field, operator)
  };
}

/**
 * Builds one ordinary condition node with an explicit operator/value —
 * used by `<SearchBar>`'s quick-search box to add a `<defaultSearchField>
 * <op> <text>` condition on Enter. Nothing distinguishes the result from
 * a condition added through `<FilterBuilder>`; it's the same node shape.
 */
export function createConditionWithValue(
  fieldName: string,
  operator: Operator,
  value: ConditionValue
): DomainConditionNode {
  return { type: "condition", id: makeId(), fieldName, operator, value };
}

/** Whether a condition has everything it needs to compile to a `where` leaf. `isNull`/`isNotNull` (DSQL's `NoValueOperator`s) are always complete regardless of `value`, since the UI never asks for one for those two operators. */
export function isValueComplete(operator: Operator, value: ConditionValue): boolean {
  if (operator === "isNull" || operator === "isNotNull") return true;
  if (Array.isArray(value)) {
    return value.length === 2
      ? value.every((entry) => entry !== "")
      : value.length > 0;
  }
  return value !== "";
}

// Every tree-editing helper below is immutable (returns a new root),
// matching React state-update conventions.

/** Replaces the node with id `nodeId` anywhere in the tree via `updater`, returning a new root. */
export function updateNode(
  root: DomainGroupNode,
  nodeId: string,
  updater: (node: DomainNode) => DomainNode
): DomainGroupNode {
  function walk(node: DomainNode): DomainNode {
    if (node.id === nodeId) return updater(node);
    if (node.type === "group") return { ...node, children: node.children.map(walk) };
    return node;
  }
  return walk(root) as DomainGroupNode;
}

/** Removes the node with id `nodeId` anywhere in the tree, returning a new root. */
export function removeNode(root: DomainGroupNode, nodeId: string): DomainGroupNode {
  function walk(node: DomainGroupNode): DomainGroupNode {
    return {
      ...node,
      children: node.children
        .filter((child) => child.id !== nodeId)
        .map((child) => (child.type === "group" ? walk(child) : child))
    };
  }
  return walk(root);
}

/** Appends `child` to the group with id `parentId` anywhere in the tree, returning a new root. */
export function addChild(root: DomainGroupNode, parentId: string, child: DomainNode): DomainGroupNode {
  function walk(node: DomainGroupNode): DomainGroupNode {
    if (node.id === parentId) return { ...node, children: [...node.children, child] };
    return { ...node, children: node.children.map((c) => (c.type === "group" ? walk(c) : c)) };
  }
  return walk(root);
}

/** Counts leaf condition nodes anywhere under `node` (groups don't count themselves). */
export function countConditions(node: DomainNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((sum, child) => sum + countConditions(child), 0);
}

// --- Compiling a domain tree into a DSQL `where` tree ---------------------

function conditionToWhere(
  node: DomainConditionNode,
  fields: SearchFieldConfig[]
): WhereNode | undefined {
  if (!isValueComplete(node.operator, node.value)) return undefined;

  const field = fields.find((entry) => entry.name === node.fieldName);
  const targetFields = field?.expandsToFields ?? [node.fieldName];
  const isNumber = field?.type === "number";
  const isBoolean = field?.type === "boolean";

  function leafFor(targetField: string): WhereNode {
    // isNull/isNotNull are DSQL's NoValueOperator — the condition shape
    // never includes a `value` key at all, not even an empty one.
    if (node.operator === "isNull" || node.operator === "isNotNull") {
      return { field: targetField, op: node.operator };
    }

    if (node.operator === "between") {
      const [from, to] = node.value as [string, string];
      return {
        field: targetField,
        op: "between",
        value: [isNumber ? Number(from) : from, isNumber ? Number(to) : to]
      };
    }

    if (node.operator === "in" || node.operator === "notIn") {
      return { field: targetField, op: node.operator, value: node.value as string[] };
    }

    // FilterBuilder's boolean value-picker is a <select> — its options'
    // `value`s are always the strings "true"/"false", never real
    // booleans (DOM select values are always strings). Coerce here so a
    // real Boolean-typed backend field (e.g. `isArchived`) gets an actual
    // boolean, not the string "true"/"false" (which would silently match
    // nothing against a Prisma Boolean column).
    const scalar = isNumber
      ? Number(node.value as string)
      : isBoolean
        ? node.value === "true"
        : node.value;
    return { field: targetField, op: node.operator, value: scalar };
  }

  if (targetFields.length === 1) return leafFor(targetFields[0]!);
  return { or: targetFields.map(leafFor) };
}

/** Compiles a domain tree (or subtree) into a DSQL `where` tree, dropping incomplete conditions and collapsing single-child groups. Returns `undefined` for an empty/all-incomplete tree. */
export function domainToWhere(
  node: DomainNode,
  fields: SearchFieldConfig[]
): WhereNode | undefined {
  if (node.type === "condition") return conditionToWhere(node, fields);

  const childWheres = node.children
    .map((child) => domainToWhere(child, fields))
    .filter((where): where is WhereNode => where !== undefined);

  if (childWheres.length === 0) return undefined;
  if (childWheres.length === 1) return childWheres[0];
  return node.connector === "and" ? { and: childWheres } : { or: childWheres };
}

// --- Evaluating a compiled `where` tree against already-fetched data ------
//
// For lists that are a small, already-computed/aggregated payload with no
// backend query capability of their own (e.g. Debts' balances/pending/
// settled tabs — server-computed aggregates, not raw rows a backend DSQL
// query could filter), SearchBar's compiled `where` tree can be evaluated
// directly against the in-memory array instead of being forwarded to a
// request. Every operator mirrors conditionToWhere's own compilation so
// behavior matches what a backend datasieve query would do for the same
// condition.

function readFieldValue(item: Record<string, unknown>, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      item
    );
}

function matchesCondition(
  item: Record<string, unknown>,
  condition: WhereCondition
): boolean {
  const actual = readFieldValue(item, condition.field);

  switch (condition.op) {
    case "isNull":
      return actual === null || actual === undefined;
    case "isNotNull":
      return actual !== null && actual !== undefined;
    case "=":
      return actual === condition.value;
    case "!=":
      return actual !== condition.value;
    case ">":
      return (
        typeof actual === "number" && actual > (condition.value as number)
      );
    case ">=":
      return (
        typeof actual === "number" && actual >= (condition.value as number)
      );
    case "<":
      return (
        typeof actual === "number" && actual < (condition.value as number)
      );
    case "<=":
      return (
        typeof actual === "number" && actual <= (condition.value as number)
      );
    case "between": {
      if (actual === null || actual === undefined) return false;
      const [from, to] = condition.value as [number, number];
      return (actual as number) >= from && (actual as number) <= to;
    }
    case "in":
      return (
        Array.isArray(condition.value) &&
        (condition.value as unknown[]).includes(actual)
      );
    case "notIn":
      return (
        Array.isArray(condition.value) &&
        !(condition.value as unknown[]).includes(actual)
      );
    case "like":
    case "ilike":
    case "contains":
      return (
        typeof actual === "string" &&
        actual.toLowerCase().includes(String(condition.value).toLowerCase())
      );
    case "startsWith":
      return (
        typeof actual === "string" &&
        actual.toLowerCase().startsWith(String(condition.value).toLowerCase())
      );
    case "endsWith":
      return (
        typeof actual === "string" &&
        actual.toLowerCase().endsWith(String(condition.value).toLowerCase())
      );
    default:
      return true;
  }
}

/** Evaluates a compiled `where` tree against one already-fetched, plain-object row — see header comment above. */
export function matchesWhere(
  item: Record<string, unknown>,
  where: WhereNode | undefined
): boolean {
  if (!where) return true;
  if ("and" in where) return where.and.every((child) => matchesWhere(item, child));
  if ("or" in where) return where.or.some((child) => matchesWhere(item, child));
  if ("not" in where) return !matchesWhere(item, where.not);
  return matchesCondition(item, where);
}

// --- Human-readable summaries (pills/tooltips) -----------------------------

/** Renders a condition's operator + value as human-readable text (e.g. "is at least 100"), resolving option values to their labels. */
export function conditionValueText(field: SearchFieldConfig, node: DomainConditionNode): string {
  const operatorLabel = OPERATOR_LABELS[node.operator] ?? node.operator;

  if (Array.isArray(node.value) && node.value.length === 2 && node.operator === "between") {
    return `${operatorLabel} ${node.value[0]} and ${node.value[1]}`;
  }

  if (Array.isArray(node.value)) {
    const labels = node.value.map(
      (value) => field.options?.find((option) => option.value === value)?.label ?? value
    );
    return `${operatorLabel} ${labels.join(", ")}`;
  }

  const label = field.options?.find((option) => option.value === node.value)?.label ?? node.value;
  return `${operatorLabel} ${label}`;
}

/** Renders a domain (sub)tree as one human-readable summary line (e.g. "(Status is pending) AND (Amount is at least 100)"), for a filter pill or tooltip. */
export function domainToSummaryText(node: DomainNode, fields: SearchFieldConfig[]): string {
  if (node.type === "condition") {
    const field = fields.find((entry) => entry.name === node.fieldName);
    if (!field) return "";
    return `${field.label} ${conditionValueText(field, node)}`;
  }

  const parts = node.children
    .map((child) => domainToSummaryText(child, fields))
    .filter((text) => text.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.map((part) => `(${part})`).join(node.connector === "and" ? " AND " : " OR ");
}
