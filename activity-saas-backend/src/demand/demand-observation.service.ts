import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MarketplaceSearchDto } from '../eligibility/eligibility.dto';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeScopeText } from './demand.types';

export type MarketplaceSearchDiagnostics = {
  candidateRatePlanCount: number;
  candidateSessionCount: number;
  eligibleOfferCountBeforePrice: number;
  resultProductCount: number;
  resultOfferCount: number;
  eligibilityFailureCounts: Record<string, number>;
  soldOutSessionIds: string[];
  priceDiagnostics: Record<string, unknown>;
};

@Injectable()
export class DemandObservationService {
  private readonly logger = new Logger(DemandObservationService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(user: AuthUser, dto: MarketplaceSearchDto, diagnostics: MarketplaceSearchDiagnostics) {
    if (!user.tenantId) return;
    try {
      const normalizedQuery = dto.query?.trim().toLowerCase().replace(/\s+/g, ' ');
      await this.prisma.marketplaceSearchObservation.create({
        data: {
          agentTenantId: user.tenantId,
          searchAttemptId: dto.searchAttemptId,
          observedAt: new Date(),
          serviceDate: new Date(`${dto.serviceDate}T00:00:00.000Z`),
          destinationNormalized: normalizeScopeText(dto.destination),
          category: normalizeScopeText(dto.category),
          subType: normalizeScopeText(dto.subType),
          durationMin: dto.durationMin,
          durationMax: dto.durationMax,
          priceMin: dto.priceMin,
          priceMax: dto.priceMax,
          currency: dto.currency,
          bookingMode: dto.bookingMode,
          pickupIncluded: dto.pickupIncluded,
          minimumRating: dto.minRating,
          privateShared: dto.privateShared?.toUpperCase(),
          childSuitable: dto.childSuitable,
          units: dto.units,
          totalPax: (dto.travellers ?? []).reduce((sum, item) => sum + item.quantity, 0),
          travellerSummary: { quantities: Object.fromEntries((dto.travellers ?? []).map((item) => [item.travellerType, item.quantity])) },
          queryPresent: Boolean(normalizedQuery),
          queryHash: normalizedQuery ? createHash('sha256').update(normalizedQuery).digest('hex') : null,
          candidateRatePlanCount: diagnostics.candidateRatePlanCount,
          candidateSessionCount: diagnostics.candidateSessionCount,
          eligibleOfferCountBeforePrice: diagnostics.eligibleOfferCountBeforePrice,
          resultProductCount: diagnostics.resultProductCount,
          resultOfferCount: diagnostics.resultOfferCount,
          zeroResult: diagnostics.resultProductCount === 0,
          eligibilityFailureCounts: diagnostics.eligibilityFailureCounts,
          soldOutSessionIds: diagnostics.soldOutSessionIds,
          priceDiagnostics: diagnostics.priceDiagnostics as any,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002' && dto.searchAttemptId) return;
      this.logger.error(`Marketplace demand observation failed: ${error?.message ?? error}`);
    }
  }

  firstObservedAt() {
    return this.prisma.marketplaceSearchObservation.findFirst({ orderBy: { observedAt: 'asc' }, select: { observedAt: true } });
  }
}
