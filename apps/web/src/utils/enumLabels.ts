/** Formats a snake_case enum value as a human-readable, capitalized label (e.g. `"credit_card"` -> `"Credit card"`, `"income"` -> `"Income"`). */
export function formatEnumLabel(value: string): string {
  const withSpaces = value.replaceAll("_", " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}
