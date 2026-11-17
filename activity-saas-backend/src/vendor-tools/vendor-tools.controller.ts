import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { VendorToolsService } from './vendor-tools.service';

@Controller('vendor')
@ApiTags('Vendor Partner Hub')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorToolsController {
  constructor(private readonly service: VendorToolsService) {}
  @Get('activity-categories') @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions('product.view') listActivityCategories() { return this.service.listActivityCategories(); }
  @Get('locations/search') @Permissions('product.view') searchLocations(@CurrentUser() user: AuthUser, @Query('q') query: string) { return this.service.searchLocations(user, query); }
  @Post('locations/verify') @Permissions('product.edit') saveLocation(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.saveLocation(user, body, outletId); }
  @Get('itinerary/:revisionId') @Permissions('product.view') listItinerary(@CurrentUser() user: AuthUser, @Param('revisionId') revisionId: string, @Query('outletId') outletId?: string) { return this.service.listItinerary(user, revisionId, outletId); }
  @Put('itinerary/:revisionId') @Permissions('product.edit') replaceItinerary(@CurrentUser() user: AuthUser, @Param('revisionId') revisionId: string, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.replaceItinerary(user, revisionId, body, outletId); }
  @Get('team') @Permissions('vendor.team.manage') listTeam(@CurrentUser() user: AuthUser) { return this.service.listTeam(user); }
  @Patch('team/members/:id') @Permissions('vendor.team.manage') updateTeamMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateTeamMember(user, id, body); }
  @Post('team/invitations') @Permissions('vendor.team.manage') inviteTeamMember(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.inviteTeamMember(user, body); }
  @Patch('team/invitations/:id') @Permissions('vendor.team.manage') updateTeamInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateTeamInvitation(user, id, body); }
  @Get('notification-preferences') @Permissions('product.view') getNotificationPreferences(@CurrentUser() user: AuthUser) { return this.service.getNotificationPreferences(user); }
  @Patch('notification-preferences') @Permissions('product.edit') updateNotificationPreferences(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.updateNotificationPreferences(user, body); }
  @Get('promotions') @Permissions('product.view') listPromotions(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) { return this.service.listPromotions(user, outletId); }
  @Post('promotions') @Permissions('product.edit') createPromotion(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.createPromotion(user, body, outletId); }
  @Patch('promotions/:id') @Permissions('product.edit') updatePromotion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.updatePromotion(user, id, body, outletId); }
  @Get('reports') @Permissions('product.view') listReports(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) { return this.service.listReports(user, outletId); }
  @Get('report-schedules') @Permissions('product.view') listReportSchedules(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) { return this.service.listReportSchedules(user, outletId); }
  @Post('report-schedules') @Permissions('product.edit') createReportSchedule(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.createReportSchedule(user, { ...body, outletId: outletId || body.outletId }); }
  @Patch('report-schedules/:id') @Permissions('product.edit') updateReportSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>, @Query('outletId') outletId?: string) { return this.service.updateReportSchedule(user, id, body, outletId); }
  @Post('reports') @HttpCode(HttpStatus.ACCEPTED) @Permissions('product.view') createReport(@CurrentUser() user: AuthUser, @Body() body: { type: string; from?: string; to?: string; format?: string; outletId?: string }, @Query('outletId') outletId?: string) { return this.service.enqueueReport(user, { ...body, outletId: outletId || body.outletId }); }
  @Get('reports/:id/download') @Permissions('product.view') async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() response: Response, @Query('outletId') outletId?: string) { const result = await this.service.downloadReport(user, id, outletId); response.setHeader('Content-Type', result.contentType); response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`); return response.send(result.body); }
}
