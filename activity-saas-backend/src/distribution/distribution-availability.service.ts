import { BadRequestException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { ChannelMappingStatus, SessionStatus } from '@prisma/client';
import { calculatedAvailable } from '../inventory/inventory.types';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityQueryDto } from './distribution.dto';
import { DistributionAuthContext } from './distribution.types';
import { channelPublishedCapacity } from './distribution-math';
import { ChannelEligibilityService } from './channel-eligibility.service';

const dateOnly = (value: string, field: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) throw new BadRequestException({ code: 'CHANNEL_DATE_ONLY_REQUIRED', message: `${field} must use YYYY-MM-DD` }); return new Date(`${value}T00:00:00.000Z`); };
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class DistributionAvailabilityService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly eligibility?: ChannelEligibilityService) {}
  async availability(auth: DistributionAuthContext, dto: AvailabilityQueryDto) {
    const from = dateOnly(dto.dateFrom, 'dateFrom'); const to = dateOnly(dto.dateTo, 'dateTo'); if (to < from) throw new BadRequestException('dateTo must be on or after dateFrom');
    const today = new Date(); const todayKey = dateKey(today); const horizon = new Date(`${todayKey}T00:00:00.000Z`); horizon.setUTCDate(horizon.getUTCDate() + auth.availabilityHorizonDays); if (to > horizon) throw new BadRequestException({ code: 'CHANNEL_AVAILABILITY_RANGE_EXCEEDED', message: 'dateTo exceeds the maximum future publication horizon in the active channel contract' });
    const product = await this.prisma.productChannelMapping.findFirst({ where: { channelId: auth.channelId, externalProductCode: dto.externalProductCode.trim(), status: ChannelMappingStatus.ACTIVE }, include: { product: { include: { tenant: { include: { vendorProfile: true } }, currentRevision: { include: { fulfilmentPolicy: true } } } } } }); if (!product) throw new NotFoundException('Mapped product not found');
    const rate = await this.prisma.ratePlanChannelMapping.findFirst({ where: { channelId: auth.channelId, externalRatePlanCode: dto.externalRatePlanCode.trim(), status: ChannelMappingStatus.ACTIVE }, include: { inventoryRule: true, ratePlan: { include: { variant: true } } } }); if (!rate?.externalRatePlanCode) throw new NotFoundException('Mapped rate plan not found');
    const variant = await this.prisma.variantChannelMapping.findFirst({ where: { channelId: auth.channelId, variantId: rate.ratePlan.variantId, status: ChannelMappingStatus.ACTIVE }, include: { variant: true } }); if (!variant || variant.variant.productId !== product.productId || (dto.externalVariantCode && variant.externalVariantCode !== dto.externalVariantCode.trim())) throw new UnprocessableEntityException({ eligible: false, reasonCodes: ['CHANNEL_MAPPING_HIERARCHY_MISMATCH'], gates: [{ gate: 'HIERARCHY', status: 'FAIL', code: 'CHANNEL_MAPPING_HIERARCHY_MISMATCH' }] });
    if (!rate.inventoryRule) throw new UnprocessableEntityException({ eligible: false, reasonCodes: ['CHANNEL_INVENTORY_NOT_EXPOSED'], gates: [{ gate: 'INVENTORY_RULE', status: 'FAIL', code: 'CHANNEL_INVENTORY_NOT_EXPOSED' }] });
    const gate = this.eligibility ? await this.eligibility.evaluate({ channelId: auth.channelId, productId: product.productId, variantId: variant.variantId, ratePlanId: rate.ratePlanId }) : { eligible: true, reasonCodes: [] } as any; if (!gate.eligible) throw new UnprocessableEntityException({ eligible: false, reasonCodes: gate.reasonCodes, gates: gate.gates });
    const sessions = await this.prisma.serviceSession.findMany({ where: { scheduleTemplate: { variantId: variant.variantId, status: 'ACTIVE', archivedAt: null, ratePlanMappings: { some: { ratePlanId: rate.ratePlanId, active: true } } }, serviceDate: { gte: from, lte: to }, archivedAt: null }, include: { inventoryState: true, scheduleTemplate: true }, orderBy: [{ serviceDate: 'asc' }, { sessionKey: 'asc' }] });
    const rule = rate.inventoryRule; return { channel: { code: auth.channelCode, contractVersion: auth.contractVersion, horizonDays: auth.availabilityHorizonDays }, externalProductCode: product.externalProductCode, externalVariantCode: variant.externalVariantCode, externalRatePlanCode: rate.externalRatePlanCode, dateFrom: dto.dateFrom, dateTo: dto.dateTo, items: sessions.map((session) => { const remaining = calculatedAvailable(session.inventoryState?.totalCapacity ?? 0, session.inventoryState?.blockedCapacity ?? 0, session.inventoryState?.heldCapacity ?? 0, session.inventoryState?.confirmedCapacity ?? 0, session.status); const published = channelPublishedCapacity(remaining, rule.capacityBuffer, rule.maxPublishedCapacity); const available = session.status === SessionStatus.OPEN && published > 0; return { serviceDate: dateKey(new Date(session.serviceDate)), sessionId: session.id, sessionKey: session.sessionKey, localStartTime: session.localStartTime, localEndTime: session.localEndTime, timezone: session.scheduleTemplate.timezone, status: session.status, available, ...(rule.exposureMode === 'EXACT_REMAINING' ? { remainingCapacity: published } : {}) }; }) };
  }
}
