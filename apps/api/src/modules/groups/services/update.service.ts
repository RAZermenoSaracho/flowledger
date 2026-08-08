import { prisma } from "../../../db/prisma.js";
import { groupInclude } from "../utils/groupInclude.js";
import { getGroupAdmin } from "./read.service.js";

/** Updates a group's name/description; requires `userId` to be a group admin. */
export async function updateGroup(
  userId: string,
  groupId: string,
  input: { name?: string; description?: string | null }
) {
  await getGroupAdmin(userId, groupId);

  return prisma.group.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {})
    },
    include: groupInclude(userId)
  });
}

/** Marks a group archived; requires `userId` to be a group admin. */
export async function archiveGroup(userId: string, groupId: string) {
  await getGroupAdmin(userId, groupId);

  return prisma.group.update({
    where: { id: groupId },
    data: { isArchived: true, archivedAt: new Date() },
    include: groupInclude(userId)
  });
}

/** Un-archives a group; requires `userId` to be a group admin. */
export async function restoreGroup(userId: string, groupId: string) {
  await getGroupAdmin(userId, groupId);

  return prisma.group.update({
    where: { id: groupId },
    data: { isArchived: false, archivedAt: null },
    include: groupInclude(userId)
  });
}
