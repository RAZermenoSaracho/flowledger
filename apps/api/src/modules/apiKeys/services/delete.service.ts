import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

/** Revokes the user's own key immediately; idempotent when already revoked, 404 when the key is not theirs. */
export async function revokeApiKey(userId: string, id: string) {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  if (count === 0) {
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
      select: { id: true }
    });
    if (!existing) throw notFound("API key");
  }
}
