import { prisma } from "../../../../../db/prisma.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { SyncfyUser } from "../types/syncfy.types.js";
import {
  createSyncfyUser,
  fetchSyncfyUserByExternalId
} from "../syncfy.client.js";

async function saveSyncfyUserMapping(input: {
  flowLedgerUserId: string;
  email: string;
  syncfyUser: SyncfyUser;
}) {
  await prisma.userAuthAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: "syncfy",
        providerAccountId: input.syncfyUser.idUser
      }
    },
    create: {
      userId: input.flowLedgerUserId,
      provider: "syncfy",
      providerAccountId: input.syncfyUser.idUser,
      email: input.email
    },
    update: {
      userId: input.flowLedgerUserId,
      email: input.email
    }
  });
}

export async function getOrCreateSyncfyUserForFlowLedgerUser(
  flowLedgerUserId: string
) {
  const flowLedgerUser = await prisma.user.findUnique({
    where: { id: flowLedgerUserId },
    select: { id: true, email: true, name: true }
  });

  if (!flowLedgerUser) {
    throw new HttpError(404, "FlowLedger user was not found");
  }

  const existingMapping = await prisma.userAuthAccount.findFirst({
    where: {
      userId: flowLedgerUser.id,
      provider: "syncfy"
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingMapping) {
    return {
      idUser: existingMapping.providerAccountId,
      externalUserId: flowLedgerUser.id,
      name: flowLedgerUser.name,
      rawData: {}
    } satisfies SyncfyUser;
  }

  const existingSyncfyUser = await fetchSyncfyUserByExternalId(
    flowLedgerUser.id
  );

  const syncfyUser =
    existingSyncfyUser ??
    (await createSyncfyUser({
      externalUserId: flowLedgerUser.id,
      name: flowLedgerUser.name
    }));

  await saveSyncfyUserMapping({
    flowLedgerUserId: flowLedgerUser.id,
    email: flowLedgerUser.email,
    syncfyUser
  });

  return syncfyUser;
}
