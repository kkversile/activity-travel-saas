import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DemandAnalysisService } from './demand-analysis.service';
import { DemandController } from './demand.controller';
import { DemandObservationService } from './demand-observation.service';
import { DemandOpportunityService } from './demand-opportunity.service';
import { DemandPolicyService } from './demand-policy.service';
import { VendorDemandController } from './vendor-demand.controller';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule], controllers: [DemandController, VendorDemandController], providers: [DemandObservationService, DemandPolicyService, DemandAnalysisService, DemandOpportunityService], exports: [DemandObservationService] })
export class DemandModule {}

