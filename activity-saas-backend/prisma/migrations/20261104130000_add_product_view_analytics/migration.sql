CREATE TABLE "ProductViewEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorTenantId" TEXT NOT NULL,
    "viewerTenantId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductViewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductViewEvent_vendorTenantId_viewedAt_idx" ON "ProductViewEvent"("vendorTenantId", "viewedAt");
CREATE INDEX "ProductViewEvent_productId_viewedAt_idx" ON "ProductViewEvent"("productId", "viewedAt");
CREATE INDEX "ProductViewEvent_viewerTenantId_viewedAt_idx" ON "ProductViewEvent"("viewerTenantId", "viewedAt");

ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_vendorTenantId_fkey"
    FOREIGN KEY ("vendorTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductViewEvent" ADD CONSTRAINT "ProductViewEvent_viewerTenantId_fkey"
    FOREIGN KEY ("viewerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;