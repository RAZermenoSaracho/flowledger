ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "UserAuthAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAuthAccount_provider_providerAccountId_key"
  ON "UserAuthAccount"("provider", "providerAccountId");

CREATE INDEX "UserAuthAccount_userId_idx" ON "UserAuthAccount"("userId");
CREATE INDEX "UserAuthAccount_email_idx" ON "UserAuthAccount"("email");

ALTER TABLE "UserAuthAccount"
  ADD CONSTRAINT "UserAuthAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
