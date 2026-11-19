-- VOYA fresh-install baseline, 19 November 2026. Never apply to an existing database.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantKind" AS ENUM ('PLATFORM', 'VENDOR', 'TRAVEL_AGENT');

-- CreateEnum
CREATE TYPE "SupplierCommercialModel" AS ENUM ('NET_RATE', 'COMMISSIONABLE', 'GROSS_RATE', 'HYBRID');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_PERSON', 'PER_BOOKING', 'PER_UNIT', 'GROUP');

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('INSTANT', 'VENDOR_CONFIRMATION', 'MANUAL_ON_REQUEST');

-- CreateEnum
CREATE TYPE "CommercialVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CommercialRuleKind" AS ENUM ('VOYA_REVENUE', 'AGENT_COMMERCIAL', 'TAX', 'PROMOTION', 'FOC', 'ELIGIBILITY');

-- CreateEnum
CREATE TYPE "CommercialScopeType" AS ENUM ('GLOBAL', 'VENDOR', 'PRODUCT', 'VARIANT', 'RATE_PLAN', 'AGENT_GROUP', 'AGENT');

-- CreateEnum
CREATE TYPE "CommercialStackingMode" AS ENUM ('EXCLUSIVE', 'STACKABLE');

-- CreateEnum
CREATE TYPE "CommercialRuleVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "VoyaRevenueModel" AS ENUM ('MARKUP_FIXED', 'MARKUP_PERCENT', 'COMMISSION_PERCENT', 'HYBRID');

-- CreateEnum
CREATE TYPE "AgentCommercialModel" AS ENUM ('NET_PLUS_MARKUP', 'SELLING_PRICE_COMMISSION', 'AGENT_SPECIFIC_PRICE');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('EXCLUSIVE', 'INCLUSIVE', 'NONE');

-- CreateEnum
CREATE TYPE "PromotionFunder" AS ENUM ('SUPPLIER', 'VOYA', 'SHARED', 'AGENT');

-- CreateEnum
CREATE TYPE "PlatformCouponStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VENDOR', 'TRAVEL_AGENT');

-- CreateEnum
CREATE TYPE "VendorOutletStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BankAccountVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailAuthChallengePurpose" AS ENUM ('ACTIVATE_VENDOR', 'RESET_VENDOR_PASSWORD', 'LOGIN_VENDOR');

-- CreateEnum
CREATE TYPE "ImpersonationSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DistributionChannelType" AS ENUM ('INTERNAL_MARKETPLACE', 'DIRECT', 'OTA', 'PARTNER_API');

-- CreateEnum
CREATE TYPE "ChannelContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DistributionCapability" AS ENUM ('CATALOG_READ', 'AVAILABILITY_READ', 'PRICING_READ', 'EVENT_READ');

-- CreateEnum
CREATE TYPE "ChannelMappingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ChannelInventoryExposureMode" AS ENUM ('EXACT_REMAINING', 'AVAILABLE_ONLY');

-- CreateEnum
CREATE TYPE "ChannelCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DistributionEventType" AS ENUM ('PRODUCT_CHANGED', 'VARIANT_CHANGED', 'RATE_CHANGED', 'AVAILABILITY_CHANGED', 'BOOKING_CHANGED', 'MAPPING_CHANGED');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'CATALOGUE', 'OPERATIONS', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VendorCommercialChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorOnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorGstStatus" AS ENUM ('REGISTERED', 'NOT_REGISTERED', 'PENDING_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorBankVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('ACTIVITY', 'MEALS', 'TRANSFER', 'PACKAGE_ADDON', 'OTHERS');

-- CreateEnum
CREATE TYPE "MeetingModel" AS ENUM ('FIXED_MEETING_POINT', 'PICKUP_AVAILABLE', 'FLEXIBLE_ENTRY');

