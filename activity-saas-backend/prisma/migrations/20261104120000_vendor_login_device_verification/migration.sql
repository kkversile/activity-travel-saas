ALTER TYPE "EmailAuthChallengePurpose" ADD VALUE 'LOGIN_VENDOR';

CREATE TABLE "VendorTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorTrustedDevice_tokenHash_key" ON "VendorTrustedDevice"("tokenHash");
CREATE INDEX "VendorTrustedDevice_userId_expiresAt_idx" ON "VendorTrustedDevice"("userId", "expiresAt");
ALTER TABLE "VendorTrustedDevice" ADD CONSTRAINT "VendorTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
