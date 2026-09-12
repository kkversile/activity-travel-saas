import { FulfilmentEvidenceKind } from '@prisma/client';
import { validateEvidenceShape, evidenceFingerprint } from './fulfilment.types';

describe('Fulfilment evidence contract', () => {
  it.each([[FulfilmentEvidenceKind.PNR_REFERENCE, '', 'PNR_REFERENCE_REQUIRED'], [FulfilmentEvidenceKind.QR_TOKEN, '  ', 'QR_TOKEN_REQUIRED'], [FulfilmentEvidenceKind.TICKET_FILE, null, 'EVIDENCE_FILE_REQUIRED'], [FulfilmentEvidenceKind.SUPPLIER_ATTACHMENT, null, 'EVIDENCE_FILE_REQUIRED']] as const)('rejects invalid %s shape', (kind, reference, reason) => expect(validateEvidenceShape(kind, reference, null)).toEqual({ valid: false, reason }));
  it('does not allow JSON reference replacement to impersonate a file', () => expect(validateEvidenceShape(FulfilmentEvidenceKind.TICKET_FILE, 'anything', null)).toEqual({ valid: false, reason: 'EVIDENCE_FILE_REQUIRED' }));
  it('fingerprints only ordered current evidence identity', () => expect(evidenceFingerprint([{ kind: 'QR_TOKEN', versionNumber: 1, status: 'CURRENT', referenceValue: 'x' }, { kind: 'PNR_REFERENCE', versionNumber: 1, status: 'SUPERSEDED', referenceValue: 'old' }])).toBe(evidenceFingerprint([{ kind: 'QR_TOKEN', versionNumber: 1, status: 'CURRENT', referenceValue: 'x' }])));
});
