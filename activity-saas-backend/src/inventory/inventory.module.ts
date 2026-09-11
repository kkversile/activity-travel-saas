import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesModule } from '../resources/resources.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { InventoryController } from './inventory.controller';
import { InventoryReservationService } from './inventory-reservation.service';
import { InventoryService } from './inventory.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, ResourcesModule, SchedulesModule], controllers: [InventoryController], providers: [InventoryService, InventoryReservationService], exports: [InventoryService, InventoryReservationService] })
export class InventoryModule {}
