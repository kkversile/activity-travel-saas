-- Email-first vendor activation and password-reset challenges.
CREATE TYPE "EmailAuthChallengePurpose" AS ENUM ('ACTIVATE_VENDOR', 'RESET_VENDOR_PASSWORD');

CREATE TABLE "EmailAuthChallenge" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "purpose" "EmailAuthChallengePurpose" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "verificationTokenHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailAuthChallenge_email_purpose_createdAt_idx" ON "EmailAuthChallenge"("email", "purpose", "createdAt");
CREATE INDEX "EmailAuthChallenge_verificationTokenHash_consumedAt_idx" ON "EmailAuthChallenge"("verificationTokenHash", "consumedAt");
