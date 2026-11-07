import { badRequest } from "../utils/httpError.js";

const USER_RELATIONS = new Set(["user", "users", "owner"]);

/** Collects every `field`/`fields` path in a DSQL query, skipping filter values, which are data. */
export function queryFieldPaths(query: unknown): string[] {
  if (Array.isArray(query)) return query.flatMap(queryFieldPaths);
  if (typeof query !== "object" || query === null) return [];

  return Object.entries(query).flatMap(([key, value]) => {
    if (key === "value") return [];
    if (key === "field" && typeof value === "string") return [value];
    if (key === "fields" && Array.isArray(value)) {
      return value.filter((field): field is string => typeof field === "string");
    }
    return queryFieldPaths(value);
  });
}

/**
 * Rejects a query that reads another user's record or any stored hash through a relation path.
 * Filters and sorts reveal values even when the response omits them, because the rows that come back answer each guess.
 * @throws 400 for a blocked path.
 */
export function assertSafeQueryFields(query: unknown) {
  for (const path of queryFieldPaths(query)) {
    const segments = path.split(".");
    const blocked = segments.some(
      (segment) => USER_RELATIONS.has(segment) || /hash$/i.test(segment)
    );

    if (blocked) throw badRequest(`Field ${path} can't be queried`);
  }
}

/**
 * Rejects a query using any field outside `allowed`, for records that viewers other than the owner can list.
 * @throws 400 for a field that isn't listed.
 */
export function assertAllowedQueryFields(query: unknown, allowed: ReadonlySet<string>) {
  for (const path of queryFieldPaths(query)) {
    if (!allowed.has(path)) throw badRequest(`Field ${path} can't be queried`);
  }
}
