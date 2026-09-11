import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AgentGroupMemberDto, CreateAgentGroupDto, CreateCommercialRuleDto, CreateCommercialRuleVersionDto, CreateCommercialVersionDto, QuoteDto, UpdateCommercialVersionDto } from './commercial.dto';
import { CommercialService } from './commercial.service';
import { swaggerExamples } from '../common/swagger-examples';

@Controller()
@ApiTags('Commercial')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CommercialController {
  constructor(private readonly service: CommercialService) {}
  @Get('rate-plans/:id/commercial') @Roles(UserRole.VENDOR) @Permissions('commercial.vendor.view') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.getRatePlanCommercial(u, id); }
  @Post('rate-plans/:id/commercial/versions') @ApiBody({ description: 'Creates a supplier commercial version for a rate plan.', schema: { type: 'object', example: swaggerExamples.commercial.vendorVersion } }) @Roles(UserRole.VENDOR) @Permissions('commercial.vendor.edit') create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateCommercialVersionDto) { return this.service.createVersion(u, id, dto); }
  @Patch('rate-plan-commercial-versions/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.commercial.vendorVersion } }) @Roles(UserRole.VENDOR) @Permissions('commercial.vendor.edit') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommercialVersionDto) { return this.service.updateVersion(u, id, dto); }
  @Post('rate-plan-commercial-versions/:id/activate') @Roles(UserRole.VENDOR) @Permissions('commercial.vendor.edit') activate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.activateVersion(u, id); }
  @Get('admin/commercial-rules') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.internal.view') rules() { return this.service.listRules(); }
  @Post('admin/commercial-rules') @ApiBody({ schema: { type: 'object', example: swaggerExamples.commercial.rule } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.internal.edit') rule(@CurrentUser() u: AuthUser, @Body() dto: CreateCommercialRuleDto) { return this.service.createRule(u, dto); }
  @Post('admin/commercial-rules/:id/versions') @ApiBody({ description: 'The config shape depends on the rule kind. This example is a Voya revenue percentage markup.', schema: { type: 'object', example: swaggerExamples.commercial.ruleVersion } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.internal.edit') ruleVersion(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateCommercialRuleVersionDto) { return this.service.createRuleVersion(u, id, dto); }
  @Post('admin/commercial-rule-versions/:id/activate') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.internal.edit') ruleActivate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.activateRuleVersion(u, id); }
  @Post('admin/commercial-rules/:id/archive') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.internal.edit') archive(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.archiveRule(u, id); }
  @Get('admin/agent-groups') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.agent-groups.manage') groups() { return this.service.listGroups(); }
  @Post('admin/agent-groups') @ApiBody({ schema: { type: 'object', example: swaggerExamples.commercial.agentGroup } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.agent-groups.manage') group(@CurrentUser() u: AuthUser, @Body() dto: CreateAgentGroupDto) { return this.service.createGroup(u, dto); }
  @Post('admin/agent-groups/:id/members') @ApiBody({ description: 'Replace the placeholder with an existing travel-agent tenant ID.', schema: { type: 'object', example: swaggerExamples.commercial.agentMember } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.agent-groups.manage') member(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AgentGroupMemberDto) { return this.service.addMember(u, id, dto); }
  @Delete('admin/agent-groups/:id/members/:agentTenantId') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.agent-groups.manage') remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('agentTenantId') agentTenantId: string) { return this.service.removeMember(u, id, agentTenantId); }
  @Post('admin/commercial/quote') @ApiBody({ description: 'Replace ratePlanId with a real rate plan ID from the vendor catalogue.', schema: { type: 'object', example: swaggerExamples.commercial.quote } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('commercial.quote.internal') quote(@CurrentUser() u: AuthUser, @Body() dto: QuoteDto) { return this.service.quote(u, dto); }
}
