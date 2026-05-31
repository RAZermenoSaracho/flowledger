ALTER TABLE "Transaction"
ADD COLUMN "expenseOffsetCategoryId" TEXT;

CREATE INDEX "Transaction_expenseOffsetCategoryId_idx" ON "Transaction"("expenseOffsetCategoryId");

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_expenseOffsetCategoryId_fkey"
FOREIGN KEY ("expenseOffsetCategoryId") REFERENCES "Category"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
