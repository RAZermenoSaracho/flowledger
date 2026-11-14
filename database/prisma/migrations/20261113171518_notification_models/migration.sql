-- CreateEnum
CREATE TYPE "NotificationModelVisibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "NotificationRunStatus" AS ENUM ('queued', 'processing', 'completed', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "NotificationModel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "NotificationModelVisibility" NOT NULL DEFAULT 'private',
    "slots" JSONB NOT NULL DEFAULT '[]',
    "bindings" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "sourceVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationModelVersion" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRun" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "NotificationRunStatus" NOT NULL DEFAULT 'queued',
    "dedupeKey" TEXT NOT NULL,
    "text" TEXT,
    "proposal" JSONB,
    "reason" TEXT,
    "workerId" TEXT,
    "transactionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationWorker" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationModel_userId_idx" ON "NotificationModel"("userId");

-- CreateIndex
CREATE INDEX "NotificationModel_visibility_idx" ON "NotificationModel"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationModelVersion_modelId_version_key" ON "NotificationModelVersion"("modelId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRun_transactionId_key" ON "NotificationRun"("transactionId");

-- CreateIndex
CREATE INDEX "NotificationRun_status_userId_idx" ON "NotificationRun"("status", "userId");

-- CreateIndex
CREATE INDEX "NotificationRun_modelId_status_receivedAt_idx" ON "NotificationRun"("modelId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "NotificationRun_status_finishedAt_idx" ON "NotificationRun"("status", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRun_modelId_dedupeKey_key" ON "NotificationRun"("modelId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationWorker_lastSeenAt_idx" ON "NotificationWorker"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "NotificationModel" ADD CONSTRAINT "NotificationModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationModel" ADD CONSTRAINT "NotificationModel_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "NotificationModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationModelVersion" ADD CONSTRAINT "NotificationModelVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "NotificationModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRun" ADD CONSTRAINT "NotificationRun_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "NotificationModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRun" ADD CONSTRAINT "NotificationRun_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
