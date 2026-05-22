import {
  householdCategorySchema,
  householdMemberSchema,
  householdSchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import { createNotifications } from "../notifications/notifications.service.js";
import {
  getHouseholdAdmin,
  getHouseholdMembership,
  grantHouseholdCategoriesToUser,
  revokeHouseholdCategoriesFromUser
} from "./households.service.js";

export const householdsRouter = Router();

function householdInclude(userId: string) {
  return {
    members: {
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "asc" as const }
    },
    categories: {
      where: { users: { some: { userId } } },
      orderBy: [{ type: "asc" as const }, { name: "asc" as const }]
    }
  };
}

householdsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const households = await prisma.household.findMany({
      where: { members: { some: { userId: req.user!.id } } },
      include: householdInclude(req.user!.id),
      orderBy: { createdAt: "desc" }
    });

    res.json({ households: serialize(households) });
  })
);

householdsRouter.post(
  "/",
  validate(householdSchema),
  asyncHandler(async (req, res) => {
    const household = await prisma.household.create({
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
      include: householdInclude(req.user!.id)
    });

    res.status(201).json({ household: serialize(household) });
  })
);

householdsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await getHouseholdMembership(req.user!.id, req.params.id);

    const household = await prisma.household.findUnique({
      where: { id: req.params.id },
      include: {
        ...householdInclude(req.user!.id),
        transactions: {
          where: { userId: req.user!.id },
          include: { account: true, category: true, householdCategory: true },
          orderBy: { date: "desc" },
          take: 25
        }
      }
    });

    if (!household) throw notFound("Household");
    res.json({ household: serialize(household) });
  })
);

householdsRouter.post(
  "/:id/members",
  validate(householdMemberSchema),
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    if (!householdId) throw notFound("Household");

    await getHouseholdAdmin(req.user!.id, householdId);

    if (req.body.userId === req.user!.id) {
      throw new HttpError(400, "You are already a household member");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.body.userId },
      select: { id: true }
    });
    if (!user) throw new HttpError(400, "User does not exist");

    const existingMember = await prisma.householdMember.findUnique({
      where: {
          householdId_userId: {
          householdId,
          userId: req.body.userId
        }
      }
    });
    if (existingMember) {
      throw new HttpError(409, "User is already a household member");
    }

    const member = await prisma.$transaction(async (tx) => {
      const household = await tx.household.findUnique({
        where: { id: householdId },
        select: { id: true, name: true }
      });
      if (!household) throw notFound("Household");

      const createdMember = await tx.householdMember.create({
        data: {
          householdId,
          userId: req.body.userId,
          role: "member"
        },
        include: { user: { select: { id: true, name: true, email: true } } }
      });

      await grantHouseholdCategoriesToUser(tx, householdId, req.body.userId);

      await createNotifications(tx, [
        {
          userId: req.body.userId,
          type: "household_member_added",
          title: "Added to household",
          message: `You were added to ${household.name}.`,
          metadata: { householdId: household.id }
        }
      ]);

      return createdMember;
    });

    res.status(201).json({ member: serialize(member) });
  })
);

householdsRouter.delete(
  "/:id/members/:userId",
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    const memberUserId = req.params.userId;
    if (!householdId || !memberUserId) throw notFound("Household");

    if (memberUserId !== req.user!.id) {
      await getHouseholdAdmin(req.user!.id, householdId);
    } else {
      await getHouseholdMembership(req.user!.id, householdId);
    }

    const member = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: memberUserId } }
    });
    if (!member) throw notFound("Household member");

    await prisma.$transaction(async (tx) => {
      await revokeHouseholdCategoriesFromUser(tx, householdId, memberUserId);
      await tx.householdMember.delete({ where: { id: member.id } });
    });

    res.status(204).send();
  })
);

householdsRouter.post(
  "/:id/categories",
  validate(householdCategorySchema),
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    if (!householdId) throw notFound("Household");

    await getHouseholdAdmin(req.user!.id, householdId);

    const category = await prisma.$transaction(async (tx) => {
      const members = await tx.householdMember.findMany({
        where: { householdId },
        select: { userId: true }
      });

      return tx.category.create({
        data: {
          householdId,
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
