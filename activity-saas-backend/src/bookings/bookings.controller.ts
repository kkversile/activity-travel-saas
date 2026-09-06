import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BookingsService } from './bookings.service';

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: BookingStatus) { return this.service.list(user, status); }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.confirm(user, id); }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.cancel(user, id); }

  @Get(':id/voucher')
  voucher(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.voucher(user, id); }
}
