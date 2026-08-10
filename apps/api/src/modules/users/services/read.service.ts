import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import type { UserSearchRecord } from "../types/users.types.js";

const usersSieve = createSieve(prisma.user);

/** Searches other users by name/email (case-insensitive substring match), excluding the caller. */
export async function searchUsers(
  excludeUserId: string,
  query: string,
  limit: number
) {
  const result = await usersSieve.query<UserSearchRecord>({
    where: {
      and: [
        { field: "id", op: "!=", value: excludeUserId },
        {
          or: [
            { field: "name", op: "ilike", value: query },
            { field: "email", op: "ilike", value: query }
          ]
        }
      ]
    },
    select: { id: true, name: true, email: true },
    sort: [
      { field: "name", direction: "asc" },
      { field: "email", direction: "asc" }
    ],
    pagination: { kind: "offset", page: 1, pageSize: limit }
  });
  return result.data;
}

/** Fetches a user by id; throws if the user doesn't exist. */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}
