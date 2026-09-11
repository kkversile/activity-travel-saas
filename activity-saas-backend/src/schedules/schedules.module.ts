import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulesController } from './schedules.controller';
import { SessionMaterializerService } from './session-materializer.service';
import { SchedulesService } from './schedules.service';
import { ScheduleOperationalStateService } from './schedule-operational-state.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule], controllers: [SchedulesController], providers: [SchedulesService, SessionMaterializerService, ScheduleOperationalStateService], exports: [SchedulesService, SessionMaterializerService, ScheduleOperationalStateService] })
export class SchedulesModule {}
