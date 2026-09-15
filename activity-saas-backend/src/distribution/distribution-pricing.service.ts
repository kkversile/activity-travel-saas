import { BadRequestException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { ChannelMappingStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { EligibilityService } from '../eligibility/eligibility.service';
import { CommercialService } from '../commercial/commercial.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteDto } from './distribution.dto';
import { ChannelEligibilityService } from './channel-eligibility.service';
import { DistributionAuthContext } from './distribution.types';
import { channelPublishedCapacity } from './distribution-math';

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeFailure = (gates: any[], reasonCodes: string[]) => new UnprocessableEntityException({ eligible: false, reasonCodes: [...new Set(reasonCodes)], gates: gates.map((gate) => ({ gate: gate.gate, status: gate.status, code: gate.code, message: gate.message })) });

@Injectable()
export class DistributionPricingService {
  constructor(private readonly prisma: PrismaService, private readonly commercial: CommercialService, private readonly eligibility: ChannelEligibilityService, @Optional() private readonly core?: EligibilityService) {}
  async quote(auth: DistributionAuthContext, dto: QuoteDto) {
    const mapping = await this.prisma.ratePlanChannelMapping.findFirst({ where: { channelId: auth.channelId, externalRatePlanCode: dto.externalRatePlanCode.trim(), status: ChannelMappingStatus.ACTIVE }, include: { ratePlan: { include: { variant: { include: { product: true } } } }, inventoryRule: true } }); if (!mapping?.externalRatePlanCode) throw new NotFoundException('Mapped rate plan not found');
    if (!mapping.inventoryRule) throw safeFailure([{ gate: 'INVENTORY_RULE', status: 'FAIL', code: 'CHANNEL_INVENTORY_NOT_EXPOSED' }], ['CHANNEL_INVENTORY_NOT_EXPOSED']);
    const channelGate = await this.eligibility.evaluate({ channelId: auth.channelId, productId: mapping.ratePlan.variant.productId, variantId: mapping.ratePlan.variantId, ratePlanId: mapping.ratePlanId, currency: dto.currency, units: dto.units }); if (!channelGate.eligible) throw safeFailure(channelGate.gates, channelGate.reasonCodes);
    const session = await this.prisma.serviceSession.findUnique({ where: { id: dto.sessionId }, include: { inventoryState: true, scheduleTemplate: true } }); if (!session || session.scheduleTemplate.variantId !== mapping.ratePlan.variantId) throw safeFailure([{ gate: 'SESSION', status: 'FAIL', code: 'SESSION_NOT_FOUND' }], ['SESSION_NOT_FOUND']);
    const travellers = dto.travellers.map((item) => ({ travellerType: item.type, quantity: item.quantity }));
    const coreResult: any = this.core ? await this.core.evaluate({ ratePlanId: mapping.ratePlanId, sessionId: dto.sessionId, travellers, units: dto.units, now: new Date(), skipAgentGovernance: true, skipChannelGovernance: true, channelCode: auth.channelCode }) : null;
    if (coreResult && !coreResult.eligible) throw safeFailure(coreResult.gates, coreResult.gates.filter((gate: any) => gate.status === 'FAIL').map((gate: any) => gate.code).filter(Boolean));
    const commercial: any = coreResult?.commercial ?? await this.commercial.evaluateInternal({ ratePlanId: mapping.ratePlanId, serviceDate: session.serviceDate, units: dto.units, travellers, channel: auth.channelCode });
    const effectiveCurrency = String(commercial.currency || '').toUpperCase(); if (!effectiveCurrency || !auth.allowedCurrencies.includes(effectiveCurrency) || (dto.currency && dto.currency.trim().toUpperCase() !== effectiveCurrency)) throw safeFailure([{ gate: 'CURRENCY', status: 'FAIL', code: 'CHANNEL_CURRENCY_NOT_ALLOWED' }], ['CHANNEL_CURRENCY_NOT_ALLOWED']);
    if (!commercial.ready || !['ALLOWED', 'NOT_APPLICABLE'].includes(commercial.commercialEligibility) || !commercial.bookingMode || !Number.isFinite(Number(commercial.finalAmount))) throw safeFailure([{ gate: 'COMMERCIAL', status: 'FAIL', code: 'COMMERCIAL_NOT_READY' }], commercial.reasonCodes || ['COMMERCIAL_NOT_READY']);
    const remaining = Math.max(0, (session.inventoryState?.totalCapacity ?? 0) - (session.inventoryState?.blockedCapacity ?? 0) - (session.inventoryState?.heldCapacity ?? 0) - (session.inventoryState?.confirmedCapacity ?? 0)); const published = Math.min(mapping.inventoryRule.maxPublishedCapacity ?? Number.MAX_SAFE_INTEGER, Math.max(0, remaining - mapping.inventoryRule.capacityBuffer)); if (published <= 0) throw safeFailure([{ gate: 'INVENTORY', status: 'FAIL', code: 'INSUFFICIENT_INVENTORY' }], ['INSUFFICIENT_INVENTORY']);
    const safe: any = { externalRatePlanCode: mapping.externalRatePlanCode, session: { id: session.id, key: session.sessionKey, serviceDate: session.serviceDate, localStartTime: session.localStartTime, localEndTime: session.localEndTime, timezone: session.scheduleTemplate.timezone }, currency: effectiveCurrency, bookingMode: commercial.bookingMode, amount: commercial.finalAmount, tax: commercial.tax ? { mode: commercial.tax.mode, amount: commercial.tax.amount } : null, promotion: { amount: commercial.promotionAmount, funder: commercial.promotionFunder }, availability: { available: session.status === 'OPEN' && published > 0, ...(mapping.inventoryRule.exposureMode === 'EXACT_REMAINING' ? { remainingCapacity: published } : {}) }, provisional: true, confirmationSlaMinutes: commercial.confirmationSlaMinutes ?? null, reasonCodes: [], quoteFingerprint: '' };
    safe.quoteFingerprint = fingerprint({ channelId: auth.channelId, contractVersion: auth.contractVersion, mappingId: mapping.id, sessionId: session.id, travellers, units: dto.units, currency: safe.currency, amount: safe.amount, tax: safe.tax, promotion: safe.promotion, availability: safe.availability, commercialVersion: commercial.ratePlanCommercialVersionId }); return safe;
  }
}
