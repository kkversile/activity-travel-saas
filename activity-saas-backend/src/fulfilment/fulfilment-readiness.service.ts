import { Injectable } from '@nestjs/common';
import { BookingStatus, FulfilmentEvidenceKind, FulfilmentMode } from '@prisma/client';
import { FULFILMENT_REASON } from './fulfilment.types';

@Injectable()
export class FulfilmentReadinessService {
  evaluate(input: { booking: any; fulfilment: any; policy?: any; evidence?: any[] }) {
    const booking = input.booking;
    const policy = input.policy ?? booking?.operationalSnapshot?.fulfilmentPolicySnapshot;
    const evidence = input.evidence ?? input.fulfilment?.evidence ?? [];
    if (booking?.status === BookingStatus.CANCELLED) return this.result(false, [FULFILMENT_REASON.BOOKING_CANCELLED], evidence);
    if (![BookingStatus.CONFIRMED, BookingStatus.REDEEMED, BookingStatus.COMPLETED].includes(booking?.status)) return this.result(false, [FULFILMENT_REASON.BOOKING_NOT_CONFIRMED], evidence);
    if (!policy?.mode) return this.result(false, [FULFILMENT_REASON.SNAPSHOT_MISSING], evidence);
    if (policy.reviewRequired) return this.result(false, [FULFILMENT_REASON.POLICY_REVIEW], evidence);
    const current = new Set(evidence.filter((item: any) => item.status === 'CURRENT').map((item: any) => item.kind));
    if (policy.mode === FulfilmentMode.AUTO) return this.result(true, [], evidence);
    if (policy.mode === FulfilmentMode.PNR_ONLY && !current.has(FulfilmentEvidenceKind.PNR_REFERENCE)) return this.result(false, [FULFILMENT_REASON.PNR_REQUIRED], evidence);
    if (policy.mode === FulfilmentMode.TICKET_QR && !current.has(FulfilmentEvidenceKind.TICKET_FILE) && !current.has(FulfilmentEvidenceKind.QR_TOKEN)) return this.result(false, [FULFILMENT_REASON.TICKET_OR_QR_REQUIRED], evidence);
    if (policy.mode === FulfilmentMode.AFTER_FULFILMENT) {
      const required = policy.requiredEvidenceKinds ?? [];
      if (!required.length) return this.result(false, [FULFILMENT_REASON.EVIDENCE_REQUIRED], evidence);
      const satisfied = required.filter((kind: FulfilmentEvidenceKind) => current.has(kind)).length;
      const ready = policy.evidenceMatchMode === 'ANY' ? satisfied > 0 : satisfied === required.length;
      if (!ready) return this.result(false, [FULFILMENT_REASON.EVIDENCE_INCOMPLETE], evidence);
    }
    return this.result(true, [], evidence);
  }

  private result(ready: boolean, reasonCodes: string[], evidence: any[]) { return { ready, reasonCodes, evidenceTrace: evidence.map((item) => ({ kind: item.kind, versionNumber: item.versionNumber, status: item.status, travellerVisible: item.travellerVisible })) }; }
}
