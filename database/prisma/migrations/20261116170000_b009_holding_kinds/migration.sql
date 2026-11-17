-- AlterEnum
ALTER TYPE "HoldingKind" ADD VALUE 'stock';
ALTER TYPE "HoldingKind" ADD VALUE 'etf';
ALTER TYPE "HoldingKind" ADD VALUE 'other';

-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "name" VARCHAR(80),
ADD COLUMN "unit" VARCHAR(20),
ALTER COLUMN "code" DROP NOT NULL;
