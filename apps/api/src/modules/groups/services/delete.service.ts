import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { getGroupAdmin, getGroupMembership } from "./read.service.js";

/** Removes a departing member's `CategoryUser` access to all of the group's categories. */
export async function revokeGroupCategoriesFromUser(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string
) {
  await tx.categoryUser.deleteMany({
    where: {
      userId,
      category: { groupId }
    }
  });
}

/** Deletes a group; requires `userId` to be a group admin. */
export async function deleteGroup(userId: string, groupId: string) {
  await getGroupAdmin(userId, groupId);
  await prisma.group.delete({ where: { id: groupId } });
}

/** Removes a member from a group and revokes their category access; a member may remove themself, otherwise `userId` must be a group admin. */
export async function removeGroupMember(
  userId: string,
  groupId: string,
  memberUserId: string
) {
  if (memberUserId !== userId) {
    await getGroupAdmin(userId, groupId);
  } else {
    await getGroupMembership(userId, groupId);
  }

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: memberUserId } }
  });
  if (!member) throw notFound("Group member");

  await prisma.$transaction(async (tx) => {
    await revokeGroupCategoriesFromUser(tx, groupId, memberUserId);
    await tx.groupMember.delete({ where: { id: member.id } });
  });
}
