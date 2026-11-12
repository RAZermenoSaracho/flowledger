import { prisma } from "../../../db/prisma.js";

type Visit = (node: Record<string, unknown>) => void;

function walk(value: unknown, visit: Visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (value === null || typeof value !== "object" || typeof (value as { toJSON?: unknown }).toJSON === "function") return;
  visit(value as Record<string, unknown>);
  Object.values(value).forEach((nested) => walk(nested, visit));
}

const sharedTransaction = (node: Record<string, unknown>) =>
  typeof node.ownerUserId === "string" &&
  node.transaction !== null &&
  typeof node.transaction === "object" &&
  typeof (node.transaction as Record<string, unknown>).groupId === "string"
    ? { ownerUserId: node.ownerUserId, transaction: node.transaction as Record<string, unknown> }
    : null;

/**
 * Nulls `transaction.groupId` on every shared expense inside `value` (mutating it) that `viewerUserId` does not own
 * and whose Group the viewer is not a member of, so a participant outside the Group never receives Group data.
 * Pass freshly loaded result objects only.
 */
export async function redactGroupForNonMembers<T>(viewerUserId: string, value: T): Promise<T> {
  const groupIds = new Set<string>();
  walk(value, (node) => {
    const shared = sharedTransaction(node);
    if (shared && shared.ownerUserId !== viewerUserId) groupIds.add(shared.transaction.groupId as string);
  });
  if (groupIds.size === 0) return value;

  const memberships = await prisma.groupMember.findMany({
    where: { userId: viewerUserId, groupId: { in: [...groupIds] } },
    select: { groupId: true }
  });
  const memberOf = new Set(memberships.map((membership) => membership.groupId));
  walk(value, (node) => {
    const shared = sharedTransaction(node);
    if (shared && shared.ownerUserId !== viewerUserId && !memberOf.has(shared.transaction.groupId as string)) {
      shared.transaction.groupId = null;
    }
  });
  return value;
}
