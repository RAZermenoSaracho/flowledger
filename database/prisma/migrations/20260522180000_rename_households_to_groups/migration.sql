-- Rename the Household domain to Group while preserving existing data.

ALTER TYPE "HouseholdRole" RENAME TO "GroupRole";
ALTER TYPE "NotificationType" RENAME VALUE 'household_member_added' TO 'group_member_added';

ALTER TABLE "Household" RENAME CONSTRAINT "Household_pkey" TO "Group_pkey";
ALTER TABLE "HouseholdMember" RENAME CONSTRAINT "HouseholdMember_pkey" TO "GroupMember_pkey";

ALTER TABLE "Household" RENAME TO "Group";
ALTER TABLE "HouseholdMember" RENAME TO "GroupMember";

ALTER TABLE "Category" RENAME COLUMN "householdId" TO "groupId";
ALTER TABLE "Transaction" RENAME COLUMN "householdId" TO "groupId";
ALTER TABLE "Transaction" RENAME COLUMN "householdCategoryId" TO "groupCategoryId";
ALTER TABLE "GroupMember" RENAME COLUMN "householdId" TO "groupId";

ALTER INDEX "Category_householdId_idx" RENAME TO "Category_groupId_idx";
ALTER INDEX "Transaction_householdId_idx" RENAME TO "Transaction_groupId_idx";
ALTER INDEX "Transaction_householdCategoryId_idx" RENAME TO "Transaction_groupCategoryId_idx";
ALTER INDEX "Household_ownerUserId_idx" RENAME TO "Group_ownerUserId_idx";
ALTER INDEX "HouseholdMember_householdId_userId_key" RENAME TO "GroupMember_groupId_userId_key";
ALTER INDEX "HouseholdMember_userId_idx" RENAME TO "GroupMember_userId_idx";

ALTER TABLE "Category" RENAME CONSTRAINT "Category_householdId_fkey" TO "Category_groupId_fkey";
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_householdId_fkey" TO "Transaction_groupId_fkey";
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_householdCategoryId_fkey" TO "Transaction_groupCategoryId_fkey";
ALTER TABLE "Group" RENAME CONSTRAINT "Household_ownerUserId_fkey" TO "Group_ownerUserId_fkey";
ALTER TABLE "GroupMember" RENAME CONSTRAINT "HouseholdMember_householdId_fkey" TO "GroupMember_groupId_fkey";
ALTER TABLE "GroupMember" RENAME CONSTRAINT "HouseholdMember_userId_fkey" TO "GroupMember_userId_fkey";

UPDATE "Notification"
SET "metadata" = ("metadata" - 'householdId') || jsonb_build_object('groupId', "metadata"->'householdId')
WHERE "metadata" ? 'householdId';
