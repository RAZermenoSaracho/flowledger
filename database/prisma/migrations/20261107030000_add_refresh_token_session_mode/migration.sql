-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "previousTokenId" TEXT;

