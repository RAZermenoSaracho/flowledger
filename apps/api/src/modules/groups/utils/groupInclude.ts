/**
 * Prisma-native `include` for a single group fetch (`getGroupById`, a plain
 * `prisma.group.findUnique` call — not run through datasieve). Loads
 * members and the group's *active* categories that `userId` personally has
 * access to. This backs places that need "what categories can this group's
 * transactions use" (e.g. the transaction form's category picker), not the
 * Group detail page's own filtered/sorted category list — that's a
 * separate, full-DSQL `listCategories({ groupId })` call (see
 * GroupCategoriesSection.tsx).
 */
export function groupInclude(userId: string) {
  return {
    members: {
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "asc" as const }
    },
    categories: {
      where: {
        users: { some: { userId } },
        isArchived: false
      },
      orderBy: [{ type: "asc" as const }, { name: "asc" as const }]
    }
  };
}

/**
 * DSQL-shaped `include` for the groups LIST query (`listGroups`, run
 * through datasieve). datasieve's `include` takes its own `where`/`sort`
 * shape (see `@razsdev/datasieve-query-language`'s `RelationIncludeOptions`)
 * — passing `groupInclude`'s raw Prisma `where`/`orderBy` here crashes
 * datasieve's translator (it tries to parse Prisma's `{ some: {...} } }`
 * shape as a DSQL condition node). `members` nests its own `user` relation
 * the same way `groupInclude` does — `GroupsPage.tsx` falls back to this
 * list-query result while the detail-view `getGroupById` fetch for the
 * selected group is still loading, so a plain `members: true` here (no
 * nested `user`) meant `member.user` was briefly `undefined` on every
 * member row and crashed `GroupMembersSection.tsx`'s `member.user.name`.
 * Categories are still only used for their `.length` on the list (a
 * sidebar count, not the detail view), so this intentionally doesn't also
 * resolve per-user category visibility — unlike `groupInclude` above, it's
 * just "active categories in this group," which is fine for a cosmetic
 * count.
 */
export function groupListInclude() {
  return {
    members: {
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      sort: [{ field: "createdAt", direction: "asc" as const }]
    },
    categories: {
      where: { field: "isArchived", op: "=" as const, value: false },
      sort: [
        { field: "type", direction: "asc" as const },
        { field: "name", direction: "asc" as const }
      ]
    }
  };
}
