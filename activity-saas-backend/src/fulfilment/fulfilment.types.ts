import { EvidenceMatchMode, FulfilmentEvidenceKind, FulfilmentMode } from '@prisma/client';
import { createHash } from 'crypto';

export const FULFILMENT_REASON = {
  POLICY_MISSING: 'FULFILMENT_POLICY_MISSING',
  POLICY_REVIEW: 'FULFILMENT_POLICY_REVIEW_REQUIRED',
  POLICY_INVALID: 'FULFILMENT_POLICY_INVALID',
  SNAPSHOT_MISSING: 'FULFILMENT_POLICY_SNAPSHOT_MISSING',
  BOOKING_NOT_CONFIRMED: 'BOOKING_NOT_CONFIRMED',
  PNR_REQUIRED: 'PNR_REQUIRED',
  TICKET_OR_QR_REQUIRED: 'TICKET_OR_QR_REQUIRED',
  EVIDENCE_REQUIRED: 'FULFILMENT_EVIDENCE_REQUIRED',
  EVIDENCE_INCOMPLETE: 'FULFILMENT_EVIDENCE_INCOMPLETE',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
} as const;

export type PolicyInput = {
  mode?: FulfilmentMode | null;
  requiredEvidenceKinds?: FulfilmentEvidenceKind[] | null;
  evidenceMatchMode?: EvidenceMatchMode | null;
  reviewRequired?: boolean;
};

export function validateFulfilmentPolicy(policy: PolicyInput | null | undefined) {
  if (!policy || !policy.mode) return { valid: false, reason: FULFILMENT_REASON.POLICY_MISSING };
  if (policy.reviewRequired) return { valid: false, reason: FULFILMENT_REASON.POLICY_REVIEW };
  const kinds = policy.requiredEvidenceKinds ?? [];
  if (policy.mode === FulfilmentMode.AUTO && kinds.length) return { valid: false, reason: FULFILMENT_REASON.POLICY_INVALID };
  if (policy.mode === FulfilmentMode.PNR_ONLY && (kinds.length !== 1 || kinds[0] !== FulfilmentEvidenceKind.PNR_REFERENCE)) return { valid: false, reason: FULFILMENT_REASON.POLICY_INVALID };
  if (policy.mode === FulfilmentMode.TICKET_QR && (!kinds.length || kinds.some((kind) => !([FulfilmentEvidenceKind.TICKET_FILE, FulfilmentEvidenceKind.QR_TOKEN] as string[]).includes(kind)))) return { valid: false, reason: FULFILMENT_REASON.POLICY_INVALID };
  if (policy.mode === FulfilmentMode.TICKET_QR && policy.evidenceMatchMode !== EvidenceMatchMode.ANY) return { valid: false, reason: FULFILMENT_REASON.POLICY_INVALID };
  if (policy.mode === FulfilmentMode.AFTER_FULFILMENT && (!kinds.length || !policy.evidenceMatchMode)) return { valid: false, reason: FULFILMENT_REASON.POLICY_INVALID };
  return { valid: true as const, reason: undefined };
}

export function validateEvidenceShape(kind: FulfilmentEvidenceKind, referenceValue: string | null | undefined, fileAssetId: string | null | undefined) {
  const reference = referenceValue?.trim() ?? '';
  if (kind === FulfilmentEvidenceKind.PNR_REFERENCE && !reference) return { valid: false, reason: 'PNR_REFERENCE_REQUIRED' } as const;
  if (kind === FulfilmentEvidenceKind.QR_TOKEN && !reference) return { valid: false, reason: 'QR_TOKEN_REQUIRED' } as const;
  if ((kind === FulfilmentEvidenceKind.TICKET_FILE || kind === FulfilmentEvidenceKind.SUPPLIER_ATTACHMENT) && !fileAssetId) return { valid: false, reason: 'EVIDENCE_FILE_REQUIRED' } as const;
  if ((kind === FulfilmentEvidenceKind.PNR_REFERENCE || kind === FulfilmentEvidenceKind.QR_TOKEN) && fileAssetId) return { valid: false, reason: 'EVIDENCE_FILE_NOT_ALLOWED' } as const;
  return { valid: true as const, reason: undefined };
}

export function policySnapshot(policy: any, revision: any) {
  return {
    policyId: policy?.id ?? null,
    productRevisionId: revision?.id ?? null,
    productRevisionVersion: revision?.versionNumber ?? null,
    mode: policy?.mode ?? null,
    requiredEvidenceKinds: policy?.requiredEvidenceKinds ?? [],
    evidenceMatchMode: policy?.evidenceMatchMode ?? EvidenceMatchMode.ALL,
    reviewRequired: policy?.reviewRequired ?? false,
    operationsContact: { name: policy?.operationsContactName ?? null, phone: policy?.operationsContactPhone ?? null, email: policy?.operationsContactEmail ?? null },
    emergencyContact: { name: policy?.emergencyContactName ?? null, phone: policy?.emergencyContactPhone ?? null, email: policy?.emergencyContactEmail ?? null },
    voucherNotes: policy?.voucherNotes ?? [],
    howToRedeem: revision?.howToRedeem ?? [],
  };
}

export function evidenceFingerprint(evidence: Array<{ kind: string; versionNumber: number; status: string; referenceValue?: string | null; fileAssetId?: string | null }>) {
  const current = evidence.filter((item) => item.status === 'CURRENT').map((item) => ({ kind: item.kind, versionNumber: item.versionNumber, referenceValue: item.referenceValue?.trim() || null, fileAssetId: item.fileAssetId ?? null })).sort((a, b) => `${a.kind}:${a.versionNumber}:${a.referenceValue ?? ''}:${a.fileAssetId ?? ''}`.localeCompare(`${b.kind}:${b.versionNumber}:${b.referenceValue ?? ''}:${b.fileAssetId ?? ''}`));
  return createHash('sha256').update(JSON.stringify(current)).digest('hex');
}
