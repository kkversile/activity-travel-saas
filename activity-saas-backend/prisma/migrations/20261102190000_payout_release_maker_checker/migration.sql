CREATE TYPE "PayoutReleaseApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PayoutReleaseApprovalRequest" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "note" TEXT,
    "status" "PayoutReleaseApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutReleaseApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayoutReleaseApprovalRequest_payoutId_status_createdAt_idx"
    ON "PayoutReleaseApprovalRequest"("payoutId", "status", "createdAt");
CREATE INDEX "PayoutReleaseApprovalRequest_requestedById_status_idx"
    ON "PayoutReleaseApprovalRequest"("requestedById", "status");

ALTER TABLE "PayoutReleaseApprovalRequest"
    ADD CONSTRAINT "PayoutReleaseApprovalRequest_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutReleaseApprovalRequest"
    ADD CONSTRAINT "PayoutReleaseApprovalRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutReleaseApprovalRequest"
    ADD CONSTRAINT "PayoutReleaseApprovalRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
