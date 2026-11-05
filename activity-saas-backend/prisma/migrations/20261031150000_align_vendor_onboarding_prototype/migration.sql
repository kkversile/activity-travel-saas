-- Persist the prototype-specific onboarding sections without changing existing vendor data.
ALTER TABLE "VendorOnboardingApplication" ADD COLUMN "supplementalData" JSONB;
