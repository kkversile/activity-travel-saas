import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { BookingsModule } from '../bookings/bookings.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AdminFulfilmentController, AgentVoucherController, ManifestController, VendorFulfilmentController } from './fulfilment.controller';
import { FulfilmentReadinessService } from './fulfilment-readiness.service';
import { FulfilmentService } from './fulfilment.service';
import { VoucherGenerationService } from './voucher-generation.service';
import { VoucherGenerationWorker } from './voucher-generation.worker';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, StorageModule, BookingsModule], controllers: [VendorFulfilmentController, AgentVoucherController, AdminFulfilmentController, ManifestController], providers: [FulfilmentReadinessService, VoucherGenerationService, FulfilmentService, VoucherGenerationWorker], exports: [FulfilmentService, FulfilmentReadinessService, VoucherGenerationService] })
export class FulfilmentModule {}
