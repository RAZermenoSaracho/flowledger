ALTER TABLE "ProviderWebhookEvent"
ADD COLUMN "rawBody" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ProviderWebhookEvent"
ALTER COLUMN "rawBody" DROP DEFAULT;
