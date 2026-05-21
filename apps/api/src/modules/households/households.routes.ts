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
import { getHouseholdAdmin, getHouseholdMembership } from "./households.service.js";

export const householdsRouter = Router();

const householdInclude = {
  members: {
    include: {
      user: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: "asc" as const }
  },
  categories: {
    orderBy: [{ type: "asc" as const }, { name: "asc" as const }]
  }
};

householdsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const households = await prisma.household.findMany({
      where: { members: { some: { userId: req.user!.id } } },
      include: householdInclude,
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
      include: householdInclude
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
        ...householdInclude,
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

    const member = await prisma.householdMember.create({
      data: {
        householdId,
        userId: req.body.userId,
        role: "member"
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    res.status(201).json({ member: serialize(member) });
  })
);

householdsRouter.post(
  "/:id/categories",
  validate(householdCategorySchema),
  asyncHandler(async (req, res) => {
    const householdId = req.params.id;
    if (!householdId) throw notFound("Household");

    await getHouseholdAdmin(req.user!.id, householdId);

    const category = await prisma.householdCategory.create({
      data: {
        householdId,
        name: req.body.name,
        type: req.body.type,
        color: req.body.color ?? null
      }
    });

    res.status(201).json({ category: serialize(category) });
  })
);
