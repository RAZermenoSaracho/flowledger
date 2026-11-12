-- CreateEnum
CREATE TYPE "IdentityVisibility" AS ENUM ('username_only', 'username_and_name');

-- CreateEnum
CREATE TYPE "ShareAcceptance" AS ENUM ('proposed', 'accepted', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'shared_expense_invited';
ALTER TYPE "NotificationType" ADD VALUE 'shared_expense_updated';
ALTER TYPE "NotificationType" ADD VALUE 'shared_expense_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'shared_expense_rejected';

-- AlterTable
ALTER TABLE "SharedExpenseParticipant" ADD COLUMN     "acceptance" "ShareAcceptance" NOT NULL DEFAULT 'proposed';

-- Backfill: every share that exists before this migration is an existing obligation (app-user
-- shares) or owner-asserted (manual participants), so all become accepted. Payment fields untouched.
UPDATE "SharedExpenseParticipant" SET "acceptance" = 'accepted';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityVisibility" "IdentityVisibility" NOT NULL DEFAULT 'username_only',
ADD COLUMN     "username" TEXT;

-- Backfill: random non-email-derived usernames (user_ + 12 lowercase hex chars). Idempotent: only
-- rows without a username are touched. A collision would fail the unique index below loudly.
UPDATE "User"
SET "username" = 'user_' || substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 12)
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

