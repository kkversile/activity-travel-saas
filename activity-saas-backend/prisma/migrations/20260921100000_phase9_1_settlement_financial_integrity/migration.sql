-- Phase 9.1: signed adjustment lines and supporting integrity indexes.
-- Do not rewrite historical Phase 9 migrations or legacy payouts.
ALTER TABLE "SettlementLine" DROP CONSTRAINT IF EXISTS "SettlementLine_money_nonnegative_check";
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_gross_base_nonnegative_check" CHECK ("grossBookingValue" >= 0 AND "vendorPayableBase" >= 0);
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_net_nonnegative_check" CHECK ("netPayable" >= 0);
CREATE INDEX IF NOT EXISTS "SettlementBatch_vendorTenantId_currency_status_idx" ON "SettlementBatch"("vendorTenantId", "currency", "status");
CREATE INDEX IF NOT EXISTS "FinancialEvent_vendorTenantId_currency_status_idx" ON "FinancialEvent"("vendorTenantId", "currency", "status");
