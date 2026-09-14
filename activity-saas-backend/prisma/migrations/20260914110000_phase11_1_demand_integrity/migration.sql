-- AlterEnum
ALTER TYPE "DemandTargetStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "DemandOpportunityVendorTarget" ADD COLUMN     "removalReason" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "DemandOpportunityVendorTarget" ADD CONSTRAINT "DemandOpportunityVendorTarget_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
