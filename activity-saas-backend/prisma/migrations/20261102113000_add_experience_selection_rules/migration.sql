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
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceSelectionRuleSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExperienceSelectionRuleSet_scope_key" ON "ExperienceSelectionRuleSet"("scope");
CREATE INDEX "ExperienceSelectionRuleSet_status_idx" ON "ExperienceSelectionRuleSet"("status");
