import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CommercialModule } from '../commercial/commercial.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AgentBookingsController } from './agent-bookings.controller';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingExpiryWorker } from './booking-expiry.worker';
import { CancellationPolicyService } from './cancellation-policy.service';
import { BookingProjectionService } from './booking-projection.service';
import { BookingSnapshotService } from './booking-snapshot.service';
import { RolesGuard } from '../common/roles.guard';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { VendorBookingsController } from './vendor-bookings.controller';
import { CancellationService } from './cancellation.service';
import { FulfilmentLifecycleService } from '../fulfilment/fulfilment-lifecycle.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, StorageModule, EligibilityModule, CommercialModule, InventoryModule], controllers: [BookingsController, AgentBookingsController, VendorBookingsController], providers: [BookingsService, BookingExpiryService, BookingExpiryWorker, BookingSnapshotService, BookingProjectionService, CancellationPolicyService, CancellationService, FulfilmentLifecycleService, RolesGuard], exports: [BookingsService, BookingExpiryService, CancellationService, FulfilmentLifecycleService] })
export class BookingsModule {}
