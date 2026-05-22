import {
  groupFiltersSchema,
  groupCategorySchema,
  groupMemberSchema,
  groupSchema,
  updateGroupSchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import { createNotifications } from "../notifications/notifications.service.js";
import {
  getGroupAdmin,
  getGroupMembership,
  grantGroupCategoriesToUser,
  revokeGroupCategoriesFromUser
} from "./groups.service.js";

export const groupsRouter = Router();

function groupInclude(userId: string, includeArchivedCategories = false) {
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
        ...(includeArchivedCategories ? {} : { isArchived: false })
      },
      orderBy: [{ type: "asc" as const }, { name: "asc" as const }]
    }
  };
}

groupsRouter.get(
  "/",
  validate(groupFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as { includeArchived?: string };
    const groups = await prisma.group.findMany({
      where: {
        members: { some: { userId: req.user!.id } },
        ...(filters.includeArchived === "true" ? {} : { isArchived: false })
      },
      include: groupInclude(req.user!.id),
      orderBy: { createdAt: "desc" }
    });

    res.json({ groups: serialize(groups) });
  })
);

groupsRouter.post(
  "/",
  validate(groupSchema),
  asyncHandler(async (req, res) => {
    const group = await prisma.group.create({
      data: {
        name: req.body.name,
        description: req.body.description ?? null,
        ownerUserId: req.user!.id,
        members: {
          create: {
            userId: req.user!.id,
            role: "admin"
          }
        }
      },
      include: groupInclude(req.user!.id)
    });

    res.status(201).json({ group: serialize(group) });
  })
);

groupsRouter.put(
  "/:id",
  validate(updateGroupSchema),
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);

    const group = await prisma.group.update({
      where: { id: groupId },
      data: {
        ...(req.body.name !== undefined ? { name: req.body.name } : {}),
        ...(req.body.description !== undefined
          ? { description: req.body.description ?? null }
          : {})
      },
      include: groupInclude(req.user!.id)
    });

    res.json({ group: serialize(group) });
  })
);

groupsRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { isArchived: true, archivedAt: new Date() },
      include: groupInclude(req.user!.id)
    });

    res.json({ group: serialize(group) });
  })
);

groupsRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { isArchived: false, archivedAt: null },
      include: groupInclude(req.user!.id)
    });

    res.json({ group: serialize(group) });
  })
);

groupsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await getGroupMembership(req.user!.id, req.params.id);
    const includeArchivedCategories =
      req.query.includeArchivedCategories === "true";

    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        ...groupInclude(req.user!.id, includeArchivedCategories),
        transactions: {
          where: { userId: req.user!.id },
          include: { account: true, category: true, groupCategory: true },
          orderBy: { date: "desc" },
          take: 25
        }
      }
    });

    if (!group) throw notFound("Group");
    res.json({ group: serialize(group) });
  })
);

groupsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);
    await prisma.group.delete({ where: { id: groupId } });
    res.status(204).send();
  })
);

groupsRouter.post(
  "/:id/members",
  validate(groupMemberSchema),
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);

    if (req.body.userId === req.user!.id) {
      throw new HttpError(400, "You are already a group member");
    }

    const existingGroup = await prisma.group.findUnique({
      where: { id: groupId },
      select: { isArchived: true }
    });
    if (!existingGroup) throw notFound("Group");
    if (existingGroup.isArchived) {
      throw new HttpError(400, "Archived groups cannot add members");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.body.userId },
      select: { id: true }
    });
    if (!user) throw new HttpError(400, "User does not exist");

    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.body.userId
        }
      }
    });
    if (existingMember) {
      throw new HttpError(409, "User is already a group member");
    }

    const member = await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true }
      });
      if (!group) throw notFound("Group");

      const createdMember = await tx.groupMember.create({
        data: {
          groupId,
          userId: req.body.userId,
          role: "member"
        },
        include: { user: { select: { id: true, name: true, email: true } } }
      });

      await grantGroupCategoriesToUser(tx, groupId, req.body.userId);

      await createNotifications(tx, [
        {
          userId: req.body.userId,
          type: "group_member_added",
          title: "Added to group",
          message: `You were added to ${group.name}.`,
          metadata: { groupId: group.id }
        }
      ]);

      return createdMember;
    });

    res.status(201).json({ member: serialize(member) });
  })
);

groupsRouter.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    const memberUserId = req.params.userId;
    if (!groupId || !memberUserId) throw notFound("Group");

    if (memberUserId !== req.user!.id) {
      await getGroupAdmin(req.user!.id, groupId);
    } else {
      await getGroupMembership(req.user!.id, groupId);
    }

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: memberUserId } }
    });
    if (!member) throw notFound("Group member");

    await prisma.$transaction(async (tx) => {
      await revokeGroupCategoriesFromUser(tx, groupId, memberUserId);
      await tx.groupMember.delete({ where: { id: member.id } });
    });

    res.status(204).send();
  })
);

groupsRouter.post(
  "/:id/categories",
  validate(groupCategorySchema),
  asyncHandler(async (req, res) => {
    const groupId = req.params.id;
    if (!groupId) throw notFound("Group");

    await getGroupAdmin(req.user!.id, groupId);

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { isArchived: true }
    });
    if (!group) throw notFound("Group");
    if (group.isArchived) {
      throw new HttpError(400, "Archived groups cannot add categories");
    }

    const category = await prisma.$transaction(async (tx) => {
      const members = await tx.groupMember.findMany({
        where: { groupId },
        select: { userId: true }
      });

      return tx.category.create({
        data: {
          groupId,
          name: req.body.name,
          type: req.body.type,
          color: req.body.color ?? null,
          users: {
            create: members.map((member) => ({ userId: member.userId }))
          }
        }
      });
    });

    res.status(201).json({ category: serialize(category) });
  })
);
