import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BookingCreateDto, BookingListQueryDto, BookingPreviewDto } from './booking.dto';
import { AgentCancellationDto } from './cancellation.dto';
import { CancellationService } from './cancellation.service';
import { BookingsService } from './bookings.service';

@Controller('agent/bookings')
@ApiTags('Agent Bookings')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.TRAVEL_AGENT)
export class AgentBookingsController {
  constructor(private readonly service: BookingsService, private readonly cancellations: CancellationService) {}
  @Post('preview') @ApiBody({ schema: { type: 'object', example: { ratePlanId: 'replace-with-rate-plan-id', sessionId: 'replace-with-session-id', travellers: [{ travellerType: 'ADULT', quantity: 2 }], units: 1, travellerDetails: [{ travellerType: 'ADULT', quantity: 2, fullName: 'Lead traveller', isLead: true }], bookingAnswers: {} } } }) @Permissions('booking.create') preview(@CurrentUser() user: AuthUser, @Body() dto: BookingPreviewDto) { return this.service.preview(user, dto); }
  @Post() @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable for the complete booking attempt and retries.' }) @ApiBody({ schema: { type: 'object', example: { ratePlanId: 'replace-with-rate-plan-id', sessionId: 'replace-with-session-id', travellers: [{ travellerType: 'ADULT', quantity: 2 }], units: 1, travellerDetails: [{ travellerType: 'ADULT', quantity: 2, fullName: 'Lead traveller', isLead: true }], bookingAnswers: {}, expectedQuoteFingerprint: 'copy-from-preview', expectedCancellationPolicyFingerprint: 'copy-from-preview', expectedContextFingerprint: 'copy-from-preview', priceChangeAcknowledged: true, cancellationPolicyAcknowledged: true, customerName: 'Demo customer', customerEmail: 'customer@example.com' } } }) @Permissions('booking.create') create(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string, @Body() dto: BookingCreateDto) { return this.service.create(user, dto, key); }
  @Get() @Permissions('booking.view.own') list(@CurrentUser() user: AuthUser, @Query() query: BookingListQueryDto) { return this.service.agentList(user, query); }
  @Get(':id') @Permissions('booking.view.own') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.agentDetail(user, id); }
  @Post(':id/cancellation/preview') @Permissions('booking.cancel.agent') cancellationPreview(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.cancellations.agentPreview(user, id); }
  @Post(':id/cancellation') @ApiHeader({ name: 'Idempotency-Key', required: true }) @Permissions('booking.cancel.agent') cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body() dto: AgentCancellationDto) { return this.cancellations.agentCancel(user, id, dto, key); }
}
