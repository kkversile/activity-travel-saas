import { ConflictException } from '@nestjs/common';
import { DocumentReviewStatus, Prisma, VendorGstStatus, VendorOnboardingStatus } from '@prisma/client';

type DocumentState = {
  type: string;
  currentStatus: DocumentReviewStatus;
  versions: Array<{ status: DocumentReviewStatus; versionNumber: number }>;
};

const LABELS: Record<string, string> = {
  PAN: 'PAN document',
  GSTIN: 'GST certificate',
  BANK_PROOF: 'bank proof',
  LLP_AGREEMENT: 'LLP agreement',
  LLPIN_CERTIFICATE: 'LLPIN certificate',
  AUTHORIZATION_LETTER: 'authorisation letter',
};

/** The approval gate mirrors the documents required to submit onboarding. */
export async function vendorOnboardingApprovalBlockers(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string[]> {
  const application = await tx.vendorOnboardingApplication.findUnique({
    where: { tenantId },
    select: {
      status: true,
      gstStatus: true,
      supplementalData: true,
      tenant: {
        select: {
          vendorDocuments: {
            select: {
              type: true,
              currentStatus: true,
              versions: { orderBy: { versionNumber: 'desc' }, select: { status: true, versionNumber: true } },
            },
          },
        },
      },
    },
  });
  // Legacy vendors without an onboarding application keep their existing
  // verification path; every application-based approval is guarded below.
  if (!application) return [];

  const documents = application.tenant.vendorDocuments as DocumentState[];
  const latestByType = new Map(documents.map((document) => [document.type, document.versions[0] ?? null]));
  const supplemental = application.supplementalData && typeof application.supplementalData === 'object' && !Array.isArray(application.supplementalData)
    ? application.supplementalData as Record<string, unknown>
    : {};
  const required = ['PAN', 'BANK_PROOF'];
  if (application.gstStatus === VendorGstStatus.REGISTERED) required.push('GSTIN');
  if (supplemental.entityType === 'LLP') required.push('LLP_AGREEMENT', 'LLPIN_CERTIFICATE', 'AUTHORIZATION_LETTER');

  const blockers: string[] = [];
  if (application.status !== VendorOnboardingStatus.SUBMITTED && application.status !== VendorOnboardingStatus.UNDER_REVIEW) {
    blockers.push('Vendor must resubmit the corrected onboarding before approval');
  }
  for (const type of required) {
    const latest = latestByType.get(type);
    const label = LABELS[type] ?? type;
    if (!latest) blockers.push(`${label} has not been uploaded`);
    else if (latest.status !== DocumentReviewStatus.VERIFIED) blockers.push(`${label} is ${latest.status.toLowerCase().replaceAll('_', ' ')}`);
  }

  // A reviewer rejection always requires a corrected replacement, even for a
  // supporting document that was optional at initial submission.
  for (const document of documents) {
    const latest = latestByType.get(document.type);
    const hasRejectedHistory = document.versions.some((version) => version.status === DocumentReviewStatus.REJECTED);
    if ((latest?.status === DocumentReviewStatus.REJECTED || hasRejectedHistory) && !required.includes(document.type) && latest?.status !== DocumentReviewStatus.VERIFIED) {
      blockers.push(`${LABELS[document.type] ?? document.type.replaceAll('_', ' ').toLowerCase()} needs a verified replacement`);
    }
    if (latest?.status === DocumentReviewStatus.EXPIRED && required.includes(document.type)) {
      const item = `${LABELS[document.type] ?? document.type} is expired`;
      if (!blockers.includes(item)) blockers.push(item);
    }
  }
  return blockers;
}

export async function assertVendorOnboardingDocumentsApproved(tx: Prisma.TransactionClient, tenantId: string) {
  const blockers = await vendorOnboardingApprovalBlockers(tx, tenantId);
  if (blockers.length) {
    throw new ConflictException(`Vendor approval is blocked: ${blockers.join('; ')}. Ask the vendor to upload corrected documents and verify the latest versions.`);
  }
}
