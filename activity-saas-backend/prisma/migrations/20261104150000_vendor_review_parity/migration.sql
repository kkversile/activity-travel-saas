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
    "reviewedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendorReply" TEXT,
    "repliedAt" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "VendorReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorReview_source_sourceReviewId_key" ON "VendorReview"("source", "sourceReviewId");
CREATE INDEX "VendorReview_tenantId_reviewedAt_idx" ON "VendorReview"("tenantId", "reviewedAt");
CREATE INDEX "VendorReview_tenantId_status_vendorReply_idx" ON "VendorReview"("tenantId", "status", "vendorReply");
CREATE INDEX "VendorReview_productId_reviewedAt_idx" ON "VendorReview"("productId", "reviewedAt");

ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
