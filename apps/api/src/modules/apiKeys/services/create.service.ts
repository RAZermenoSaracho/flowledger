import type { CreateApiKeyInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { generateApiKey, publicApiKeySelect, resolveExpiresAt } from "../utils/apiKeys.js";

/** Creates an API key for `userId`; returns the public record plus the plaintext `key`, which is never retrievable again. */
export async function createApiKey(userId: string, input: CreateApiKeyInput) {
  const { key, hint, secretHash } = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name: input.name,
      hint,
      secretHash,
      scopes: input.allowWrite ? ["read", "write"] : ["read"],
      expiresAt: resolveExpiresAt(input.lifetime, new Date())
    },
    select: publicApiKeySelect
  });

  return { apiKey, key };
}
