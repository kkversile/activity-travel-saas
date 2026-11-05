-- Stable public identifiers are separate from internal UUIDs and legacy codes.
CREATE TABLE "PublicIdentifier" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicIdentifier_publicCode_key" ON "PublicIdentifier"("publicCode");
CREATE UNIQUE INDEX "PublicIdentifier_entityType_entityId_key" ON "PublicIdentifier"("entityType", "entityId");
CREATE INDEX "PublicIdentifier_entityType_publicCode_idx" ON "PublicIdentifier"("entityType", "publicCode");
