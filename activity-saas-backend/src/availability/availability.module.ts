import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({ imports: [AuthModule], controllers: [AvailabilityController], providers: [AvailabilityService, RolesGuard] })
export class AvailabilityModule {}
