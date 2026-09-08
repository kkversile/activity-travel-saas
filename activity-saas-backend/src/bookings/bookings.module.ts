import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({ imports: [AuthModule], controllers: [BookingsController], providers: [BookingsService, RolesGuard] })
export class BookingsModule {}
