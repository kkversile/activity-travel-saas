import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CommercialModule } from '../commercial/commercial.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelContractService } from './channel-contract.service';
import { ChannelEligibilityService } from './channel-eligibility.service';
import { ChannelMappingService } from './channel-mapping.service';
import { DistributionAdminController } from './distribution-admin.controller';
import { DistributionApiController } from './distribution-api.controller';
import { DistributionAvailabilityService } from './distribution-availability.service';
import { DistributionAuthGuard, DistributionCapabilityGuard } from './distribution-auth.guard';
import { DistributionCatalogService } from './distribution-catalog.service';
import { DistributionEventProjectorService, DistributionEventService } from './distribution-event.service';
import { DistributionPricingService } from './distribution-pricing.service';
import { DistributionService } from './distribution.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, CommercialModule, EligibilityModule], controllers: [DistributionAdminController, DistributionApiController], providers: [DistributionService, ChannelContractService, ChannelMappingService, ChannelEligibilityService, DistributionCatalogService, DistributionAvailabilityService, DistributionPricingService, DistributionAuthGuard, DistributionCapabilityGuard, DistributionEventService, DistributionEventProjectorService], exports: [DistributionService, ChannelEligibilityService, ChannelMappingService, ChannelContractService] })
export class DistributionModule {}
