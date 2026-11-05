CREATE TABLE "CommercialGuardrailConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "minimumNetMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 4,
    "websiteGatewayFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 1.8,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pendingConfiguration" JSONB,
    "pendingUpdatedById" TEXT,
    "pendingUpdatedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommercialGuardrailConfiguration_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CommercialGuardrailConfiguration" ("id") VALUES ('default');
