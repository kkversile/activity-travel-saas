import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { AgentSuspensionDto, DocumentReviewDto, EligibilityInspectDto, VendorVerificationDto } from './governance.dto';
import { EligibilityService } from '../eligibility/eligibility.service';
import { AdminService } from './admin.service';
import { BookingDecisionDto, BookingListQueryDto } from '../bookings/booking.dto';
import { BookingExpiryService } from '../bookings/booking-expiry.service';
import { BookingsService } from '../bookings/bookings.service';

@Controller('admin')
@ApiTags('Administration')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class AdminController {
  constructor(private readonly service: AdminService, private readonly eligibility: EligibilityService, private readonly bookings: BookingsService, private readonly expiry: BookingExpiryService) {}
  @Get('bookings') @Permissions('booking.view.admin') bookingsList(@Query() query: BookingListQueryDto) { return this.bookings.adminList(query); }
  @Get('bookings/:id') @Permissions('booking.view.admin') bookingsDetail(@Param('id') id: string) { return this.bookings.adminDetail(id); }
  @Post('bookings/:id/manual-confirm') @Permissions('booking.manual.decide') manualConfirm(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.bookings.manualConfirm(user, id); }
  @Post('bookings/:id/manual-reject') @Permissions('booking.manual.decide') manualReject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BookingDecisionDto) { return this.bookings.manualReject(user, id, dto); }
  @Post('bookings/expire-due') @Permissions('booking.expiry.run') expireDue(@CurrentUser() user: AuthUser) { return this.expiry.expireDue(new Date(), user); }
  @Get('dashboard') @Permissions('audit.view') dashboard() { return this.service.dashboard(); }
  @Get('vendors') @Permissions('vendor.profile.view') vendors() { return this.service.vendors(); }
  @Get('agents') @Permissions('agent.governance.view') agents() { return this.service.agents(); }
  @Post('agents/:tenantId/approve') @Permissions('agent.governance.edit') approveAgent(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string) { return this.service.approveAgent(user, tenantId); }
  @Post('agents/:tenantId/suspend') @Permissions('agent.governance.edit') suspendAgent(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Body() dto: AgentSuspensionDto) { return this.service.suspendAgent(user, tenantId, dto.reason); }
  @Post('rate-plans/:ratePlanId/agent-channel') @Permissions('marketplace.channel.manage') setAgentChannel(@CurrentUser() user: AuthUser, @Param('ratePlanId') ratePlanId: string, @Body() dto: { enabled: boolean }) { return this.service.setRatePlanChannel(user, ratePlanId, dto.enabled); }
  @Post('eligibility/inspect') @Permissions('eligibility.inspect') inspect(@Body() dto: EligibilityInspectDto) { return this.eligibility.evaluate({ agentTenantId: dto.agentTenantId, ratePlanId: dto.ratePlanId, sessionId: dto.sessionId, travellers: dto.travellers as any, units: dto.units, now: dto.now ? new Date(dto.now) : undefined, channelCode: 'VOYA_AGENT' }); }
  @Get('vendors/:tenantId') @Permissions('vendor.profile.view', 'document.view') vendor(@Param('tenantId') tenantId: string) { return this.service.vendor(tenantId); }
  @Patch('vendors/:tenantId/verification') @ApiBody({ schema: { type: 'object', example: { status: 'VERIFIED', reason: 'Business details and documents verified.' } } }) @Permissions('document.review') verification(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Body() dto: VendorVerificationDto) { return this.service.verification(user, tenantId, dto.status, dto.reason); }
  @Patch('vendors/:tenantId/documents/versions/:versionId') @ApiBody({ schema: { type: 'object', example: { status: 'VERIFIED', reason: 'Document reviewed and accepted.' } } }) @Permissions('document.review') document(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Param('versionId') versionId: string, @Body() dto: DocumentReviewDto) { return this.service.document(user, tenantId, versionId, dto.status, dto.reason); }
}
