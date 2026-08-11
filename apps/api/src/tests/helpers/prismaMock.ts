import type { PrismaClient } from "@prisma/client";
import { beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { prisma } from "../../db/prisma.js";

vi.mock("../../db/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>()
}));

/**
 * Deep-mocked `PrismaClient` swapped in for the real singleton (`src/db/prisma.ts`)
 * in every test file that imports this helper — service files under test still
 * `import { prisma } from "../../db/prisma.js"` unchanged, but that import
 * resolves to this mock. Reset automatically before every test via the
 * `beforeEach` registered below, so individual test files never need to reset
 * it themselves.
 */
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
