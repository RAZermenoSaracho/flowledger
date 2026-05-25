-- Replace Category.userId ownership with explicit Category <-> User memberships.
CREATE TABLE "CategoryUser" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CategoryUser_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CategoryUser" ("id", "categoryId", "userId", "createdAt")
SELECT
  'legacy_' || "Category"."id" || '_' || "Category"."userId",
  "Category"."id",
  "Category"."userId",
  CURRENT_TIMESTAMP
FROM "Category"
WHERE "Category"."userId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "CategoryUser" ("id", "categoryId", "userId", "createdAt")
SELECT
  'household_' || "Category"."id" || '_' || "HouseholdMember"."userId",
  "Category"."id",
  "HouseholdMember"."userId",
  CURRENT_TIMESTAMP
FROM "Category"
JOIN "HouseholdMember" ON "HouseholdMember"."householdId" = "Category"."householdId"
WHERE "Category"."householdId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CategoryUser"
    WHERE "CategoryUser"."categoryId" = "Category"."id"
      AND "CategoryUser"."userId" = "HouseholdMember"."userId"
  )
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "CategoryUser_categoryId_userId_key" ON "CategoryUser"("categoryId", "userId");
CREATE INDEX "CategoryUser_userId_idx" ON "CategoryUser"("userId");

ALTER TABLE "CategoryUser" ADD CONSTRAINT "CategoryUser_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryUser" ADD CONSTRAINT "CategoryUser_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_userId_fkey";
DROP INDEX IF EXISTS "Category_userId_idx";
ALTER TABLE "Category" DROP COLUMN "userId";
