import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AgentPortalService } from './agent-portal.service';

@Controller('agent')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.TRAVEL_AGENT)
export class AgentPortalController {
  constructor(private readonly service: AgentPortalService) {}

  @Get('dashboard') @Permissions('agent.dashboard.view') dashboard(@CurrentUser() user: AuthUser) { return this.service.dashboard(user); }
  @Get('finance') @Permissions('agent.finance.view') finance(@CurrentUser() user: AuthUser) { return this.service.finance(user); }
  @Get('reports') @Permissions('agent.reports.view') reports(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) { return this.service.reports(user, from, to); }
  @Get('profile') @Permissions('agent.profile.view') profile(@CurrentUser() user: AuthUser) { return this.service.profile(user); }
  @Patch('profile') @Permissions('agent.profile.edit') updateProfile(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.updateProfile(user, body); }
  @Get('team') @Permissions('agent.profile.view') team(@CurrentUser() user: AuthUser) { return this.service.team(user); }
  @Patch('team/members/:id') @Permissions('agent.team.manage') updateMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateMember(user, id, body); }
  @Post('team/invitations') @Permissions('agent.team.manage') invite(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.invite(user, body); }
  @Patch('team/invitations/:id') @Permissions('agent.team.manage') updateInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.updateInvitation(user, id, body); }
}
