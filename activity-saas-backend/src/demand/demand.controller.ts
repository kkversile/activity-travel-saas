import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DemandAnalysisService } from './demand-analysis.service';
import { CreateDemandPolicyDto, DemandListQueryDto, DemandWindowDto, ManualDemandOpportunityDto, OpportunityMutationDto, OpportunityPatchDto, OpportunityRemovalDto, OpportunityResolveDto, OpportunityTargetDto, UpdateDemandPolicyDto } from './demand.dto';
import { DemandOpportunityService } from './demand-opportunity.service';
import { DemandPolicyService } from './demand-policy.service';

@Controller('admin/demand')
@ApiTags('Demand Intelligence')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class DemandController {
  constructor(private readonly opportunities: DemandOpportunityService, private readonly analysis: DemandAnalysisService, private readonly policies: DemandPolicyService) {}
  @Get('overview') @Permissions('demand.view.admin') overview() { return this.opportunities.overview(); }
  @Post('preview') @ApiBody({ schema: { type: 'object', example: { windowStart: '2026-09-01T00:00:00.000Z', windowEnd: '2026-09-30T23:59:59.999Z', horizonEnd: '2026-10-30T23:59:59.999Z' } } }) @Permissions('demand.view.admin') preview(@Body() dto: DemandWindowDto) { return this.analysis.preview(dto); }
  @Post('generate') @ApiBody({ schema: { type: 'object', example: {} } }) @Permissions('demand.manage') generate(@CurrentUser() user: AuthUser, @Body() dto: DemandWindowDto) { return this.analysis.generate(user, dto); }
  @Get('opportunities') @Permissions('demand.view.admin') list(@Query() query: DemandListQueryDto) { return this.opportunities.list(query); }
  @Get('opportunities/:id') @Permissions('demand.view.admin') detail(@Param('id') id: string) { return this.opportunities.detail(id); }
  @Post('opportunities/manual') @Permissions('demand.manage') manual(@CurrentUser() user: AuthUser, @Body() dto: ManualDemandOpportunityDto) { return this.opportunities.manual(user, dto); }
  @Patch('opportunities/:id') @Permissions('demand.manage') patch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityPatchDto) { return this.opportunities.patch(user, id, dto); }
  @Post('opportunities/:id/acknowledge') @Permissions('demand.manage') acknowledge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityMutationDto) { return this.opportunities.acknowledge(user, id, dto); }
  @Post('opportunities/:id/start') @Permissions('demand.manage') start(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityMutationDto) { return this.opportunities.start(user, id, dto); }
  @Post('opportunities/:id/resolve') @Permissions('demand.manage') resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityResolveDto) { return this.opportunities.resolve(user, id, dto); }
  @Post('opportunities/:id/dismiss') @Permissions('demand.manage') dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityMutationDto) { return this.opportunities.dismiss(user, id, dto); }
  @Post('opportunities/:id/targets') @Permissions('demand.target.manage') target(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OpportunityTargetDto) { return this.opportunities.target(user, id, dto); }
  @Delete('opportunities/:id/targets/:vendorTenantId') @Permissions('demand.target.manage') untarget(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('vendorTenantId') vendorTenantId: string, @Body() dto: OpportunityRemovalDto) { return this.opportunities.untarget(user, id, vendorTenantId, dto); }
  @Get('opportunities/:id/vendor-candidates') @Permissions('demand.target.manage') candidates(@Param('id') id: string) { return this.opportunities.candidates(id); }
  @Get('owners') @Permissions('demand.manage') owners() { return this.opportunities.owners(); }
  @Get('policies') @Permissions('demand.policy.manage') policiesList() { return this.policies.list(); }
  @Post('policies') @Permissions('demand.policy.manage') policyCreate(@CurrentUser() user: AuthUser, @Body() dto: CreateDemandPolicyDto) { return this.policies.create(user, dto); }
  @Patch('policies/:id') @Permissions('demand.policy.manage') policyUpdate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDemandPolicyDto) { return this.policies.update(user, id, dto); }
  @Post('policies/:id/activate') @Permissions('demand.policy.manage') policyActivate(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.policies.activate(user, id); }
  @Post('policies/:id/retire') @Permissions('demand.policy.manage') policyRetire(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.policies.retire(user, id); }
}
