import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) {
    return this.service.summary(user, outletId);
  }

  @Get('departures')
  departures(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) {
    return this.service.summary(user, outletId).then((data) => ({ departures: data.todayDepartures || [] }));
  }

  @Get('bookings-trend')
  bookingTrend(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    return this.service.bookingTrend(user, from, to, outletId);
  }
}
