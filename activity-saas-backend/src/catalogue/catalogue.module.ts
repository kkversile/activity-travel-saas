import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CommercialModule } from '../commercial/commercial.module';
import { DistributionModule } from '../distribution/distribution.module';
import { RatePlansModule } from '../rate-plans/rate-plans.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { CatalogueEmailService } from './catalogue-email.service';
import { ProductReadinessService } from './product-readiness.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, StorageModule, CommercialModule, DistributionModule, RatePlansModule, SchedulesModule], controllers: [CatalogueController], providers: [CatalogueService, CatalogueEmailService, ProductReadinessService], exports: [CatalogueService, ProductReadinessService] })
export class CatalogueModule {}
