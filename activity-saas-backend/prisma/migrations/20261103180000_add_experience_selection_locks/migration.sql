CREATE TABLE "ExperienceSelectionLock" (
  "id" TEXT NOT NULL,
  "agentTenantId" TEXT NOT NULL,
  "searchAttemptId" TEXT NOT NULL,
  "experienceMasterId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "ratePlanId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "bookingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperienceSelectionLock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExperienceSelectionLock_bookingId_key" ON "ExperienceSelectionLock"("bookingId");
CREATE UNIQUE INDEX "ExperienceSelectionLock_agentTenantId_searchAttemptId_experienceMasterId_key" ON "ExperienceSelectionLock"("agentTenantId", "searchAttemptId", "experienceMasterId");
CREATE INDEX "ExperienceSelectionLock_agentTenantId_expiresAt_idx" ON "ExperienceSelectionLock"("agentTenantId", "expiresAt");
CREATE INDEX "ExperienceSelectionLock_productId_ratePlanId_sessionId_idx" ON "ExperienceSelectionLock"("productId", "ratePlanId", "sessionId");
