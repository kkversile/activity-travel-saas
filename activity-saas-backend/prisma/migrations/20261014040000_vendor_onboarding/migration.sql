-- Vendor onboarding application state, review lifecycle, and secured payout fields.
CREATE TYPE "VendorOnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "VendorGstStatus" AS ENUM ('REGISTERED', 'NOT_REGISTERED', 'PENDING_REVIEW', 'REJECTED');
CREATE TYPE "VendorBankVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

ALTER TYPE "FilePurpose" ADD VALUE 'ONBOARDING_SIGNATURE';

CREATE TABLE "VendorOnboardingApplication" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "VendorOnboardingStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "firstName" TEXT,
  "lastName" TEXT,
  "contactNumber" TEXT,
  "phoneVerifiedAt" TIMESTAMP(3),
  "otpHash" TEXT,
  "otpExpiresAt" TIMESTAMP(3),
  "otpRequestedAt" TIMESTAMP(3),
  "otpAttempts" INTEGER NOT NULL DEFAULT 0,
  "businessDisplayName" TEXT,
  "legalBusinessName" TEXT,
  "panNumber" TEXT,
  "gstStatus" "VendorGstStatus",
  "gstin" TEXT,
  "gstDeclarationAccepted" BOOLEAN NOT NULL DEFAULT false,
  "addressLine" TEXT,
  "city" TEXT,
  "state" TEXT,
  "pinCode" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "accountHolderName" TEXT,
  "bankName" TEXT,
  "bankAccountCiphertext" TEXT,
  "bankAccountMasked" TEXT,
  "ifscCode" TEXT,
  "accountType" TEXT,
  "bankOwnershipConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "bankVerificationStatus" "VendorBankVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "agreementVersion" TEXT,
  "agreementAcceptedAt" TIMESTAMP(3),
  "authorizedBusinessName" TEXT,
  "authorizedRepresentative" TEXT,
  "signatureData" TEXT,
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "submittedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VendorOnboardingApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorOnboardingApplication_tenantId_key" ON "VendorOnboardingApplication"("tenantId");
CREATE INDEX "VendorOnboardingApplication_status_updatedAt_idx" ON "VendorOnboardingApplication"("status", "updatedAt");

ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
