-- Agreement lifecycle timestamps are part of the vendor onboarding workflow.
-- Nullable columns preserve existing applications and allow rollout before use.
ALTER TABLE "VendorOnboardingApplication"
  ADD COLUMN "agreementSentAt" TIMESTAMP(3),
  ADD COLUMN "agreementOpenedAt" TIMESTAMP(3),
  ADD COLUMN "agreementCountersignedAt" TIMESTAMP(3);
