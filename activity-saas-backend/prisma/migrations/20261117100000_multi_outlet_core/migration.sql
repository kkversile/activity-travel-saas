-- Multi-outlet expansion. All new attribution columns are nullable so existing
-- installations can deploy the schema before running the reviewed backfill.
CREATE TYPE "VendorOutletStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "BankAccountVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "VendorOutlet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" "VendorOutletStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorOutlet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorBankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountNumberCiphertext" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "verificationStatus" "BankAccountVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "proofDocumentId" TEXT,
    "verificationNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserOutletAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserOutletAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorTeamInvitationOutlet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorTeamInvitationOutlet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorOutlet_tenantId_outletCode_key" ON "VendorOutlet"("tenantId", "outletCode");
CREATE UNIQUE INDEX "VendorOutlet_id_tenantId_key" ON "VendorOutlet"("id", "tenantId");
CREATE INDEX "VendorOutlet_tenantId_status_name_idx" ON "VendorOutlet"("tenantId", "status", "name");
CREATE INDEX "VendorOutlet_tenantId_isDefault_idx" ON "VendorOutlet"("tenantId", "isDefault");
CREATE INDEX "VendorOutlet_bankAccountId_tenantId_idx" ON "VendorOutlet"("bankAccountId", "tenantId");
CREATE UNIQUE INDEX "VendorBankAccount_id_tenantId_key" ON "VendorBankAccount"("id", "tenantId");
CREATE INDEX "VendorBankAccount_tenantId_active_verificationStatus_idx" ON "VendorBankAccount"("tenantId", "active", "verificationStatus");
CREATE UNIQUE INDEX "UserOutletAccess_userId_outletId_key" ON "UserOutletAccess"("userId", "outletId");
CREATE INDEX "UserOutletAccess_tenantId_userId_active_idx" ON "UserOutletAccess"("tenantId", "userId", "active");
CREATE INDEX "UserOutletAccess_tenantId_outletId_active_idx" ON "UserOutletAccess"("tenantId", "outletId", "active");
CREATE UNIQUE INDEX "VendorTeamInvitationOutlet_invitationId_outletId_key" ON "VendorTeamInvitationOutlet"("invitationId", "outletId");
CREATE INDEX "VendorTeamInvitationOutlet_tenantId_outletId_idx" ON "VendorTeamInvitationOutlet"("tenantId", "outletId");

CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");
CREATE UNIQUE INDEX "VendorTeamInvitation_id_tenantId_key" ON "VendorTeamInvitation"("id", "tenantId");
CREATE UNIQUE INDEX "Product_id_tenantId_key" ON "Product"("id", "tenantId");
CREATE UNIQUE INDEX "Booking_id_vendorTenantId_key" ON "Booking"("id", "vendorTenantId");

ALTER TABLE "VendorOutlet" ADD CONSTRAINT "VendorOutlet_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBankAccount" ADD CONSTRAINT "VendorBankAccount_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorOutlet" ADD CONSTRAINT "VendorOutlet_bankAccountId_tenantId_fkey"
FOREIGN KEY ("bankAccountId", "tenantId") REFERENCES "VendorBankAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_userId_tenantId_fkey"
FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_invitationId_tenantId_fkey"
FOREIGN KEY ("invitationId", "tenantId") REFERENCES "VendorTeamInvitation"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "outletId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "outletId" TEXT;
ALTER TABLE "FinancialEvent" ADD COLUMN "outletId" TEXT;
ALTER TABLE "SettlementBatch" ADD COLUMN "outletId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "outletId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "beneficiarySnapshot" JSONB;
ALTER TABLE "Resource" ADD COLUMN "outletId" TEXT;

CREATE INDEX "Product_tenantId_outletId_status_idx" ON "Product"("tenantId", "outletId", "status");
CREATE INDEX "Booking_vendorTenantId_outletId_status_idx" ON "Booking"("vendorTenantId", "outletId", "status");
CREATE INDEX "FinancialEvent_vendorTenantId_outletId_occurredAt_idx" ON "FinancialEvent"("vendorTenantId", "outletId", "occurredAt");
CREATE INDEX "Payout_tenantId_outletId_status_idx" ON "Payout"("tenantId", "outletId", "status");
CREATE INDEX "SettlementBatch_vendorTenantId_outletId_status_createdAt_idx" ON "SettlementBatch"("vendorTenantId", "outletId", "status", "createdAt");

ALTER TABLE "Product" ADD CONSTRAINT "Product_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_outletId_vendorTenantId_fkey"
FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_outletId_vendorTenantId_fkey"
FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_outletId_vendorTenantId_fkey"
FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bankAccountId_tenantId_fkey"
FOREIGN KEY ("bankAccountId", "tenantId") REFERENCES "VendorBankAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "Resource_tenantId_resourceCode_key";
CREATE UNIQUE INDEX "Resource_tenantId_outletId_resourceCode_key" ON "Resource"("tenantId", "outletId", "resourceCode");
CREATE INDEX "Resource_tenantId_outletId_active_type_idx" ON "Resource"("tenantId", "outletId", "active", "type");
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent duplicate canonical payouts for the same outlet and ISO week while
-- preserving legacy tenant-wide payouts whose outlet cannot be inferred.
CREATE UNIQUE INDEX "Payout_tenantId_outletId_week_canonical_key"
ON "Payout" ("tenantId", "outletId", date_trunc('week', "createdAt"))
WHERE "outletId" IS NOT NULL AND "recordType" = 'CANONICAL';

ALTER TABLE "ReportSchedule" ADD COLUMN "outletId" TEXT;
ALTER TABLE "VendorReportExport" ADD COLUMN "outletId" TEXT;
CREATE INDEX "ReportSchedule_tenantId_outletId_status_idx" ON "ReportSchedule"("tenantId", "outletId", "status");
CREATE INDEX "VendorReportExport_tenantId_outletId_createdAt_idx" ON "VendorReportExport"("tenantId", "outletId", "createdAt");
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorReportExport" ADD CONSTRAINT "VendorReportExport_outletId_tenantId_fkey"
FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One default outlet per legal vendor; lifecycle changes serialize on Tenant.
CREATE UNIQUE INDEX "VendorOutlet_one_default_per_tenant" ON "VendorOutlet"("tenantId") WHERE "isDefault" = true;
