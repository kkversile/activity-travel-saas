import { Injectable } from '@nestjs/common';
import { BookingMode, Prisma } from '@prisma/client';

@Injectable()
export class BookingSnapshotService {
  async create(tx: Prisma.TransactionClient, input: { booking: any; plan: any; session: any; agent: any; user: any; policy: any; policyFingerprint: string; questions: any[]; bookingAnswers: Record<string, unknown>; pickupDetails?: Record<string, unknown>; cancellationAcknowledgedAt: Date; quote: any }) {
    const { booking, plan, session, agent, user, policy, policyFingerprint, questions, bookingAnswers, pickupDetails, cancellationAcknowledgedAt, quote } = input;
    const revision = plan.variant.product.currentRevision; const variant = plan.variant; const schedule = session.scheduleTemplate; const channel = plan.channelMappings.find((mapping: any) => mapping.channel.code === 'VOYA_AGENT')?.channel;
    const questionSnapshot = (questions ?? []).map((question: any) => ({ id: question.id, code: question.code, label: question.label, helpText: question.helpText ?? null, type: question.type, required: question.required, options: question.options ?? null, appliesPerTraveller: question.appliesPerTraveller, rank: question.rank }));
    const pickupSnapshot = { configured: { pickupIncluded: variant.pickupIncluded, pickupType: variant.pickupType, pickupInput: variant.pickupInput, pickupTimings: variant.pickupTimings, dropoffIncluded: variant.dropoffIncluded, dropoffTimings: variant.dropoffTimings }, supplied: pickupDetails ?? null } as Prisma.InputJsonValue;
    const bookingAnswersSnapshot = (bookingAnswers ?? {}) as Prisma.InputJsonValue;
    return tx.bookingSnapshot.create({ data: {
      bookingId: booking.id,
      productRevisionId: revision.id,
      scheduleTemplateId: schedule.id,
      sessionId: session.id,
      productSnapshot: { productId: plan.variant.product.id, productCode: plan.variant.product.productCode, productRevisionId: revision.id, versionNumber: revision.versionNumber, productName: revision.productName, type: revision.type, subType: revision.subType, subCategory: revision.subCategory, destination: { city: revision.cityName, state: revision.stateName, country: revision.countryName }, address: revision.address },
      variantSnapshot: { variantId: variant.id, variantCode: variant.variantCode, version: variant.version, name: variant.name, description: variant.description, durationMinutes: variant.durationMinutes, privateShared: variant.privateShared, vehicleType: variant.vehicleType, pickupIncluded: variant.pickupIncluded, pickupType: variant.pickupType, pickupInput: variant.pickupInput, pickupTimings: variant.pickupTimings, dropoffIncluded: variant.dropoffIncluded, dropoffTimings: variant.dropoffTimings, mealIncluded: variant.mealIncluded, mealType: variant.mealType, inclusions: variant.inclusions, exclusions: variant.exclusions },
      ratePlanSnapshot: { ratePlanId: plan.id, ratePlanCode: plan.ratePlanCode, name: plan.name, validFrom: plan.validFrom, validTo: plan.validTo, cutOffMinutes: plan.cutOffMinutes, dateLevelCutoffTime: plan.dateLevelCutoffTime, bookingMode: booking.bookingMode },
      sessionSnapshot: { sessionId: session.id, scheduleTemplateId: schedule.id, scheduleCode: schedule.scheduleCode, scheduleName: schedule.name, operatingModel: schedule.operatingModel, serviceDate: session.serviceDate, timezone: schedule.timezone, localStartTime: session.localStartTime, localEndTime: session.localEndTime, startsAt: session.startsAt, endsAt: session.endsAt, sessionKey: session.sessionKey, capacityUnit: schedule.capacityUnit },
      travellerSummary: booking.paxBreakdown,
      capacityUnit: schedule.capacityUnit,
      capacityConsumption: booking.capacityConsumption,
      bookingMode: booking.bookingMode as BookingMode,
      cancellationPolicySnapshot: policy,
      cancellationPolicyFingerprint: policyFingerprint,
      cancellationAcknowledgedAt,
      pickupSnapshot,
      questionsSnapshot: questionSnapshot,
      bookingAnswers: bookingAnswersSnapshot,
      agentSnapshot: { tenantId: agent.id, tenantName: agent.name, userId: user.sub, userName: user.fullName, email: user.email },
      channelSnapshot: channel ? { id: channel.id, code: channel.code, name: channel.name } : { code: 'VOYA_AGENT' },
      confirmationPolicySnapshot: { bookingMode: booking.bookingMode, confirmationSlaMinutes: quote.confirmationSlaMinutes ?? null, confirmationDueAt: booking.confirmationDueAt ?? null },
    } });
  }
}
