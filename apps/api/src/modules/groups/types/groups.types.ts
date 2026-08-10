import type { DataSieveQuery } from "datasieve";
import type { RawWhereNode } from "../../../db/sieve.types.js";

/** Plain domain shape for `Group`, written for datasieve's generic inference (`DataSieveQuery<GroupListRecord>`). */
export interface GroupListRecord {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Untrusted shape of the decoded `query` request param for `GET /groups`.
 * Membership scoping (`members: { some: { userId } }`) can't be expressed
 * in DSQL — see `read.service.ts`'s `getVisibleGroupIds` — so it's resolved
 * server-side before `where` is applied, same pattern as categories.
 */
export type GroupsQueryInput = {
  where?: RawWhereNode;
  sort?: DataSieveQuery<GroupListRecord>["sort"];
};
