ALTER TABLE "VendorTeamInvitation"
ADD COLUMN "tokenHash" TEXT;

CREATE UNIQUE INDEX "VendorTeamInvitation_tokenHash_key"
ON "VendorTeamInvitation"("tokenHash");
