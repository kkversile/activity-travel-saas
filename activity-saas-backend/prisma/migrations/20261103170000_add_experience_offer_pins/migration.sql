ALTER TABLE "ExperienceOfferPlacement"
  ADD COLUMN "pinnedUntil" TIMESTAMP(3),
  ADD COLUMN "pinnedById" TEXT,
  ADD COLUMN "pinReason" TEXT;

CREATE INDEX "ExperienceOfferPlacement_experienceMasterId_pinnedUntil_idx"
  ON "ExperienceOfferPlacement"("experienceMasterId", "pinnedUntil");
