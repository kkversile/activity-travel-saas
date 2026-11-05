CREATE TYPE "CommissionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

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

CREATE UNIQUE INDEX "CommissionInvoice_invoiceNumber_key" ON "CommissionInvoice"("invoiceNumber");
CREATE UNIQUE INDEX "CommissionInvoice_settlementBatchId_key" ON "CommissionInvoice"("settlementBatchId");
CREATE INDEX "CommissionInvoice_financialYear_status_createdAt_idx" ON "CommissionInvoice"("financialYear", "status", "createdAt");
CREATE INDEX "CommissionInvoice_vendorTenantId_createdAt_idx" ON "CommissionInvoice"("vendorTenantId", "createdAt");

ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_settlementBatchId_fkey"
FOREIGN KEY ("settlementBatchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_vendorTenantId_fkey"
FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
