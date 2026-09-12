import { BookingStatus, FulfilmentMode } from '@prisma/client';
import { FulfilmentReadinessService } from './fulfilment-readiness.service';

describe('FulfilmentReadinessService', () => {
  const service = new FulfilmentReadinessService();
  const booking = (mode: FulfilmentMode, requiredEvidenceKinds: string[] = [], evidenceMatchMode = 'ALL', reviewRequired = false) => ({ status: BookingStatus.CONFIRMED, operationalSnapshot: { fulfilmentPolicySnapshot: { mode, requiredEvidenceKinds, evidenceMatchMode, reviewRequired } } });
  it('supports AUTO without evidence', () => expect(service.evaluate({ booking: booking(FulfilmentMode.AUTO), fulfilment: {}, evidence: [] }).ready).toBe(true));
  it('requires PNR for PNR_ONLY', () => expect(service.evaluate({ booking: booking(FulfilmentMode.PNR_ONLY), fulfilment: {}, evidence: [] }).reasonCodes).toContain('PNR_REQUIRED'));
  it('supports ticket or QR for TICKET_QR', () => expect(service.evaluate({ booking: booking(FulfilmentMode.TICKET_QR), fulfilment: {}, evidence: [{ kind: 'QR_TOKEN', status: 'CURRENT', versionNumber: 1 }] }).ready).toBe(true));
  it('supports AFTER_FULFILMENT ALL and ANY', () => { expect(service.evaluate({ booking: booking(FulfilmentMode.AFTER_FULFILMENT, ['PNR_REFERENCE', 'TICKET_FILE']), fulfilment: {}, evidence: [{ kind: 'PNR_REFERENCE', status: 'CURRENT', versionNumber: 1 }] }).ready).toBe(false); expect(service.evaluate({ booking: booking(FulfilmentMode.AFTER_FULFILMENT, ['PNR_REFERENCE', 'TICKET_FILE'], 'ANY'), fulfilment: {}, evidence: [{ kind: 'PNR_REFERENCE', status: 'CURRENT', versionNumber: 1 }] }).ready).toBe(true); });
  it('blocks policies requiring review', () => expect(service.evaluate({ booking: booking(FulfilmentMode.AUTO, [], 'ALL', true), fulfilment: {}, evidence: [] }).reasonCodes).toContain('FULFILMENT_POLICY_REVIEW_REQUIRED'));
});
