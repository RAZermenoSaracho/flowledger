-- Move household categories into the shared Category table while preserving IDs.
ALTER TABLE "Category" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Category" ALTER COLUMN "userId" DROP NOT NULL;

INSERT INTO "Category" ("id", "userId", "householdId", "name", "type", "color", "createdAt", "updatedAt")
SELECT
  "id",
  NULL,
  "householdId",
  "name",
  "type",
  "color",
  "createdAt",
  "updatedAt"
FROM "HouseholdCategory"
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" WHERE "Category"."id" = "HouseholdCategory"."id"
);

ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_householdCategoryId_fkey";
ALTER TABLE "HouseholdCategory" DROP CONSTRAINT "HouseholdCategory_householdId_fkey";

CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");

ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_householdCategoryId_fkey"
  FOREIGN KEY ("householdCategoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "HouseholdCategory";
