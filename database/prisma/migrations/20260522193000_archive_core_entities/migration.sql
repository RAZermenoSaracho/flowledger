-- Add soft-archive lifecycle fields for core entities.
ALTER TABLE "Account"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Category"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Group"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Account_userId_isArchived_idx" ON "Account"("userId", "isArchived");
CREATE INDEX "Category_groupId_isArchived_idx" ON "Category"("groupId", "isArchived");
CREATE INDEX "Group_ownerUserId_isArchived_idx" ON "Group"("ownerUserId", "isArchived");
