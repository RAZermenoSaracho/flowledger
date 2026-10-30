import { prisma } from "../../../db/prisma.js";
import { publicApiKeySelect } from "../utils/apiKeys.js";

/** Lists the user's own API keys, newest first, without secrets. */
export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: publicApiKeySelect,
    orderBy: { createdAt: "desc" }
  });
}