-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "TravellerType" AS ENUM ('ADULT', 'CHILD', 'SENIOR', 'YOUTH', 'INFANT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('PERCENTAGE', 'ABSOLUTE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NEW', 'PENDING', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW', 'CONFIRMED', 'VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED', 'FULFILLED', 'REDEEMED', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CHANGE_REQUESTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingRecordType" AS ENUM ('LEGACY', 'CANONICAL');

-- CreateEnum
CREATE TYPE "CancellationInitiator" AS ENUM ('AGENT', 'VENDOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CancellationReasonCategory" AS ENUM ('CUSTOMER_REQUEST', 'VENDOR_OPERATIONAL', 'WEATHER', 'SAFETY', 'FORCE_MAJEURE', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationFinancialState" AS ENUM ('CANCELLED_PENDING_FINANCIAL', 'CANCELLED_NO_REFUND', 'CANCELLED_PARTIAL_REFUND', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "FinancialEventType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'CANCELLATION_FINANCIAL_RESOLVED', 'REFUND_CREATED', 'REFUND_CONFIRMED', 'REFUND_FAILED', 'VENDOR_ADJUSTMENT', 'PROMOTION_FUNDED', 'SETTLEMENT_BATCH_CREATED', 'PAYOUT_RELEASED');

-- CreateEnum
CREATE TYPE "FinancialEventStatus" AS ENUM ('POSTED', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "BookingQuestionType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('PRODUCT_MEDIA', 'VENDOR_DOCUMENT', 'ONBOARDING_SIGNATURE', 'BOOKING_VOUCHER', 'FULFILMENT_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "FulfilmentMode" AS ENUM ('AUTO', 'AFTER_FULFILMENT', 'PNR_ONLY', 'TICKET_QR');

-- CreateEnum
CREATE TYPE "FulfilmentEvidenceKind" AS ENUM ('PNR_REFERENCE', 'TICKET_FILE', 'QR_TOKEN', 'SUPPLIER_ATTACHMENT');

-- CreateEnum
CREATE TYPE "EvidenceMatchMode" AS ENUM ('ALL', 'ANY');

-- CreateEnum
CREATE TYPE "BookingFulfilmentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'WAITING_EVIDENCE', 'READY_FOR_VOUCHER', 'VOUCHER_READY', 'VOIDED');

-- CreateEnum
CREATE TYPE "VoucherGenerationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'PROCESSING', 'FAILED', 'SUCCEEDED');

-- CreateEnum
CREATE TYPE "FulfilmentEvidenceStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VoucherVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'VOID');

-- CreateEnum
CREATE TYPE "VoucherShareChannel" AS ENUM ('DOWNLOAD', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "VoucherShareStatus" AS ENUM ('RECORDED', 'QUEUED', 'FAILED');

-- CreateEnum
CREATE TYPE "RedemptionMethod" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('GSTIN', 'PAN', 'BANK_PROOF', 'TRADE_LICENSE', 'LLP_AGREEMENT', 'LLPIN_CERTIFICATE', 'AUTH_SIGNATORY_ID', 'AUTHORIZATION_LETTER', 'ADDRESS_PROOF', 'UDYAM_CERTIFICATE', 'TOURISM_REGISTRATION', 'VEHICLE_PERMIT', 'PUBLIC_LIABILITY_INSURANCE', 'BOAT_LICENSE', 'ADVENTURE_WATER_SPORTS_LICENSE', 'FSSAI_LICENSE');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'LIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductRevisionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ExperienceDisplayMode" AS ENUM ('SINGLE_OFFER', 'ALL_OFFERS');

-- CreateEnum
CREATE TYPE "OfferSelectionPolicy" AS ENUM ('CHEAPEST', 'BALANCED', 'HIGHEST_COMMISSION', 'ADMIN_SELECTED');

-- CreateEnum
CREATE TYPE "ProductMatchSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BuyBoxStatus" AS ENUM ('CLOSED', 'OPEN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BuyBoxOfferStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REMOVED');

-- CreateEnum
CREATE TYPE "BuyBoxBidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BuyBoxSelectionPolicy" AS ENUM ('CHEAPEST', 'HIGHEST_BID', 'BALANCED', 'ADMIN_SELECTED');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OperatingModel" AS ENUM ('ALL_DAY', 'FIXED_SLOT', 'MULTIPLE_SLOTS', 'DATE_CAPACITY', 'ON_REQUEST_DATE');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CapacityUnit" AS ENUM ('PERSON', 'BOOKING', 'UNIT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED', 'BLACKOUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('BLACKOUT', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupplierTier" AS ENUM ('ELITE', 'PREFERRED', 'STANDARD', 'WATCHLIST', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "SupplierQualityPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SupplierQualityDimension" AS ENUM ('CONFIRMATION_SLA', 'CANCELLATION_RELIABILITY', 'FULFILMENT_QUALITY', 'INVENTORY_RELIABILITY', 'TRAVELLER_OUTCOME', 'CATALOGUE_QUALITY');

-- CreateEnum
CREATE TYPE "SupplierQualityMetricCode" AS ENUM ('CONFIRMATION_WITHIN_SLA_RATE', 'VENDOR_RESPONSE_WITHIN_SLA_RATE', 'AVG_VENDOR_RESPONSE_MINUTES', 'CONFIRMATION_OVERDUE_RATE', 'VENDOR_CANCELLATION_RATE', 'SHORT_NOTICE_VENDOR_CANCELLATION_RATE', 'VOUCHER_READY_BEFORE_SERVICE_RATE', 'AVG_FULFILMENT_TURNAROUND_MINUTES', 'LAST_MINUTE_STOP_SELL_RATE', 'LIVE_PRODUCT_IMAGE_COVERAGE_RATE', 'CUSTOMER_RATING', 'NPS', 'COMPLAINT_RATE');

-- CreateEnum
CREATE TYPE "SupplierMetricDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "SupplierMetricMissingDataTreatment" AS ENUM ('EXCLUDE', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "SupplierMetricStatus" AS ENUM ('PASS', 'WARN', 'FAIL', 'INSUFFICIENT_DATA', 'UNAVAILABLE', 'UNASSESSED');

-- CreateEnum
CREATE TYPE "SupplierQualityIssueSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupplierQualityIssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DemandIntelligencePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DemandOpportunityType" AS ENUM ('HIGH_DEMAND_LOW_SUPPLY', 'FREQUENT_SOLD_OUT', 'HIGH_CANCELLATIONS', 'PRICE_GAP', 'COVERAGE_GAP');

-- CreateEnum
CREATE TYPE "DemandOpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DemandOpportunitySource" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "DemandOpportunityStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DemandTargetStatus" AS ENUM ('TARGETED', 'VIEWED', 'INTERESTED', 'DECLINED', 'ACTION_TAKEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "DemandOpportunityResolutionType" AS ENUM ('CAPACITY_ADDED', 'SLOT_ADDED', 'PRODUCT_ADDED', 'COMMERCIAL_REVIEW', 'QUALITY_REVIEW', 'COVERAGE_EXPANDED', 'NO_ACTION', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryHoldStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryAllocationStatus" AS ENUM ('CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ResourceAllocationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('VEHICLE', 'GUIDE', 'BOAT', 'EQUIPMENT', 'INSTRUCTOR', 'VENUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceAllocationMode" AS ENUM ('EXCLUSIVE', 'SHARED', 'CAPACITY');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED', 'READY_TO_RELEASE', 'RELEASED', 'RELEASE_FAILED', 'RECONCILIATION_REQUIRED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "CommissionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutRecordType" AS ENUM ('LEGACY', 'CANONICAL');

-- CreateEnum
CREATE TYPE "PayoutReleaseApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentWalletCreditApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentCommercialChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentCollectionMode" AS ENUM ('UNCONFIGURED', 'VOYA_COLLECTS', 'AGENT_COLLECTS', 'VENDOR_COLLECTS', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "SettlementCycleMode" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY', 'POST_SERVICE');

-- CreateEnum
CREATE TYPE "SettlementEligibilityTrigger" AS ENUM ('BOOKING_CONFIRMED', 'SERVICE_REDEEMED', 'SERVICE_COMPLETED');

-- CreateEnum
CREATE TYPE "SettlementHoldScope" AS ENUM ('VENDOR', 'BOOKING', 'FINANCIAL_EVENT');

-- CreateEnum
CREATE TYPE "SettlementHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "SettlementBatchStatus" AS ENUM ('READY_FOR_PAYOUT', 'PAYOUT_BLOCKED', 'RELEASED', 'RECONCILIATION_REQUIRED', 'RECONCILED', 'CLOSED_NO_PAYOUT');

-- CreateEnum
CREATE TYPE "SettlementAllocationStatus" AS ENUM ('ALLOCATED', 'RELEASED', 'SETTLED');

-- CreateEnum
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('RELEASE_RECORDED', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "TenantKind" NOT NULL DEFAULT 'VENDOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "organizationRole" "OrganizationRole",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "VendorTeamInvitationOutlet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorTeamInvitationOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "adminId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAuthChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "EmailAuthChallengePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "verificationTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorTrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "originalAdminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" "ImpersonationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT,
    "legalBusinessName" TEXT NOT NULL,
    "operatingCity" TEXT NOT NULL,
    "operatingRegion" TEXT NOT NULL,
    "supplierType" TEXT,
    "voucherShortCode" TEXT NOT NULL,
    "accountManagerName" TEXT,
    "defaultSupplierModel" "SupplierCommercialModel",
    "defaultSupplierCommissionPercent" DECIMAL(7,4),
    "gstin" TEXT,
    "category" TEXT,
    "registrationMobile" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "verificationStatus" "VendorVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "readinessScore" INTEGER NOT NULL DEFAULT 0,
    "payoutAccountMasked" TEXT,
    "payoutAccountHolder" TEXT,
    "payoutBankName" TEXT,
    "payoutBranch" TEXT,
    "payoutIfsc" TEXT,
    "payoutSwift" TEXT,
    "payoutAccountType" TEXT,
    "payoutCurrency" TEXT,
    "documentStatus" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCommercialChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposedSupplierModel" "SupplierCommercialModel" NOT NULL,
    "proposedCommissionPercent" DECIMAL(7,4),
    "requestReason" TEXT NOT NULL,
    "status" "VendorCommercialChangeStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCommercialChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalBusinessName" TEXT NOT NULL,
    "verificationStatus" "AgentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommercialProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'Silver',
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditOutstanding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "markupAllowedPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "categoryOverrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommercialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommercialChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proposedConfiguration" JSONB NOT NULL,
    "requestReason" TEXT NOT NULL,
    "status" "AgentCommercialChangeStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommercialChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWalletLedger" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWalletCreditApprovalRequest" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AgentWalletCreditApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWalletCreditApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "agreementSentAt" TIMESTAMP(3),
    "agreementOpenedAt" TIMESTAMP(3),
    "agreementCountersignedAt" TIMESTAMP(3),
    "authorizedBusinessName" TEXT,
    "authorizedRepresentative" TEXT,
    "signatureData" TEXT,
    "supplementalData" JSONB,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOnboardingApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" "FileVisibility" NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "currentStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDocumentVersion" (
    "id" TEXT NOT NULL,
    "vendorDocumentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "productCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "sourceImportKey" TEXT,
    "importFingerprint" TEXT,
    "importIdempotencyKey" TEXT,
    "experienceMasterId" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductViewEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "viewerTenantId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPriceApplyRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadFingerprint" TEXT NOT NULL,
    "responsePayload" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityPriceApplyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReviewId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendorReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceMaster" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "subType" TEXT,
    "cityName" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "displayMode" "ExperienceDisplayMode" NOT NULL DEFAULT 'SINGLE_OFFER',
    "selectionPolicy" "OfferSelectionPolicy" NOT NULL DEFAULT 'CHEAPEST',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceSelectionRuleSet" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "objective" TEXT NOT NULL DEFAULT 'MARGIN',
    "priceWeight" INTEGER NOT NULL DEFAULT 40,
    "ratingWeight" INTEGER NOT NULL DEFAULT 20,
    "reliabilityWeight" INTEGER NOT NULL DEFAULT 20,
    "inventoryWeight" INTEGER NOT NULL DEFAULT 10,
    "contractWeight" INTEGER NOT NULL DEFAULT 10,
    "autoFailover" BOOLEAN NOT NULL DEFAULT true,
    "absorbPriceGap" TEXT NOT NULL DEFAULT 'LOWER_OF_50_OR_5_PERCENT',
    "lockMinutes" INTEGER NOT NULL DEFAULT 15,
    "allocation" TEXT NOT NULL DEFAULT 'WINNER_TAKES_ALL',
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "pendingConfiguration" JSONB,
    "pendingUpdatedById" TEXT,
    "pendingUpdatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceSelectionRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyBox" (
    "id" TEXT NOT NULL,
    "experienceMasterId" TEXT NOT NULL,
    "status" "BuyBoxStatus" NOT NULL DEFAULT 'CLOSED',
    "displayMode" "ExperienceDisplayMode" NOT NULL DEFAULT 'SINGLE_OFFER',
    "selectionPolicy" "BuyBoxSelectionPolicy" NOT NULL DEFAULT 'HIGHEST_BID',
    "fallbackPolicy" "OfferSelectionPolicy" NOT NULL DEFAULT 'CHEAPEST',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "minimumBidAmount" DECIMAL(12,2),
    "minimumBidIncrement" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyBoxOffer" (
    "id" TEXT NOT NULL,
    "buyBoxId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "BuyBoxOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "manuallyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyBoxOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyBoxBid" (
    "id" TEXT NOT NULL,
    "buyBoxOfferId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "BuyBoxBidStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyBoxBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceOfferPlacement" (
    "id" TEXT NOT NULL,
    "experienceMasterId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "placementType" TEXT NOT NULL DEFAULT 'PREFERRED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "pinnedUntil" TIMESTAMP(3),
    "pinnedById" TEXT,
    "pinReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceOfferPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceMasterOption" (
    "id" TEXT NOT NULL,
    "experienceMasterId" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceMasterOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceMasterOptionPlacement" (
    "id" TEXT NOT NULL,
    "masterOptionId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "pinnedUntil" TIMESTAMP(3),
    "pinnedById" TEXT,
    "pinReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceMasterOptionPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ProductMatchSuggestion" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "candidateProductId" TEXT NOT NULL,
    "experienceMasterId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "status" "ProductMatchSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMatchSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRevision" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProductRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "productName" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "subType" TEXT NOT NULL,
    "category" TEXT,
    "meetingModel" "MeetingModel",
    "meetingPoint" TEXT,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlightedPriority" INTEGER,
    "isHotelLinked" BOOLEAN NOT NULL DEFAULT false,
    "attachedHotelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "howToRedeem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subCategory" TEXT,
    "persuasions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank" INTEGER,
    "starRating" DECIMAL(3,2),
    "safetyMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importantInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thingsToCarry" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "additionalInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metaname" TEXT,
    "cityCode" TEXT,
    "lat" DECIMAL(10,7),
    "lon" DECIMAL(10,7),
    "address" TEXT,
    "cityName" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "durationValue" TEXT,
    "durationUnit" TEXT,
    "guideIncluded" TEXT,
    "guideLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notIncluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "endPoint" TEXT,
    "thingsToKnow" TEXT,
    "accessibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "followItinerary" BOOLEAN NOT NULL DEFAULT true,
    "voucherCodeSource" TEXT,
    "voucherAcceptedAs" TEXT,
    "voucherInstructions" TEXT,
    "cancellationPreset" TEXT,
    "travellerDetails" TEXT,
    "amendmentPolicy" TEXT,
    "sourcePayload" JSONB,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFulfilmentPolicy" (
    "id" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "mode" "FulfilmentMode",
    "requiredEvidenceKinds" "FulfilmentEvidenceKind"[] DEFAULT ARRAY[]::"FulfilmentEvidenceKind"[],
    "evidenceMatchMode" "EvidenceMatchMode" NOT NULL DEFAULT 'ALL',
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactEmail" TEXT,
    "operationsContactName" TEXT,
    "operationsContactPhone" TEXT,
    "operationsContactEmail" TEXT,
    "voucherNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "migrationMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFulfilmentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "fileAssetId" TEXT,
    "externalUrl" TEXT,
    "sourceType" TEXT,
    "sourceUrl" TEXT,
    "rightsStatus" TEXT,
    "rightsNote" TEXT,
    "providerPlaceId" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySubcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivitySubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryStop" (
    "id" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stopName" TEXT NOT NULL,
    "stopType" TEXT NOT NULL,
    "stayDurationMinutes" INTEGER,
    "travelTimeToNextMinutes" INTEGER,
    "ticketPolicy" TEXT,
    "replacementStop" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraryStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLocationVerification" (
    "id" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "address" TEXT,
    "lat" DECIMAL(10,7),
    "lon" DECIMAL(10,7),
    "meetingPoint" TEXT,
    "provider" TEXT,
    "providerPlaceId" TEXT,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductLocationVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorTeamInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTeamInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "reportName" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "runTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReportExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rows" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorReportExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBookingQuestion" (
    "id" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "BookingQuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "appliesPerTraveller" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBookingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "revisionId" TEXT,
    "variantCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationMinutes" INTEGER,
    "minPax" INTEGER,
    "maxPax" INTEGER,
    "cutOffMinutes" INTEGER,
    "privateShared" TEXT,
    "vehicleType" TEXT,
    "pickupIncluded" BOOLEAN NOT NULL DEFAULT false,
    "pickupType" TEXT,
    "pickupInput" TEXT,
    "pickupTimings" TEXT,
    "dropoffIncluded" BOOLEAN NOT NULL DEFAULT false,
    "dropoffTimings" TEXT,
    "mealIncluded" BOOLEAN NOT NULL DEFAULT false,
    "mealType" TEXT,
    "menu" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mealVariety" TEXT,
    "pointsOfInterest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suitableFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcePayload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantTicketType" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageFrom" INTEGER,
    "ageTo" INTEGER,
    "needsAdult" BOOLEAN NOT NULL DEFAULT false,
    "countsCapacity" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantTicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantUnit" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 1,
    "paxIncluded" INTEGER NOT NULL DEFAULT 1,
    "extraPerPerson" DECIMAL(12,2),
    "unitsPerSlot" INTEGER NOT NULL DEFAULT 1,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "ratePlanCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "unitType" TEXT NOT NULL DEFAULT 'per_person',
    "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freehold" BOOLEAN NOT NULL DEFAULT false,
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 99,
    "affiliates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instantConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "cutOffMinutes" INTEGER NOT NULL DEFAULT 0,
    "dateLevelCutoffTime" TEXT,
    "adultRequired" BOOLEAN NOT NULL DEFAULT false,
    "minAdultRequired" INTEGER NOT NULL DEFAULT 0,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionChannel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DistributionChannelType" NOT NULL DEFAULT 'PARTNER_API',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanChannelMapping" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalRatePlanCode" TEXT,
    "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "migrationMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelContract" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ChannelContractStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "capabilities" "DistributionCapability"[],
    "allowedCurrencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availabilityHorizonDays" INTEGER NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "retiredAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ChannelContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChannelMapping" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalProductCode" TEXT NOT NULL,
    "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantChannelMapping" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "externalVariantCode" TEXT NOT NULL,
    "status" "ChannelMappingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelInventoryRule" (
    "id" TEXT NOT NULL,
    "ratePlanChannelMappingId" TEXT NOT NULL,
    "exposureMode" "ChannelInventoryExposureMode" NOT NULL,
    "capacityBuffer" INTEGER NOT NULL DEFAULT 0,
    "maxPublishedCapacity" INTEGER,
    "maxUnitsPerQuote" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelInventoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelApiCredential" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" "DistributionCapability"[],
    "status" "ChannelCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceOutboxEventId" TEXT NOT NULL,
    "type" "DistributionEventType" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "externalResourceCode" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionProjectionCursor" (
    "consumerKey" TEXT NOT NULL,
    "lastCreatedAt" TIMESTAMP(3),
    "lastEventId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionProjectionCursor_pkey" PRIMARY KEY ("consumerKey")
);

-- CreateTable
CREATE TABLE "TravellerRule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "type" "TravellerType" NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "minCount" INTEGER NOT NULL DEFAULT 0,
    "maxCount" INTEGER NOT NULL DEFAULT 99,

    CONSTRAINT "TravellerRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanCommercialVersion" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CommercialVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "supplierModel" "SupplierCommercialModel",
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricingUnit" "PricingUnit",
    "supplierBaseAmount" DECIMAL(18,4),
    "supplierCommissionPercent" DECIMAL(9,4),
    "bookingMode" "BookingMode",
    "confirmationSlaMinutes" INTEGER,
    "sourcePayload" JSONB,
    "createdById" TEXT NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanCommercialVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanTravellerPrice" (
    "id" TEXT NOT NULL,
    "commercialVersionId" TEXT NOT NULL,
    "travellerType" "TravellerType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanTravellerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGroupMember" (
    "id" TEXT NOT NULL,
    "agentGroupId" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CommercialRuleKind" NOT NULL,
    "scopeType" "CommercialScopeType" NOT NULL,
    "vendorTenantId" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "ratePlanId" TEXT,
    "agentGroupId" TEXT,
    "agentTenantId" TEXT,
    "distributionChannelId" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CommercialRuleVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackingMode" "CommercialStackingMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "minDaysBefore" INTEGER NOT NULL,
    "maxDaysBefore" INTEGER,
    "chargeValue" DECIMAL(10,2) NOT NULL,
    "chargeType" "ChargeType" NOT NULL,

    CONSTRAINT "CancellationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "scheduleCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "operatingModel" "OperatingModel",
    "timezone" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "operatingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacityUnit" "CapacityUnit" NOT NULL,
    "capacityUnitReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultCapacity" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlotTemplate" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "slotCode" TEXT NOT NULL,
    "label" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanSchedule" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "slotTemplateId" TEXT,
    "type" "ScheduleExceptionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "exceptionKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSession" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "slotTemplateId" TEXT,
    "serviceDate" DATE NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "localStartTime" TEXT,
    "localEndTime" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "totalCapacity" INTEGER NOT NULL,
    "blockedCapacity" INTEGER NOT NULL DEFAULT 0,
    "heldCapacity" INTEGER NOT NULL DEFAULT 0,
    "confirmedCapacity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryHold" (
    "id" TEXT NOT NULL,
    "inventoryStateId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceKey" TEXT,
    "bookingId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "id" TEXT NOT NULL,
    "inventoryStateId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "referenceKey" TEXT,
    "sourceHoldId" TEXT,
    "bookingId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "resourceCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "allocationMode" "ResourceAllocationMode" NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleResourceRequirement" (
    "id" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "specificResourceId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "requirementKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleResourceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionResourceAllocation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ResourceAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionResourceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promotionType" TEXT NOT NULL DEFAULT 'PERCENTAGE_OFF',
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "bookingStartsAt" TIMESTAMP(3),
    "bookingEndsAt" TIMESTAMP(3),
    "validWeekdays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stackWithPlatform" BOOLEAN NOT NULL DEFAULT false,
    "fundingOwner" TEXT NOT NULL DEFAULT 'SUPPLIER',
    "conditionValue" INTEGER,
    "maxDiscountedBookings" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "adjustmentType" "ChargeType" NOT NULL DEFAULT 'PERCENTAGE',
    "adjustment" DECIMAL(10,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "recordType" "BookingRecordType" NOT NULL DEFAULT 'LEGACY',
    "bookingCode" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "agentTenantId" TEXT,
    "agentUserId" TEXT,
    "productId" TEXT NOT NULL,
    "productRevisionId" TEXT,
    "variantId" TEXT,
    "ratePlanId" TEXT,
    "sessionId" TEXT,
    "distributionChannelId" TEXT,
    "bookingMode" "BookingMode",
    "channel" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "serviceTimezone" TEXT,
    "pax" INTEGER NOT NULL,
    "paxBreakdown" JSONB NOT NULL DEFAULT '{}',
    "units" INTEGER,
    "capacityConsumption" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationDueAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "productRevisionId" TEXT NOT NULL,
    "scheduleTemplateId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "variantSnapshot" JSONB NOT NULL,
    "ratePlanSnapshot" JSONB NOT NULL,
    "sessionSnapshot" JSONB NOT NULL,
    "travellerSummary" JSONB NOT NULL,
    "capacityUnit" "CapacityUnit" NOT NULL,
    "capacityConsumption" INTEGER NOT NULL,
    "bookingMode" "BookingMode" NOT NULL,
    "cancellationPolicySnapshot" JSONB NOT NULL,
    "cancellationPolicyFingerprint" TEXT NOT NULL,
    "cancellationAcknowledgedAt" TIMESTAMP(3) NOT NULL,
    "pickupSnapshot" JSONB,
    "questionsSnapshot" JSONB NOT NULL,
    "bookingAnswers" JSONB NOT NULL,
    "agentSnapshot" JSONB NOT NULL,
    "channelSnapshot" JSONB NOT NULL,
    "confirmationPolicySnapshot" JSONB NOT NULL,
    "fulfilmentPolicySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTraveller" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "travellerType" "TravellerType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT,
    "age" INTEGER,
    "email" TEXT,
    "phone" TEXT,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingTraveller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingFulfilment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "mode" "FulfilmentMode" NOT NULL,
    "status" "BookingFulfilmentStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "generationStatus" "VoucherGenerationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "generationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastGenerationError" TEXT,
    "generationRequestedAt" TIMESTAMP(3),
    "generationToken" TEXT,
    "generationClaimedAt" TIMESTAMP(3),
    "generationLeaseExpiresAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingFulfilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfilmentEvidence" (
    "id" TEXT NOT NULL,
    "fulfilmentId" TEXT NOT NULL,
    "kind" "FulfilmentEvidenceKind" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "FulfilmentEvidenceStatus" NOT NULL DEFAULT 'CURRENT',
    "referenceValue" TEXT,
    "fileAssetId" TEXT,
    "travellerVisible" BOOLEAN NOT NULL DEFAULT false,
    "replacesEvidenceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "FulfilmentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherVersion" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fulfilmentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "VoucherVersionStatus" NOT NULL DEFAULT 'CURRENT',
    "voucherCode" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "sourceEvidenceFingerprint" TEXT NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "generatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherShareEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fulfilmentId" TEXT NOT NULL,
    "voucherVersionId" TEXT NOT NULL,
    "channel" "VoucherShareChannel" NOT NULL,
    "status" "VoucherShareStatus" NOT NULL DEFAULT 'RECORDED',
    "recipientMasked" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRedemption" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fulfilmentId" TEXT NOT NULL,
    "voucherVersionId" TEXT,
    "method" "RedemptionMethod" NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "actorUserId" TEXT,
    "actorRole" "UserRole",
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEconomicsSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "ratePlanCommercialVersionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "pricingUnit" "PricingUnit" NOT NULL,
    "supplierCommercialModel" "SupplierCommercialModel" NOT NULL,
    "supplierGrossBasis" DECIMAL(18,4) NOT NULL,
    "supplierCommission" DECIMAL(18,4) NOT NULL,
    "vendorPayable" DECIMAL(18,4) NOT NULL,
    "financeConfigurationVersion" INTEGER,
    "gstOnCommissionPercent" DECIMAL(7,4),
    "tds194OPercent" DECIMAL(7,4),
    "gstTcsPercent" DECIMAL(7,4),
    "gstOnCommissionAmount" DECIMAL(18,4),
    "tds194OAmount" DECIMAL(18,4),
    "gstTcsAmount" DECIMAL(18,4),
    "netVendorPayable" DECIMAL(18,4),
    "voyaRevenueModel" "VoyaRevenueModel",
    "voyaRevenue" DECIMAL(18,4) NOT NULL,
    "agentCommercialModel" "AgentCommercialModel",
    "agentFacingAmount" DECIMAL(18,4) NOT NULL,
    "agentCommission" DECIMAL(18,4) NOT NULL,
    "taxMode" "TaxMode" NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "taxContext" JSONB NOT NULL,
    "promotionAmount" DECIMAL(18,4) NOT NULL,
    "promotionFunder" "PromotionFunder",
    "promotionContext" JSONB NOT NULL,
    "focAmount" DECIMAL(18,4) NOT NULL,
    "focContext" JSONB NOT NULL,
    "finalAmount" DECIMAL(18,4) NOT NULL,
    "commercialEligibility" JSONB NOT NULL,
    "calculationInputs" JSONB NOT NULL,
    "calculationOutputs" JSONB NOT NULL,
    "ruleTrace" JSONB NOT NULL,
    "fxContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEconomicsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCancellation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "initiator" "CancellationInitiator" NOT NULL,
    "initiatedByUserId" TEXT,
    "initiatedByTenantId" TEXT,
    "reasonCategory" "CancellationReasonCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "serviceTimezone" TEXT NOT NULL,
    "serviceDateLocal" TEXT NOT NULL,
    "cancellationDateLocal" TEXT NOT NULL,
    "daysBeforeService" INTEGER NOT NULL,
    "policyFingerprint" TEXT,
    "matchedPolicyRule" JSONB,
    "bookingAmount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "cancellationCharge" DECIMAL(18,4) NOT NULL,
    "refundEntitlement" DECIMAL(18,4) NOT NULL,
    "financialState" "CancellationFinancialState" NOT NULL,
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "calculationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "cancellationId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "bookingId" TEXT,
    "vendorTenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "agentTenantId" TEXT,
    "settlementBatchId" TEXT,
    "payoutId" TEXT,
    "cancellationId" TEXT,
    "refundId" TEXT,
    "type" "FinancialEventType" NOT NULL,
    "status" "FinancialEventStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "vendorAmount" DECIMAL(18,4),
    "components" JSONB NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "bankAccountId" TEXT,
    "beneficiarySnapshot" JSONB,
    "recordType" "PayoutRecordType" NOT NULL DEFAULT 'LEGACY',
    "settlementBatchId" TEXT,
    "amount" DECIMAL(18,4) NOT NULL,
    "heldAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "heldHoldIds" JSONB NOT NULL DEFAULT '[]',
    "status" "PayoutStatus" NOT NULL,
    "dueDate" DATE NOT NULL,
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "failureReason" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "reconciledAmount" DECIMAL(18,4),
    "reconciliationReference" TEXT,
    "reconciliationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutReleaseApprovalRequest" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "requestedAmount" DECIMAL(18,4) NOT NULL,
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

-- CreateTable
CREATE TABLE "FinanceConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "paymentCollectionMode" "PaymentCollectionMode" NOT NULL DEFAULT 'UNCONFIGURED',
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "gstOnCommissionPercent" DECIMAL(7,4),
    "tds194OPercent" DECIMAL(7,4),
    "gstTcsPercent" DECIMAL(7,4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialGuardrailConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "minimumNetMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 4,
    "websiteGatewayFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 1.8,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pendingConfiguration" JSONB,
    "pendingUpdatedById" TEXT,
    "pendingUpdatedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialGuardrailConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSettlementPolicy" (
    "id" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "cycleMode" "SettlementCycleMode" NOT NULL DEFAULT 'MANUAL',
    "eligibilityTrigger" "SettlementEligibilityTrigger" NOT NULL DEFAULT 'SERVICE_COMPLETED',
    "settlementDelayDays" INTEGER NOT NULL DEFAULT 0,
    "weeklyDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSettlementPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationVendorSettlementResolution" (
    "id" TEXT NOT NULL,
    "cancellationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "originalVendorPayable" DECIMAL(18,4) NOT NULL,
    "finalVendorPayable" DECIMAL(18,4) NOT NULL,
    "vendorAdjustmentAmount" DECIMAL(18,4) NOT NULL,
    "financialEventId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "resolvedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationVendorSettlementResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementHold" (
    "id" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "scope" "SettlementHoldScope" NOT NULL,
    "bookingId" TEXT,
    "financialEventId" TEXT,
    "status" "SettlementHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,

    CONSTRAINT "SettlementHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "outletId" TEXT,
    "currency" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "status" "SettlementBatchStatus" NOT NULL,
    "grossBookingValue" DECIMAL(18,4) NOT NULL,
    "vendorBasePayable" DECIMAL(18,4) NOT NULL,
    "adjustmentTotal" DECIMAL(18,4) NOT NULL,
    "netPayable" DECIMAL(18,4) NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "settlementBatchId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "vendorLegalName" TEXT NOT NULL,
    "vendorGstin" TEXT,
    "currency" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "commissionSubtotal" DECIMAL(18,4) NOT NULL,
    "gstOnCommissionAmount" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "sourceLineSnapshot" JSONB NOT NULL,
    "status" "CommissionInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "bookingId" TEXT,
    "lineType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "grossBookingValue" DECIMAL(18,4) NOT NULL,
    "vendorPayableBase" DECIMAL(18,4) NOT NULL,
    "adjustmentAmount" DECIMAL(18,4) NOT NULL,
    "netVendorPayable" DECIMAL(18,4) NOT NULL,
    "taxInformational" DECIMAL(18,4) NOT NULL,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementEventAllocation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "financialEventId" TEXT NOT NULL,
    "status" "SettlementAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "SettlementEventAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PayoutAttemptStatus" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "externalReference" TEXT,
    "failureReason" TEXT,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "actorRole" "UserRole",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "correlationId" TEXT,
    "metadata" JSONB,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicIdentifier" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicIdentifierSequence" (
    "entityType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicIdentifierSequence_pkey" PRIMARY KEY ("entityType","prefix")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQualityPolicy" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "SupplierQualityPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "measurementWindowDays" INTEGER NOT NULL,
    "shortNoticeDays" INTEGER NOT NULL,
    "lastMinuteStopSellDays" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SupplierQualityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQualityMetricRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "metricCode" "SupplierQualityMetricCode" NOT NULL,
    "dimension" "SupplierQualityDimension" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "direction" "SupplierMetricDirection" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "warningValue" DOUBLE PRECISION NOT NULL,
    "minimumSampleSize" INTEGER NOT NULL DEFAULT 1,
    "missingDataTreatment" "SupplierMetricMissingDataTreatment" NOT NULL DEFAULT 'EXCLUDE',
    "passScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "warnScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "failScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierQualityMetricRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTierRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "tier" "SupplierTier" NOT NULL,
    "minimumScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierTierRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQualitySnapshot" (
    "id" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "policyId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "recommendedTier" "SupplierTier",
    "currentTierAtCalculation" "SupplierTier",
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,
    "snapshotKey" TEXT NOT NULL,

    CONSTRAINT "SupplierQualitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQualityMetricSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricCode" "SupplierQualityMetricCode" NOT NULL,
    "dimension" "SupplierQualityDimension" NOT NULL,
    "rawValue" DOUBLE PRECISION,
    "numerator" INTEGER,
    "denominator" INTEGER,
    "sampleSize" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "status" "SupplierMetricStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "sourceTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierQualityMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTierAssignment" (
    "id" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "tier" "SupplierTier" NOT NULL,
    "sourceSnapshotId" TEXT,
    "reason" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierTierAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQualityIssue" (
    "id" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricCode" "SupplierQualityMetricCode" NOT NULL,
    "dimension" "SupplierQualityDimension" NOT NULL,
    "severity" "SupplierQualityIssueSeverity" NOT NULL,
    "status" "SupplierQualityIssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierQualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSearchObservation" (
    "id" TEXT NOT NULL,
    "agentTenantId" TEXT NOT NULL,
    "searchAttemptId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceDate" DATE NOT NULL,
    "destinationNormalized" TEXT,
    "category" TEXT,
    "subType" TEXT,
    "durationMin" INTEGER,
    "durationMax" INTEGER,
    "priceMin" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "currency" TEXT,
    "bookingMode" "BookingMode",
    "pickupIncluded" BOOLEAN,
    "minimumRating" DOUBLE PRECISION,
    "privateShared" TEXT,
    "childSuitable" BOOLEAN,
    "units" INTEGER,
    "totalPax" INTEGER NOT NULL,
    "travellerSummary" JSONB NOT NULL,
    "queryPresent" BOOLEAN NOT NULL,
    "queryHash" TEXT,
    "candidateRatePlanCount" INTEGER NOT NULL,
    "candidateSessionCount" INTEGER NOT NULL,
    "eligibleOfferCountBeforePrice" INTEGER NOT NULL,
    "resultProductCount" INTEGER NOT NULL,
    "resultOfferCount" INTEGER NOT NULL,
    "zeroResult" BOOLEAN NOT NULL,
    "eligibilityFailureCounts" JSONB NOT NULL,
    "soldOutSessionIds" JSONB NOT NULL,
    "priceDiagnostics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceSearchObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandIntelligencePolicy" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "DemandIntelligencePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "measurementWindowDays" INTEGER NOT NULL,
    "futureHorizonDays" INTEGER NOT NULL,
    "cooldownDays" INTEGER NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "DemandIntelligencePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "type" "DemandOpportunityType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultPriority" "DemandOpportunityPriority" NOT NULL,
    "minSearchCount" INTEGER,
    "minUniqueAgentCount" INTEGER,
    "maxAverageResultProducts" DOUBLE PRECISION,
    "minZeroResultRate" DOUBLE PRECISION,
    "minSoldOutSessionCount" INTEGER,
    "minSoldOutRate" DOUBLE PRECISION,
    "minConfirmedBookingCount" INTEGER,
    "minCancellationRate" DOUBLE PRECISION,
    "minPriceCeilingMissCount" INTEGER,
    "minPriceCeilingMissRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandAnalysisRun" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "horizonStart" TIMESTAMP(3) NOT NULL,
    "horizonEnd" TIMESTAMP(3) NOT NULL,
    "generatedById" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunity" (
    "id" TEXT NOT NULL,
    "opportunityKey" TEXT NOT NULL,
    "type" "DemandOpportunityType" NOT NULL,
    "source" "DemandOpportunitySource" NOT NULL,
    "status" "DemandOpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "DemandOpportunityPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "destinationNormalized" TEXT,
    "cityName" TEXT,
    "stateName" TEXT,
    "countryName" TEXT,
    "category" TEXT,
    "subType" TEXT,
    "serviceDateFrom" DATE,
    "serviceDateTo" DATE,
    "durationMin" INTEGER,
    "durationMax" INTEGER,
    "currency" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "resolutionType" "DemandOpportunityResolutionType",
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityAssessment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "sourceTrace" JSONB NOT NULL,
    "recommendedAction" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandOpportunityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityVendorTarget" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "status" "DemandTargetStatus" NOT NULL DEFAULT 'TARGETED',
    "targetedById" TEXT NOT NULL,
    "targetedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "viewedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandOpportunityVendorTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandOpportunityEvent" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandOpportunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

-- CreateIndex
CREATE INDEX "VendorOutlet_tenantId_status_name_idx" ON "VendorOutlet"("tenantId", "status", "name");

-- CreateIndex
CREATE INDEX "VendorOutlet_tenantId_isDefault_idx" ON "VendorOutlet"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "VendorOutlet_bankAccountId_tenantId_idx" ON "VendorOutlet"("bankAccountId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOutlet_tenantId_outletCode_key" ON "VendorOutlet"("tenantId", "outletCode");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOutlet_id_tenantId_key" ON "VendorOutlet"("id", "tenantId");

-- CreateIndex
CREATE INDEX "VendorBankAccount_tenantId_active_verificationStatus_idx" ON "VendorBankAccount"("tenantId", "active", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBankAccount_id_tenantId_key" ON "VendorBankAccount"("id", "tenantId");

-- CreateIndex
CREATE INDEX "UserOutletAccess_tenantId_userId_active_idx" ON "UserOutletAccess"("tenantId", "userId", "active");

-- CreateIndex
CREATE INDEX "UserOutletAccess_tenantId_outletId_active_idx" ON "UserOutletAccess"("tenantId", "outletId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "UserOutletAccess_userId_outletId_key" ON "UserOutletAccess"("userId", "outletId");

-- CreateIndex
CREATE INDEX "VendorTeamInvitationOutlet_tenantId_outletId_idx" ON "VendorTeamInvitationOutlet"("tenantId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTeamInvitationOutlet_invitationId_outletId_key" ON "VendorTeamInvitationOutlet"("invitationId", "outletId");

-- CreateIndex
CREATE INDEX "global_settings_key_idx" ON "global_settings"("key");

-- CreateIndex
CREATE INDEX "global_settings_adminId_idx" ON "global_settings"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "global_settings_tenantId_key_key" ON "global_settings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "EmailAuthChallenge_email_purpose_createdAt_idx" ON "EmailAuthChallenge"("email", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "EmailAuthChallenge_verificationTokenHash_consumedAt_idx" ON "EmailAuthChallenge"("verificationTokenHash", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTrustedDevice_tokenHash_key" ON "VendorTrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "VendorTrustedDevice_userId_expiresAt_idx" ON "VendorTrustedDevice"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ImpersonationSession_originalAdminId_createdAt_idx" ON "ImpersonationSession"("originalAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "ImpersonationSession_targetUserId_status_idx" ON "ImpersonationSession"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "ImpersonationSession_status_expiresAt_idx" ON "ImpersonationSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_tenantId_key" ON "VendorProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_voucherShortCode_key" ON "VendorProfile"("voucherShortCode");

-- CreateIndex
CREATE INDEX "VendorCommercialChangeRequest_tenantId_status_createdAt_idx" ON "VendorCommercialChangeRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VendorCommercialChangeRequest_createdById_status_idx" ON "VendorCommercialChangeRequest"("createdById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_tenantId_key" ON "AgentProfile"("tenantId");

-- CreateIndex
CREATE INDEX "AgentProfile_verificationStatus_idx" ON "AgentProfile"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommercialProfile_tenantId_key" ON "AgentCommercialProfile"("tenantId");

-- CreateIndex
CREATE INDEX "AgentCommercialChangeRequest_tenantId_status_createdAt_idx" ON "AgentCommercialChangeRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCommercialChangeRequest_createdById_status_idx" ON "AgentCommercialChangeRequest"("createdById", "status");

-- CreateIndex
CREATE INDEX "AgentWalletLedger_agentTenantId_createdAt_idx" ON "AgentWalletLedger"("agentTenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWalletCreditApprovalRequest_ledgerEntryId_key" ON "AgentWalletCreditApprovalRequest"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "AgentWalletCreditApprovalRequest_status_createdAt_idx" ON "AgentWalletCreditApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentWalletCreditApprovalRequest_agentTenantId_status_creat_idx" ON "AgentWalletCreditApprovalRequest"("agentTenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentWalletCreditApprovalRequest_requestedById_status_idx" ON "AgentWalletCreditApprovalRequest"("requestedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOnboardingApplication_tenantId_key" ON "VendorOnboardingApplication"("tenantId");

-- CreateIndex
CREATE INDEX "VendorOnboardingApplication_status_updatedAt_idx" ON "VendorOnboardingApplication"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_tenantId_visibility_idx" ON "FileAsset"("tenantId", "visibility");

-- CreateIndex
CREATE INDEX "FileAsset_purpose_entityId_idx" ON "FileAsset"("purpose", "entityId");

-- CreateIndex
CREATE INDEX "FileAsset_createdAt_idx" ON "FileAsset"("createdAt");

-- CreateIndex
CREATE INDEX "VendorDocument_tenantId_currentStatus_idx" ON "VendorDocument"("tenantId", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDocument_tenantId_type_key" ON "VendorDocument"("tenantId", "type");

-- CreateIndex
CREATE INDEX "VendorDocumentVersion_vendorDocumentId_status_idx" ON "VendorDocumentVersion"("vendorDocumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDocumentVersion_vendorDocumentId_versionNumber_key" ON "VendorDocumentVersion"("vendorDocumentId", "versionNumber");

-- CreateIndex
CREATE INDEX "Product_tenantId_status_idx" ON "Product"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Product_tenantId_outletId_status_idx" ON "Product"("tenantId", "outletId", "status");

-- CreateIndex
CREATE INDEX "Product_tenantId_deletedAt_idx" ON "Product"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_experienceMasterId_idx" ON "Product"("experienceMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_productCode_key" ON "Product"("tenantId", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sourceImportKey_key" ON "Product"("tenantId", "sourceImportKey");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_importFingerprint_key" ON "Product"("tenantId", "importFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_importIdempotencyKey_key" ON "Product"("tenantId", "importIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenantId_key" ON "Product"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ProductViewEvent_vendorTenantId_viewedAt_idx" ON "ProductViewEvent"("vendorTenantId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductViewEvent_productId_viewedAt_idx" ON "ProductViewEvent"("productId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductViewEvent_viewerTenantId_viewedAt_idx" ON "ProductViewEvent"("viewerTenantId", "viewedAt");

-- CreateIndex
CREATE INDEX "ActivityPriceApplyRequest_productId_createdAt_idx" ON "ActivityPriceApplyRequest"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityPriceApplyRequest_tenantId_idempotencyKey_key" ON "ActivityPriceApplyRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VendorReview_tenantId_reviewedAt_idx" ON "VendorReview"("tenantId", "reviewedAt");

-- CreateIndex
CREATE INDEX "VendorReview_tenantId_status_vendorReply_idx" ON "VendorReview"("tenantId", "status", "vendorReply");

-- CreateIndex
CREATE INDEX "VendorReview_productId_reviewedAt_idx" ON "VendorReview"("productId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorReview_source_sourceReviewId_key" ON "VendorReview"("source", "sourceReviewId");

-- CreateIndex
CREATE INDEX "ExperienceMaster_canonicalName_idx" ON "ExperienceMaster"("canonicalName");

-- CreateIndex
CREATE INDEX "ExperienceMaster_cityName_stateName_countryName_idx" ON "ExperienceMaster"("cityName", "stateName", "countryName");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceSelectionRuleSet_scope_key" ON "ExperienceSelectionRuleSet"("scope");

-- CreateIndex
CREATE INDEX "ExperienceSelectionRuleSet_status_idx" ON "ExperienceSelectionRuleSet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyBox_experienceMasterId_key" ON "BuyBox"("experienceMasterId");

-- CreateIndex
CREATE INDEX "BuyBox_status_startsAt_endsAt_idx" ON "BuyBox"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BuyBoxOffer_vendorId_status_idx" ON "BuyBoxOffer"("vendorId", "status");

-- CreateIndex
CREATE INDEX "BuyBoxOffer_buyBoxId_status_idx" ON "BuyBoxOffer"("buyBoxId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyBoxOffer_buyBoxId_productId_key" ON "BuyBoxOffer"("buyBoxId", "productId");

-- CreateIndex
CREATE INDEX "BuyBoxBid_buyBoxOfferId_status_submittedAt_idx" ON "BuyBoxBid"("buyBoxOfferId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "BuyBoxBid_vendorId_status_idx" ON "BuyBoxBid"("vendorId", "status");

-- CreateIndex
CREATE INDEX "ExperienceOfferPlacement_experienceMasterId_priority_idx" ON "ExperienceOfferPlacement"("experienceMasterId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceOfferPlacement_experienceMasterId_productId_key" ON "ExperienceOfferPlacement"("experienceMasterId", "productId");

-- CreateIndex
CREATE INDEX "ExperienceMasterOption_experienceMasterId_active_idx" ON "ExperienceMasterOption"("experienceMasterId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceMasterOption_experienceMasterId_optionKey_key" ON "ExperienceMasterOption"("experienceMasterId", "optionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceMasterOptionPlacement_productVariantId_key" ON "ExperienceMasterOptionPlacement"("productVariantId");

-- CreateIndex
CREATE INDEX "ExperienceMasterOptionPlacement_masterOptionId_idx" ON "ExperienceMasterOptionPlacement"("masterOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceSelectionLock_bookingId_key" ON "ExperienceSelectionLock"("bookingId");

-- CreateIndex
CREATE INDEX "ExperienceSelectionLock_agentTenantId_expiresAt_idx" ON "ExperienceSelectionLock"("agentTenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "ExperienceSelectionLock_productId_ratePlanId_sessionId_idx" ON "ExperienceSelectionLock"("productId", "ratePlanId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceSelectionLock_agentTenantId_searchAttemptId_exper_key" ON "ExperienceSelectionLock"("agentTenantId", "searchAttemptId", "experienceMasterId");

-- CreateIndex
CREATE INDEX "ProductMatchSuggestion_status_createdAt_idx" ON "ProductMatchSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductMatchSuggestion_fingerprint_idx" ON "ProductMatchSuggestion"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMatchSuggestion_sourceProductId_candidateProductId_key" ON "ProductMatchSuggestion"("sourceProductId", "candidateProductId");

-- CreateIndex
CREATE INDEX "ProductRevision_productId_status_idx" ON "ProductRevision"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRevision_productId_versionNumber_key" ON "ProductRevision"("productId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRevision_id_productId_key" ON "ProductRevision"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFulfilmentPolicy_productRevisionId_key" ON "ProductFulfilmentPolicy"("productRevisionId");

-- CreateIndex
CREATE INDEX "ProductMedia_revisionId_kind_idx" ON "ProductMedia"("revisionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityCategory_code_key" ON "ActivityCategory"("code");

-- CreateIndex
CREATE INDEX "ActivityCategory_active_displayOrder_idx" ON "ActivityCategory"("active", "displayOrder");

-- CreateIndex
CREATE INDEX "ActivitySubcategory_categoryId_active_displayOrder_idx" ON "ActivitySubcategory"("categoryId", "active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubcategory_categoryId_code_key" ON "ActivitySubcategory"("categoryId", "code");

-- CreateIndex
CREATE INDEX "ItineraryStop_productRevisionId_sequence_idx" ON "ItineraryStop"("productRevisionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryStop_productRevisionId_sequence_key" ON "ItineraryStop"("productRevisionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ProductLocationVerification_productRevisionId_key" ON "ProductLocationVerification"("productRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTeamInvitation_tokenHash_key" ON "VendorTeamInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "VendorTeamInvitation_tenantId_status_idx" ON "VendorTeamInvitation"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTeamInvitation_tenantId_email_key" ON "VendorTeamInvitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTeamInvitation_id_tenantId_key" ON "VendorTeamInvitation"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_status_idx" ON "ReportSchedule"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VendorReportExport_tenantId_createdAt_idx" ON "VendorReportExport"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorReportExport_status_createdAt_idx" ON "VendorReportExport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductBookingQuestion_productRevisionId_archivedAt_rank_idx" ON "ProductBookingQuestion"("productRevisionId", "archivedAt", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBookingQuestion_productRevisionId_code_key" ON "ProductBookingQuestion"("productRevisionId", "code");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_status_idx" ON "ProductVariant"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductVariant_revisionId_status_idx" ON "ProductVariant"("revisionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_revisionId_variantCode_key" ON "ProductVariant"("productId", "revisionId", "variantCode");

-- CreateIndex
CREATE INDEX "ProductVariantTicketType_variantId_rank_idx" ON "ProductVariantTicketType"("variantId", "rank");

-- CreateIndex
CREATE INDEX "ProductVariantUnit_variantId_rank_idx" ON "ProductVariantUnit"("variantId", "rank");

-- CreateIndex
CREATE INDEX "RatePlan_variantId_status_idx" ON "RatePlan"("variantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_variantId_ratePlanCode_key" ON "RatePlan"("variantId", "ratePlanCode");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionChannel_code_key" ON "DistributionChannel"("code");

-- CreateIndex
CREATE INDEX "RatePlanChannelMapping_channelId_status_idx" ON "RatePlanChannelMapping"("channelId", "status");

-- CreateIndex
CREATE INDEX "RatePlanChannelMapping_channelId_enabled_idx" ON "RatePlanChannelMapping"("channelId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanChannelMapping_ratePlanId_channelId_key" ON "RatePlanChannelMapping"("ratePlanId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanChannelMapping_channelId_externalRatePlanCode_key" ON "RatePlanChannelMapping"("channelId", "externalRatePlanCode");

-- CreateIndex
CREATE INDEX "ChannelContract_channelId_status_idx" ON "ChannelContract"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelContract_channelId_versionNumber_key" ON "ChannelContract"("channelId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProductChannelMapping_channelId_status_idx" ON "ProductChannelMapping"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelMapping_channelId_productId_key" ON "ProductChannelMapping"("channelId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelMapping_channelId_externalProductCode_key" ON "ProductChannelMapping"("channelId", "externalProductCode");

-- CreateIndex
CREATE INDEX "VariantChannelMapping_channelId_status_idx" ON "VariantChannelMapping"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VariantChannelMapping_channelId_variantId_key" ON "VariantChannelMapping"("channelId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantChannelMapping_channelId_externalVariantCode_key" ON "VariantChannelMapping"("channelId", "externalVariantCode");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelInventoryRule_ratePlanChannelMappingId_key" ON "ChannelInventoryRule"("ratePlanChannelMappingId");

-- CreateIndex
CREATE INDEX "ChannelApiCredential_channelId_status_idx" ON "ChannelApiCredential"("channelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelApiCredential_keyPrefix_key" ON "ChannelApiCredential"("keyPrefix");

-- CreateIndex
CREATE INDEX "DistributionEvent_channelId_createdAt_id_idx" ON "DistributionEvent"("channelId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionEvent_channelId_sourceOutboxEventId_type_resour_key" ON "DistributionEvent"("channelId", "sourceOutboxEventId", "type", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TravellerRule_ratePlanId_type_key" ON "TravellerRule"("ratePlanId", "type");

-- CreateIndex
CREATE INDEX "RatePlanCommercialVersion_ratePlanId_status_idx" ON "RatePlanCommercialVersion"("ratePlanId", "status");

-- CreateIndex
CREATE INDEX "RatePlanCommercialVersion_effectiveFrom_effectiveTo_idx" ON "RatePlanCommercialVersion"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanCommercialVersion_ratePlanId_versionNumber_key" ON "RatePlanCommercialVersion"("ratePlanId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanTravellerPrice_commercialVersionId_travellerType_key" ON "RatePlanTravellerPrice"("commercialVersionId", "travellerType");

-- CreateIndex
CREATE UNIQUE INDEX "AgentGroup_code_key" ON "AgentGroup"("code");

-- CreateIndex
CREATE INDEX "AgentGroupMember_agentTenantId_idx" ON "AgentGroupMember"("agentTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentGroupMember_agentGroupId_agentTenantId_key" ON "AgentGroupMember"("agentGroupId", "agentTenantId");

-- CreateIndex
CREATE INDEX "CommercialRule_scopeType_vendorTenantId_productId_variantId_idx" ON "CommercialRule"("scopeType", "vendorTenantId", "productId", "variantId", "ratePlanId", "agentGroupId", "agentTenantId");

-- CreateIndex
CREATE INDEX "CommercialRule_distributionChannelId_scopeType_idx" ON "CommercialRule"("distributionChannelId", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialRule_code_scopeType_key" ON "CommercialRule"("code", "scopeType");

-- CreateIndex
CREATE INDEX "CommercialRuleVersion_ruleId_status_idx" ON "CommercialRuleVersion"("ruleId", "status");

-- CreateIndex
CREATE INDEX "CommercialRuleVersion_effectiveFrom_effectiveTo_idx" ON "CommercialRuleVersion"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialRuleVersion_ruleId_versionNumber_key" ON "CommercialRuleVersion"("ruleId", "versionNumber");

-- CreateIndex
CREATE INDEX "CancellationRule_ratePlanId_minDaysBefore_idx" ON "CancellationRule"("ratePlanId", "minDaysBefore");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_variantId_status_idx" ON "ScheduleTemplate"("variantId", "status");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_variantId_effectiveFrom_effectiveTo_idx" ON "ScheduleTemplate"("variantId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplate_variantId_scheduleCode_key" ON "ScheduleTemplate"("variantId", "scheduleCode");

-- CreateIndex
CREATE INDEX "ScheduleSlotTemplate_scheduleTemplateId_active_rank_idx" ON "ScheduleSlotTemplate"("scheduleTemplateId", "active", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSlotTemplate_scheduleTemplateId_slotCode_key" ON "ScheduleSlotTemplate"("scheduleTemplateId", "slotCode");

-- CreateIndex
CREATE INDEX "RatePlanSchedule_scheduleTemplateId_active_idx" ON "RatePlanSchedule"("scheduleTemplateId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanSchedule_ratePlanId_scheduleTemplateId_key" ON "RatePlanSchedule"("ratePlanId", "scheduleTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleException_exceptionKey_key" ON "ScheduleException"("exceptionKey");

-- CreateIndex
CREATE INDEX "ScheduleException_scheduleTemplateId_serviceDate_slotTempla_idx" ON "ScheduleException"("scheduleTemplateId", "serviceDate", "slotTemplateId");

-- CreateIndex
CREATE INDEX "ServiceSession_serviceDate_status_idx" ON "ServiceSession"("serviceDate", "status");

-- CreateIndex
CREATE INDEX "ServiceSession_scheduleTemplateId_serviceDate_idx" ON "ServiceSession"("scheduleTemplateId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSession_scheduleTemplateId_serviceDate_sessionKey_key" ON "ServiceSession"("scheduleTemplateId", "serviceDate", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryState_sessionId_key" ON "InventoryState"("sessionId");

-- CreateIndex
CREATE INDEX "InventoryHold_inventoryStateId_status_idx" ON "InventoryHold"("inventoryStateId", "status");

-- CreateIndex
CREATE INDEX "InventoryHold_inventoryStateId_referenceKey_idx" ON "InventoryHold"("inventoryStateId", "referenceKey");

-- CreateIndex
CREATE INDEX "InventoryHold_status_expiresAt_idx" ON "InventoryHold"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAllocation_sourceHoldId_key" ON "InventoryAllocation"("sourceHoldId");

-- CreateIndex
CREATE INDEX "InventoryAllocation_inventoryStateId_status_idx" ON "InventoryAllocation"("inventoryStateId", "status");

-- CreateIndex
CREATE INDEX "InventoryAllocation_inventoryStateId_referenceKey_idx" ON "InventoryAllocation"("inventoryStateId", "referenceKey");

-- CreateIndex
CREATE INDEX "Resource_tenantId_outletId_active_type_idx" ON "Resource"("tenantId", "outletId", "active", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_tenantId_outletId_resourceCode_key" ON "Resource"("tenantId", "outletId", "resourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResourceRequirement_requirementKey_key" ON "ScheduleResourceRequirement"("requirementKey");

-- CreateIndex
CREATE INDEX "ScheduleResourceRequirement_scheduleTemplateId_resourceType_idx" ON "ScheduleResourceRequirement"("scheduleTemplateId", "resourceType");

-- CreateIndex
CREATE INDEX "SessionResourceAllocation_resourceId_sessionId_idx" ON "SessionResourceAllocation"("resourceId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionResourceAllocation_sessionId_resourceId_key" ON "SessionResourceAllocation"("sessionId", "resourceId");

-- CreateIndex
CREATE INDEX "Promotion_productId_active_idx" ON "Promotion"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCoupon_code_key" ON "PlatformCoupon"("code");

-- CreateIndex
CREATE INDEX "PlatformCoupon_status_startsAt_endsAt_idx" ON "PlatformCoupon"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PricingRule_productId_active_idx" ON "PricingRule"("productId", "active");

-- CreateIndex
CREATE INDEX "PricingRule_startsAt_endsAt_idx" ON "PricingRule"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingCode_key" ON "Booking"("bookingCode");

-- CreateIndex
CREATE INDEX "Booking_vendorTenantId_status_idx" ON "Booking"("vendorTenantId", "status");

-- CreateIndex
CREATE INDEX "Booking_vendorTenantId_outletId_status_idx" ON "Booking"("vendorTenantId", "outletId", "status");

-- CreateIndex
CREATE INDEX "Booking_agentTenantId_status_idx" ON "Booking"("agentTenantId", "status");

-- CreateIndex
CREATE INDEX "Booking_sessionId_status_idx" ON "Booking"("sessionId", "status");

-- CreateIndex
CREATE INDEX "Booking_confirmationDueAt_status_idx" ON "Booking"("confirmationDueAt", "status");

-- CreateIndex
CREATE INDEX "Booking_vendorTenantId_serviceDate_idx" ON "Booking"("vendorTenantId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_agentTenantId_idempotencyKey_key" ON "Booking"("agentTenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_id_vendorTenantId_key" ON "Booking"("id", "vendorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSnapshot_bookingId_key" ON "BookingSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "BookingTraveller_bookingId_travellerType_idx" ON "BookingTraveller"("bookingId", "travellerType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingTraveller_bookingId_sequence_key" ON "BookingTraveller"("bookingId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BookingFulfilment_bookingId_key" ON "BookingFulfilment"("bookingId");

-- CreateIndex
CREATE INDEX "BookingFulfilment_status_generationStatus_generationLeaseEx_idx" ON "BookingFulfilment"("status", "generationStatus", "generationLeaseExpiresAt", "generationRequestedAt");

-- CreateIndex
CREATE INDEX "FulfilmentEvidence_fulfilmentId_kind_status_idx" ON "FulfilmentEvidence"("fulfilmentId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FulfilmentEvidence_fulfilmentId_kind_versionNumber_key" ON "FulfilmentEvidence"("fulfilmentId", "kind", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherVersion_voucherCode_key" ON "VoucherVersion"("voucherCode");

-- CreateIndex
CREATE INDEX "VoucherVersion_bookingId_status_idx" ON "VoucherVersion"("bookingId", "status");

-- CreateIndex
CREATE INDEX "VoucherVersion_fulfilmentId_status_idx" ON "VoucherVersion"("fulfilmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherVersion_bookingId_versionNumber_key" ON "VoucherVersion"("bookingId", "versionNumber");

-- CreateIndex
CREATE INDEX "VoucherShareEvent_bookingId_createdAt_idx" ON "VoucherShareEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "VoucherShareEvent_voucherVersionId_channel_idx" ON "VoucherShareEvent"("voucherVersionId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRedemption_bookingId_key" ON "BookingRedemption"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRedemption_fulfilmentId_key" ON "BookingRedemption"("fulfilmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRedemption_voucherVersionId_key" ON "BookingRedemption"("voucherVersionId");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingEconomicsSnapshot_bookingId_key" ON "BookingEconomicsSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "BookingEconomicsSnapshot_ratePlanCommercialVersionId_idx" ON "BookingEconomicsSnapshot"("ratePlanCommercialVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCancellation_bookingId_key" ON "BookingCancellation"("bookingId");

-- CreateIndex
CREATE INDEX "BookingCancellation_initiator_financialState_idx" ON "BookingCancellation"("initiator", "financialState");

-- CreateIndex
CREATE INDEX "BookingCancellation_financialState_createdAt_idx" ON "BookingCancellation"("financialState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCancellation_bookingId_idempotencyKey_key" ON "BookingCancellation"("bookingId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_cancellationId_key" ON "Refund"("cancellationId");

-- CreateIndex
CREATE INDEX "Refund_bookingId_status_idx" ON "Refund"("bookingId", "status");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialEvent_eventKey_key" ON "FinancialEvent"("eventKey");

-- CreateIndex
CREATE INDEX "FinancialEvent_bookingId_occurredAt_idx" ON "FinancialEvent"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_vendorTenantId_occurredAt_idx" ON "FinancialEvent"("vendorTenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_vendorTenantId_outletId_occurredAt_idx" ON "FinancialEvent"("vendorTenantId", "outletId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialEvent_type_status_occurredAt_idx" ON "FinancialEvent"("type", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_settlementBatchId_key" ON "Payout"("settlementBatchId");

-- CreateIndex
CREATE INDEX "Payout_tenantId_status_idx" ON "Payout"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payout_tenantId_outletId_status_idx" ON "Payout"("tenantId", "outletId", "status");

-- CreateIndex
CREATE INDEX "PayoutReleaseApprovalRequest_payoutId_status_createdAt_idx" ON "PayoutReleaseApprovalRequest"("payoutId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutReleaseApprovalRequest_requestedById_status_idx" ON "PayoutReleaseApprovalRequest"("requestedById", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSettlementPolicy_vendorTenantId_key" ON "VendorSettlementPolicy"("vendorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationVendorSettlementResolution_cancellationId_key" ON "CancellationVendorSettlementResolution"("cancellationId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationVendorSettlementResolution_financialEventId_key" ON "CancellationVendorSettlementResolution"("financialEventId");

-- CreateIndex
CREATE INDEX "SettlementHold_vendorTenantId_status_idx" ON "SettlementHold"("vendorTenantId", "status");

-- CreateIndex
CREATE INDEX "SettlementHold_bookingId_status_idx" ON "SettlementHold"("bookingId", "status");

-- CreateIndex
CREATE INDEX "SettlementHold_financialEventId_status_idx" ON "SettlementHold"("financialEventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_batchCode_key" ON "SettlementBatch"("batchCode");

-- CreateIndex
CREATE INDEX "SettlementBatch_vendorTenantId_status_createdAt_idx" ON "SettlementBatch"("vendorTenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementBatch_vendorTenantId_outletId_status_createdAt_idx" ON "SettlementBatch"("vendorTenantId", "outletId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInvoice_invoiceNumber_key" ON "CommissionInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInvoice_settlementBatchId_key" ON "CommissionInvoice"("settlementBatchId");

-- CreateIndex
CREATE INDEX "CommissionInvoice_financialYear_status_createdAt_idx" ON "CommissionInvoice"("financialYear", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionInvoice_vendorTenantId_createdAt_idx" ON "CommissionInvoice"("vendorTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementLine_batchId_idx" ON "SettlementLine"("batchId");

-- CreateIndex
CREATE INDEX "SettlementLine_bookingId_idx" ON "SettlementLine"("bookingId");

-- CreateIndex
CREATE INDEX "SettlementEventAllocation_financialEventId_status_idx" ON "SettlementEventAllocation"("financialEventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_payoutId_attemptNumber_key" ON "PayoutAttempt"("payoutId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicIdentifier_publicCode_key" ON "PublicIdentifier"("publicCode");

-- CreateIndex
CREATE INDEX "PublicIdentifier_entityType_publicCode_idx" ON "PublicIdentifier"("entityType", "publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "PublicIdentifier_entityType_entityId_key" ON "PublicIdentifier"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenantId_createdAt_idx" ON "OutboxEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQualityPolicy_versionNumber_key" ON "SupplierQualityPolicy"("versionNumber");

-- CreateIndex
CREATE INDEX "SupplierQualityPolicy_status_idx" ON "SupplierQualityPolicy"("status");

-- CreateIndex
CREATE INDEX "SupplierQualityPolicy_activatedAt_idx" ON "SupplierQualityPolicy"("activatedAt");

-- CreateIndex
CREATE INDEX "SupplierQualityMetricRule_policyId_enabled_rank_idx" ON "SupplierQualityMetricRule"("policyId", "enabled", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQualityMetricRule_policyId_metricCode_key" ON "SupplierQualityMetricRule"("policyId", "metricCode");

-- CreateIndex
CREATE INDEX "SupplierTierRule_policyId_minimumScore_idx" ON "SupplierTierRule"("policyId", "minimumScore");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTierRule_policyId_tier_key" ON "SupplierTierRule"("policyId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQualitySnapshot_snapshotKey_key" ON "SupplierQualitySnapshot"("snapshotKey");

-- CreateIndex
CREATE INDEX "SupplierQualitySnapshot_vendorTenantId_generatedAt_idx" ON "SupplierQualitySnapshot"("vendorTenantId", "generatedAt");

-- CreateIndex
CREATE INDEX "SupplierQualitySnapshot_vendorTenantId_windowStart_windowEn_idx" ON "SupplierQualitySnapshot"("vendorTenantId", "windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "SupplierQualityMetricSnapshot_metricCode_status_idx" ON "SupplierQualityMetricSnapshot"("metricCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQualityMetricSnapshot_snapshotId_metricCode_key" ON "SupplierQualityMetricSnapshot"("snapshotId", "metricCode");

-- CreateIndex
CREATE INDEX "SupplierTierAssignment_vendorTenantId_effectiveFrom_idx" ON "SupplierTierAssignment"("vendorTenantId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SupplierTierAssignment_vendorTenantId_effectiveTo_idx" ON "SupplierTierAssignment"("vendorTenantId", "effectiveTo");

-- CreateIndex
CREATE INDEX "SupplierQualityIssue_vendorTenantId_status_createdAt_idx" ON "SupplierQualityIssue"("vendorTenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierQualityIssue_metricCode_status_idx" ON "SupplierQualityIssue"("metricCode", "status");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_observedAt_idx" ON "MarketplaceSearchObservation"("observedAt");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_serviceDate_idx" ON "MarketplaceSearchObservation"("serviceDate");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_destinationNormalized_idx" ON "MarketplaceSearchObservation"("destinationNormalized");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_category_idx" ON "MarketplaceSearchObservation"("category");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_subType_idx" ON "MarketplaceSearchObservation"("subType");

-- CreateIndex
CREATE INDEX "MarketplaceSearchObservation_agentTenantId_idx" ON "MarketplaceSearchObservation"("agentTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSearchObservation_agentTenantId_searchAttemptId_key" ON "MarketplaceSearchObservation"("agentTenantId", "searchAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "DemandIntelligencePolicy_versionNumber_key" ON "DemandIntelligencePolicy"("versionNumber");

-- CreateIndex
CREATE INDEX "DemandIntelligencePolicy_status_idx" ON "DemandIntelligencePolicy"("status");

-- CreateIndex
CREATE INDEX "DemandOpportunityRule_type_enabled_idx" ON "DemandOpportunityRule"("type", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DemandOpportunityRule_policyId_type_key" ON "DemandOpportunityRule"("policyId", "type");

-- CreateIndex
CREATE INDEX "DemandAnalysisRun_policyId_generatedAt_idx" ON "DemandAnalysisRun"("policyId", "generatedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunity_opportunityKey_status_idx" ON "DemandOpportunity"("opportunityKey", "status");

-- CreateIndex
CREATE INDEX "DemandOpportunity_status_priority_lastDetectedAt_idx" ON "DemandOpportunity"("status", "priority", "lastDetectedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunity_type_status_idx" ON "DemandOpportunity"("type", "status");

-- CreateIndex
CREATE INDEX "DemandOpportunity_destinationNormalized_serviceDateFrom_idx" ON "DemandOpportunity"("destinationNormalized", "serviceDateFrom");

-- CreateIndex
CREATE INDEX "DemandOpportunityAssessment_opportunityId_generatedAt_idx" ON "DemandOpportunityAssessment"("opportunityId", "generatedAt");

-- CreateIndex
CREATE INDEX "DemandOpportunityAssessment_analysisRunId_idx" ON "DemandOpportunityAssessment"("analysisRunId");

-- CreateIndex
CREATE INDEX "DemandOpportunityVendorTarget_vendorTenantId_status_idx" ON "DemandOpportunityVendorTarget"("vendorTenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DemandOpportunityVendorTarget_opportunityId_vendorTenantId_key" ON "DemandOpportunityVendorTarget"("opportunityId", "vendorTenantId");

-- CreateIndex
CREATE INDEX "DemandOpportunityEvent_opportunityId_createdAt_idx" ON "DemandOpportunityEvent"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandOpportunityEvent_eventType_createdAt_idx" ON "DemandOpportunityEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOutlet" ADD CONSTRAINT "VendorOutlet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOutlet" ADD CONSTRAINT "VendorOutlet_bankAccountId_tenantId_fkey" FOREIGN KEY ("bankAccountId", "tenantId") REFERENCES "VendorBankAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBankAccount" ADD CONSTRAINT "VendorBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutletAccess" ADD CONSTRAINT "UserOutletAccess_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_invitationId_tenantId_fkey" FOREIGN KEY ("invitationId", "tenantId") REFERENCES "VendorTeamInvitation"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTeamInvitationOutlet" ADD CONSTRAINT "VendorTeamInvitationOutlet_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTrustedDevice" ADD CONSTRAINT "VendorTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProfile" ADD CONSTRAINT "VendorProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCommercialChangeRequest" ADD CONSTRAINT "VendorCommercialChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCommercialChangeRequest" ADD CONSTRAINT "VendorCommercialChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCommercialChangeRequest" ADD CONSTRAINT "VendorCommercialChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommercialProfile" ADD CONSTRAINT "AgentCommercialProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommercialChangeRequest" ADD CONSTRAINT "AgentCommercialChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWalletLedger" ADD CONSTRAINT "AgentWalletLedger_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWalletCreditApprovalRequest" ADD CONSTRAINT "AgentWalletCreditApprovalRequest_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWalletCreditApprovalRequest" ADD CONSTRAINT "AgentWalletCreditApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWalletCreditApprovalRequest" ADD CONSTRAINT "AgentWalletCreditApprovalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWalletCreditApprovalRequest" ADD CONSTRAINT "AgentWalletCreditApprovalRequest_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "AgentWalletLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOnboardingApplication" ADD CONSTRAINT "VendorOnboardingApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_vendorDocumentId_fkey" FOREIGN KEY ("vendorDocumentId") REFERENCES "VendorDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocumentVersion" ADD CONSTRAINT "VendorDocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_currentRevisionId_id_fkey" FOREIGN KEY ("currentRevisionId", "id") REFERENCES "ProductRevision"("id", "productId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_viewerTenantId_fkey" FOREIGN KEY ("viewerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPriceApplyRequest" ADD CONSTRAINT "ActivityPriceApplyRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBox" ADD CONSTRAINT "BuyBox_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_buyBoxId_fkey" FOREIGN KEY ("buyBoxId") REFERENCES "BuyBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBoxOffer" ADD CONSTRAINT "BuyBoxOffer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBoxBid" ADD CONSTRAINT "BuyBoxBid_buyBoxOfferId_fkey" FOREIGN KEY ("buyBoxOfferId") REFERENCES "BuyBoxOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyBoxBid" ADD CONSTRAINT "BuyBoxBid_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceOfferPlacement" ADD CONSTRAINT "ExperienceOfferPlacement_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceOfferPlacement" ADD CONSTRAINT "ExperienceOfferPlacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceMasterOption" ADD CONSTRAINT "ExperienceMasterOption_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceMasterOptionPlacement" ADD CONSTRAINT "ExperienceMasterOptionPlacement_masterOptionId_fkey" FOREIGN KEY ("masterOptionId") REFERENCES "ExperienceMasterOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceMasterOptionPlacement" ADD CONSTRAINT "ExperienceMasterOptionPlacement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_candidateProductId_fkey" FOREIGN KEY ("candidateProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatchSuggestion" ADD CONSTRAINT "ProductMatchSuggestion_experienceMasterId_fkey" FOREIGN KEY ("experienceMasterId") REFERENCES "ExperienceMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRevision" ADD CONSTRAINT "ProductRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFulfilmentPolicy" ADD CONSTRAINT "ProductFulfilmentPolicy_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubcategory" ADD CONSTRAINT "ActivitySubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ActivityCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryStop" ADD CONSTRAINT "ItineraryStop_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLocationVerification" ADD CONSTRAINT "ProductLocationVerification_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorTeamInvitation" ADD CONSTRAINT "VendorTeamInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReportExport" ADD CONSTRAINT "VendorReportExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReportExport" ADD CONSTRAINT "VendorReportExport_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBookingQuestion" ADD CONSTRAINT "ProductBookingQuestion_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ProductRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantTicketType" ADD CONSTRAINT "ProductVariantTicketType_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantUnit" ADD CONSTRAINT "ProductVariantUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelMapping" ADD CONSTRAINT "ProductChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantChannelMapping" ADD CONSTRAINT "VariantChannelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelInventoryRule" ADD CONSTRAINT "ChannelInventoryRule_ratePlanChannelMappingId_fkey" FOREIGN KEY ("ratePlanChannelMappingId") REFERENCES "RatePlanChannelMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelApiCredential" ADD CONSTRAINT "ChannelApiCredential_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionEvent" ADD CONSTRAINT "DistributionEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravellerRule" ADD CONSTRAINT "TravellerRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanTravellerPrice" ADD CONSTRAINT "RatePlanTravellerPrice_commercialVersionId_fkey" FOREIGN KEY ("commercialVersionId") REFERENCES "RatePlanCommercialVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGroupMember" ADD CONSTRAINT "AgentGroupMember_agentGroupId_fkey" FOREIGN KEY ("agentGroupId") REFERENCES "AgentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGroupMember" ADD CONSTRAINT "AgentGroupMember_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_agentGroupId_fkey" FOREIGN KEY ("agentGroupId") REFERENCES "AgentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_distributionChannelId_fkey" FOREIGN KEY ("distributionChannelId") REFERENCES "DistributionChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommercialRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRule" ADD CONSTRAINT "CancellationRule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlotTemplate" ADD CONSTRAINT "ScheduleSlotTemplate_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanSchedule" ADD CONSTRAINT "RatePlanSchedule_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanSchedule" ADD CONSTRAINT "RatePlanSchedule_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_slotTemplateId_fkey" FOREIGN KEY ("slotTemplateId") REFERENCES "ScheduleSlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSession" ADD CONSTRAINT "ServiceSession_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSession" ADD CONSTRAINT "ServiceSession_slotTemplateId_fkey" FOREIGN KEY ("slotTemplateId") REFERENCES "ScheduleSlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryState" ADD CONSTRAINT "InventoryState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_inventoryStateId_fkey" FOREIGN KEY ("inventoryStateId") REFERENCES "InventoryState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_inventoryStateId_fkey" FOREIGN KEY ("inventoryStateId") REFERENCES "InventoryState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_sourceHoldId_fkey" FOREIGN KEY ("sourceHoldId") REFERENCES "InventoryHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResourceRequirement" ADD CONSTRAINT "ScheduleResourceRequirement_scheduleTemplateId_fkey" FOREIGN KEY ("scheduleTemplateId") REFERENCES "ScheduleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResourceRequirement" ADD CONSTRAINT "ScheduleResourceRequirement_specificResourceId_fkey" FOREIGN KEY ("specificResourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResourceAllocation" ADD CONSTRAINT "SessionResourceAllocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionResourceAllocation" ADD CONSTRAINT "SessionResourceAllocation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_outletId_vendorTenantId_fkey" FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_productRevisionId_fkey" FOREIGN KEY ("productRevisionId") REFERENCES "ProductRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ServiceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_distributionChannelId_fkey" FOREIGN KEY ("distributionChannelId") REFERENCES "DistributionChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSnapshot" ADD CONSTRAINT "BookingSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTraveller" ADD CONSTRAINT "BookingTraveller_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFulfilment" ADD CONSTRAINT "BookingFulfilment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentEvidence" ADD CONSTRAINT "FulfilmentEvidence_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentEvidence" ADD CONSTRAINT "FulfilmentEvidence_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherVersion" ADD CONSTRAINT "VoucherVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherShareEvent" ADD CONSTRAINT "VoucherShareEvent_voucherVersionId_fkey" FOREIGN KEY ("voucherVersionId") REFERENCES "VoucherVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_fulfilmentId_fkey" FOREIGN KEY ("fulfilmentId") REFERENCES "BookingFulfilment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRedemption" ADD CONSTRAINT "BookingRedemption_voucherVersionId_fkey" FOREIGN KEY ("voucherVersionId") REFERENCES "VoucherVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEconomicsSnapshot" ADD CONSTRAINT "BookingEconomicsSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEconomicsSnapshot" ADD CONSTRAINT "BookingEconomicsSnapshot_ratePlanCommercialVersionId_fkey" FOREIGN KEY ("ratePlanCommercialVersionId") REFERENCES "RatePlanCommercialVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCancellation" ADD CONSTRAINT "BookingCancellation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "BookingCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_outletId_vendorTenantId_fkey" FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "BookingCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEvent" ADD CONSTRAINT "FinancialEvent_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_outletId_tenantId_fkey" FOREIGN KEY ("outletId", "tenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bankAccountId_tenantId_fkey" FOREIGN KEY ("bankAccountId", "tenantId") REFERENCES "VendorBankAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutReleaseApprovalRequest" ADD CONSTRAINT "PayoutReleaseApprovalRequest_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutReleaseApprovalRequest" ADD CONSTRAINT "PayoutReleaseApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutReleaseApprovalRequest" ADD CONSTRAINT "PayoutReleaseApprovalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSettlementPolicy" ADD CONSTRAINT "VendorSettlementPolicy_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationVendorSettlementResolution" ADD CONSTRAINT "CancellationVendorSettlementResolution_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "BookingCancellation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationVendorSettlementResolution" ADD CONSTRAINT "CancellationVendorSettlementResolution_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationVendorSettlementResolution" ADD CONSTRAINT "CancellationVendorSettlementResolution_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationVendorSettlementResolution" ADD CONSTRAINT "CancellationVendorSettlementResolution_financialEventId_fkey" FOREIGN KEY ("financialEventId") REFERENCES "FinancialEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_financialEventId_fkey" FOREIGN KEY ("financialEventId") REFERENCES "FinancialEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_outletId_vendorTenantId_fkey" FOREIGN KEY ("outletId", "vendorTenantId") REFERENCES "VendorOutlet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEventAllocation" ADD CONSTRAINT "SettlementEventAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEventAllocation" ADD CONSTRAINT "SettlementEventAllocation_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SettlementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEventAllocation" ADD CONSTRAINT "SettlementEventAllocation_financialEventId_fkey" FOREIGN KEY ("financialEventId") REFERENCES "FinancialEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityPolicy" ADD CONSTRAINT "SupplierQualityPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityPolicy" ADD CONSTRAINT "SupplierQualityPolicy_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityMetricRule" ADD CONSTRAINT "SupplierQualityMetricRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SupplierQualityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTierRule" ADD CONSTRAINT "SupplierTierRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SupplierQualityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualitySnapshot" ADD CONSTRAINT "SupplierQualitySnapshot_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualitySnapshot" ADD CONSTRAINT "SupplierQualitySnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SupplierQualityPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityMetricSnapshot" ADD CONSTRAINT "SupplierQualityMetricSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SupplierQualitySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "SupplierQualitySnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTierAssignment" ADD CONSTRAINT "SupplierTierAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SupplierQualitySnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQualityIssue" ADD CONSTRAINT "SupplierQualityIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSearchObservation" ADD CONSTRAINT "MarketplaceSearchObservation_agentTenantId_fkey" FOREIGN KEY ("agentTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandIntelligencePolicy" ADD CONSTRAINT "DemandIntelligencePolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandIntelligencePolicy" ADD CONSTRAINT "DemandIntelligencePolicy_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityRule" ADD CONSTRAINT "DemandOpportunityRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandAnalysisRun" ADD CONSTRAINT "DemandAnalysisRun_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandAnalysisRun" ADD CONSTRAINT "DemandAnalysisRun_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunity" ADD CONSTRAINT "DemandOpportunity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "DemandAnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityAssessment" ADD CONSTRAINT "DemandOpportunityAssessment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "DemandIntelligencePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_vendorTenantId_fkey" FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_targetedById_fkey" FOREIGN KEY ("targetedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityEvent" ADD CONSTRAINT "DemandOpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "DemandOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandOpportunityEvent" ADD CONSTRAINT "DemandOpportunityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Database-only constraints retained from immutable migration history.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 20260913090000_phase3_commercial_core_prepare
ALTER TABLE "RatePlanCommercialVersion" ADD CONSTRAINT "RatePlanCommercialVersion_active_overlap_excl" EXCLUDE USING gist ("ratePlanId" WITH =, tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&) WHERE ("status" = 'ACTIVE');

-- 20260913090000_phase3_commercial_core_prepare
ALTER TABLE "CommercialRuleVersion" ADD CONSTRAINT "CommercialRuleVersion_active_overlap_excl" EXCLUDE USING gist ("ruleId" WITH =, tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&) WHERE ("status" = 'ACTIVE');

-- 20260913120000_phase3_1_scope_integrity
ALTER TABLE "CommercialRule" ADD CONSTRAINT "CommercialRule_exact_scope_shape" CHECK (
  ("scopeType" = 'GLOBAL' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'VENDOR' AND "vendorTenantId" IS NOT NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'PRODUCT' AND "vendorTenantId" IS NULL AND "productId" IS NOT NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'VARIANT' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NOT NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'RATE_PLAN' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NOT NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'AGENT_GROUP' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NOT NULL AND "agentTenantId" IS NULL)
  OR ("scopeType" = 'AGENT' AND "vendorTenantId" IS NULL AND "productId" IS NULL AND "variantId" IS NULL AND "ratePlanId" IS NULL AND "agentGroupId" IS NULL AND "agentTenantId" IS NOT NULL)
);

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "InventoryState" ADD CONSTRAINT "InventoryState_nonnegative_check"
  CHECK ("totalCapacity" >= 0 AND "blockedCapacity" >= 0 AND "heldCapacity" >= 0 AND "confirmedCapacity" >= 0);

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "InventoryState" ADD CONSTRAINT "InventoryState_capacity_balance_check"
  CHECK ("totalCapacity" >= "blockedCapacity" + "heldCapacity" + "confirmedCapacity");

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_quantity_positive_check" CHECK ("quantity" > 0);

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "InventoryAllocation_quantity_positive_check" CHECK ("quantity" > 0);

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_capacity_positive_when_bounded_check"
  CHECK ("allocationMode" NOT IN ('SHARED', 'CAPACITY') OR ("capacity" IS NOT NULL AND "capacity" > 0));

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "ScheduleResourceRequirement" ADD CONSTRAINT "ScheduleResourceRequirement_quantity_positive_check" CHECK ("quantity" > 0);

-- 20260914090000_phase4_inventory_core_prepare
ALTER TABLE "SessionResourceAllocation" ADD CONSTRAINT "SessionResourceAllocation_quantity_positive_check" CHECK ("quantity" > 0);

-- 20260916110000_phase6_booking_core_finalize
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canonical_integrity_check" CHECK (
  "recordType" = 'LEGACY' OR (
    "agentTenantId" IS NOT NULL AND "agentUserId" IS NOT NULL AND
    "productRevisionId" IS NOT NULL AND "variantId" IS NOT NULL AND
    "ratePlanId" IS NOT NULL AND "sessionId" IS NOT NULL AND
    "bookingMode" IS NOT NULL AND "idempotencyKey" IS NOT NULL AND
    "requestFingerprint" IS NOT NULL AND "serviceTimezone" IS NOT NULL AND
    "capacityConsumption" IS NOT NULL
  )
);

-- 20260916120000_phase6_allow_transient_new_status
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canonical_status_context_check" CHECK (
  "recordType" = 'LEGACY' OR "status" IN ('NEW', 'CONFIRMED', 'PENDING_VENDOR_CONFIRMATION', 'PENDING_MANUAL_REVIEW', 'VENDOR_REJECTED', 'MANUAL_REJECTED', 'CONFIRMATION_EXPIRED', 'FULFILLED', 'REDEEMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'CUSTOMER_CHANGE_REQUESTED')
);

-- 20260917100000_phase7_1_financial_integrity
ALTER TABLE "BookingCancellation" ADD CONSTRAINT "BookingCancellation_bookingAmount_nonnegative" CHECK ("bookingAmount" >= 0);

-- 20260917100000_phase7_1_financial_integrity
ALTER TABLE "BookingCancellation" ADD CONSTRAINT "BookingCancellation_cancellationCharge_nonnegative" CHECK ("cancellationCharge" >= 0);

-- 20260917100000_phase7_1_financial_integrity
ALTER TABLE "BookingCancellation" ADD CONSTRAINT "BookingCancellation_refundEntitlement_nonnegative" CHECK ("refundEntitlement" >= 0);

-- 20260917100000_phase7_1_financial_integrity
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);

-- 20260920110000_phase9_settlement_ledger_finalize
ALTER TABLE "FinanceConfiguration" ADD CONSTRAINT "FinanceConfiguration_singleton_check" CHECK ("id" = 'default');

-- 20260920110000_phase9_settlement_ledger_finalize
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_scope_shape_check" CHECK (("scope" = 'VENDOR' AND "bookingId" IS NULL AND "financialEventId" IS NULL) OR ("scope" = 'BOOKING' AND "bookingId" IS NOT NULL AND "financialEventId" IS NULL) OR ("scope" = 'FINANCIAL_EVENT' AND "bookingId" IS NULL AND "financialEventId" IS NOT NULL));

-- 20260920110000_phase9_settlement_ledger_finalize
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_money_nonnegative_check" CHECK ("grossBookingValue" >= 0 AND "vendorBasePayable" >= 0 AND "adjustmentTotal" >= -"vendorBasePayable" AND "netPayable" >= 0);

-- 20260920110000_phase9_settlement_ledger_finalize
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_canonical_amount_positive_check" CHECK ("recordType" = 'LEGACY' OR "amount" > 0);

-- 20260920110000_phase9_settlement_ledger_finalize
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_amount_positive_check" CHECK ("amount" > 0);

-- 20260921100000_phase9_1_settlement_financial_integrity
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_gross_base_nonnegative_check" CHECK ("grossBookingValue" >= 0 AND "vendorPayableBase" >= 0);

-- 20260921100000_phase9_1_settlement_financial_integrity
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_net_nonnegative_check" CHECK ("netPayable" >= 0);

-- 20260926110000_phase12_distribution_core_finalize
ALTER TABLE "RatePlanChannelMapping" ADD CONSTRAINT "RatePlanChannelMapping_status_enabled_consistency_check"
  CHECK (("status" IN ('DRAFT'::"ChannelMappingStatus", 'ACTIVE'::"ChannelMappingStatus") AND "enabled" = true)
      OR ("status" IN ('DISABLED'::"ChannelMappingStatus", 'RETIRED'::"ChannelMappingStatus") AND "enabled" = false));

-- 20260926110000_phase12_distribution_core_finalize
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_effective_window_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- 20260926110000_phase12_distribution_core_finalize
ALTER TABLE "ChannelInventoryRule" ADD CONSTRAINT "ChannelInventoryRule_limits_check"
  CHECK ("capacityBuffer" >= 0 AND ("maxPublishedCapacity" IS NULL OR "maxPublishedCapacity" > 0) AND ("maxUnitsPerQuote" IS NULL OR "maxUnitsPerQuote" > 0));

-- 20260926110000_phase12_distribution_core_finalize
ALTER TABLE "ChannelContract" ADD CONSTRAINT "ChannelContract_availability_horizon_check"
  CHECK ("availabilityHorizonDays" > 0);

-- 20260912120000_phase2_1_catalogue_integrity
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevision_one_working_per_product_idx"
  ON "ProductRevision" ("productId")
  WHERE "status" IN ('DRAFT'::"ProductRevisionStatus", 'UNDER_REVIEW'::"ProductRevisionStatus");

-- 20260912120000_phase2_1_catalogue_integrity
CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevision_one_published_per_product_idx"
  ON "ProductRevision" ("productId")
  WHERE "status" = 'PUBLISHED'::"ProductRevisionStatus";

-- 20260915100000_phase4_1_inventory_integrity
CREATE UNIQUE INDEX "InventoryHold_state_reference_nonnull_key"
  ON "InventoryHold"("inventoryStateId", "referenceKey")
  WHERE "referenceKey" IS NOT NULL;

-- 20260915100000_phase4_1_inventory_integrity
CREATE UNIQUE INDEX "InventoryAllocation_state_reference_nonnull_key"
  ON "InventoryAllocation"("inventoryStateId", "referenceKey")
  WHERE "referenceKey" IS NOT NULL;

-- 20260918100000_phase8_fulfilment_core_prepare
CREATE UNIQUE INDEX "VoucherVersion_one_current_per_booking" ON "VoucherVersion"("bookingId") WHERE "status" = 'CURRENT';

-- 20260918100000_phase8_fulfilment_core_prepare
CREATE UNIQUE INDEX "FulfilmentEvidence_one_current_per_kind" ON "FulfilmentEvidence"("fulfilmentId", "kind") WHERE "status" = 'CURRENT';

-- 20260920110000_phase9_settlement_ledger_finalize
CREATE UNIQUE INDEX "SettlementEventAllocation_active_financialEvent_key" ON "SettlementEventAllocation"("financialEventId") WHERE "status" IN ('ALLOCATED', 'SETTLED');

-- 20260922110000_phase10_supplier_quality_finalize
CREATE UNIQUE INDEX "SupplierTierAssignment_current_vendor_key" ON "SupplierTierAssignment"("vendorTenantId") WHERE "effectiveTo" IS NULL;

-- 20260922110000_phase10_supplier_quality_finalize
CREATE UNIQUE INDEX "SupplierQualityIssue_open_vendor_metric_key" ON "SupplierQualityIssue"("vendorTenantId", "metricCode") WHERE "status" IN ('OPEN','ACKNOWLEDGED');

-- 20260923100000_phase10_1_quality_integrity
CREATE UNIQUE INDEX "SupplierQualityPolicy_one_active_key" ON "SupplierQualityPolicy" ((1)) WHERE "status" = 'ACTIVE';

-- 20260924100000_phase11_demand_intelligence_core
CREATE UNIQUE INDEX "DemandIntelligencePolicy_one_active_key" ON "DemandIntelligencePolicy"("status") WHERE "status" = 'ACTIVE';

-- 20260924100000_phase11_demand_intelligence_core
CREATE UNIQUE INDEX "DemandOpportunity_one_active_key" ON "DemandOpportunity"("opportunityKey") WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS');

-- 20260926120000_phase12_distribution_contract_guard
CREATE UNIQUE INDEX "ChannelContract_one_active_per_channel_key"
  ON "ChannelContract"("channelId")
  WHERE "status" = 'ACTIVE'::"ChannelContractStatus";

-- 20261117100000_multi_outlet_core
CREATE UNIQUE INDEX "Payout_tenantId_outletId_week_canonical_key"
ON "Payout" ("tenantId", "outletId", date_trunc('week', "createdAt"))
WHERE "outletId" IS NOT NULL AND "recordType" = 'CANONICAL';

-- 20261117100000_multi_outlet_core
CREATE UNIQUE INDEX "VendorOutlet_one_default_per_tenant" ON "VendorOutlet"("tenantId") WHERE "isDefault" = true;
