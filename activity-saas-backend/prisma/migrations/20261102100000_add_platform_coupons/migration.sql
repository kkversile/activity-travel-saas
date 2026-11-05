CREATE TYPE "PlatformCouponStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'REJECTED');

CREATE TABLE "PlatformCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PlatformCouponStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCoupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformCoupon_code_key" ON "PlatformCoupon"("code");
CREATE INDEX "PlatformCoupon_status_startsAt_endsAt_idx" ON "PlatformCoupon"("status", "startsAt", "endsAt");
