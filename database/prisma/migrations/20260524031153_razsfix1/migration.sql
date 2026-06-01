/*
  Warnings:

  - You are about to drop the column `groupCategoryId` on the `Transaction` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_groupCategoryId_fkey";

-- DropIndex
DROP INDEX "Transaction_groupCategoryId_idx";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "groupCategoryId";
