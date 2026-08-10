import type { CategoryType } from "@prisma/client";
import type { DataSieveQuery } from "datasieve";
import type { RawWhereNode } from "../../../db/sieve.types.js";

/** Plain domain shape for `Category`, written for datasieve's generic inference (`DataSieveQuery<CategoryListRecord>`). */
export interface CategoryListRecord {
  id: string;
  groupId: string | null;
  name: string;
  type: CategoryType;
  color: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Untrusted shape of the decoded `query` request param for `GET /categories`.
 * `groupId`/`scope` stay outside this blob (see `read.service.ts`'s
 * `listCategories`) since they choose *which* categories are visible at
 * all (an authorization boundary, resolved via a precomputed id list —
 * DSQL can't express a `some` relation filter with a nested condition,
 * see the "membership" comment there) — `where`/`sort` only ever filter
 * within that already-resolved, already-authorized set.
 */
export type CategoriesQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<CategoryListRecord>["sort"];
};
