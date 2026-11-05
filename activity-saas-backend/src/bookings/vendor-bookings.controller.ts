import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CancellationInitiator, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Response } from 'express';
import { BookingDecisionDto, BookingListQueryDto } from './booking.dto';
import { CancellationService } from './cancellation.service';
import { OperationalCancellationDto } from './cancellation.dto';
import { BookingsService } from './bookings.service';

@Controller('vendor/bookings')
@ApiTags('Vendor Bookings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorBookingsController {
  constructor(private readonly service: BookingsService, private readonly cancellations: CancellationService) {}
  @Get() @Permissions('booking.view.vendor') list(@CurrentUser() user: AuthUser, @Query() query: BookingListQueryDto) { return this.service.vendorList(user, query); }
  @Get('page') @Permissions('booking.view.vendor') page(@CurrentUser() user: AuthUser, @Query() query: BookingListQueryDto) { return this.service.vendorPage(user, query); }
  @Get('export.csv') @Permissions('booking.view.vendor') async exportCsv(@CurrentUser() user: AuthUser, @Query() query: BookingListQueryDto, @Res() response: Response) { response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="vendor-bookings.csv"'); return response.send(await this.service.vendorCsv(user, query)); }
  @Get(':id') @Permissions('booking.view.vendor') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.vendorDetail(user, id); }
  @Post(':id/confirm') @Permissions('booking.confirm.vendor') confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.vendorConfirm(user, id); }
  @Post(':id/reject') @Permissions('booking.reject.vendor') reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BookingDecisionDto) { return this.service.vendorReject(user, id, dto); }
  @Post(':id/api-failure')
  @Permissions('booking.reject.vendor')
  @ApiOperation({ summary: 'Report a supplier API failure and trigger configured multi-supplier failover' })
  @ApiBody({ type: BookingDecisionDto, description: 'Reason from the supplier connector or API callback.' })
  apiFailure(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BookingDecisionDto) { return this.service.vendorApiFailure(user, id, dto); }
  @Post(':id/cancellation/preview') @Permissions('booking.cancel.vendor') cancellationPreview(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.cancellations.vendorPreview(user, id); }
  @Post(':id/cancellation') @Permissions('booking.cancel.vendor') cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OperationalCancellationDto) { return this.cancellations.operationalCancel(user, id, dto, CancellationInitiator.VENDOR); }
}
