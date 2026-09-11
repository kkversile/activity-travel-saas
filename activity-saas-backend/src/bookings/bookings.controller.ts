import { Controller, Get, Param, ParseEnumPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { BookingsService } from './bookings.service';

@Controller('bookings')
@ApiTags('Bookings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false, description: 'Filter bookings by lifecycle status.' })
  @Permissions('booking.view')
  list(@CurrentUser() user: AuthUser, @Query('status', new ParseEnumPipe(BookingStatus, { optional: true })) status?: BookingStatus) { return this.service.list(user, status); }

  @Post(':id/confirm')
  @Permissions('booking.confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.confirm(user, id); }

  @Post(':id/cancel')
  @Permissions('booking.cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.cancel(user, id); }

  @Get(':id/voucher')
  @Permissions('booking.view')
  voucher(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.voucher(user, id); }
}
