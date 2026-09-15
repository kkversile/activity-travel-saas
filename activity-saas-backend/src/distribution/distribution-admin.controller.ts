import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ChannelContractService } from './channel-contract.service';
import { ChannelMappingService } from './channel-mapping.service';
import { CreateChannelDto, CreateContractDto, CreateCredentialDto, InventoryRuleDto, MappingDto, RateMappingDto, UpdateChannelDto, UpdateContractDto, VariantMappingDto } from './distribution.dto';
import { DistributionEventProjectorService, DistributionEventService } from './distribution-event.service';
import { DistributionService } from './distribution.service';

@Controller('admin/distribution')
@ApiTags('Distribution Administration')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class DistributionAdminController {
  constructor(private readonly service: DistributionService, private readonly contracts: ChannelContractService, private readonly mappings: ChannelMappingService, private readonly projector: DistributionEventProjectorService, private readonly events: DistributionEventService) {}
  @Get('overview') @Permissions('distribution.view') overview() { return this.service.overview(); }
  @Get('channels') @Permissions('distribution.view') channels() { return this.service.channels(); }
  @Post('channels') @Permissions('distribution.channel.manage') createChannel(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) { return this.service.createChannel(user, dto); }
  @Patch('channels/:id') @Permissions('distribution.channel.manage') updateChannel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateChannelDto) { return this.service.updateChannel(user, id, dto); }
  @Get('contracts') @Permissions('distribution.view') contractList(@Query('channelId') channelId?: string) { return this.service.contractsList(channelId); }
  @Post('channels/:channelId/contracts') @Permissions('distribution.contract.manage') createContract(@CurrentUser() user: AuthUser, @Param('channelId') channelId: string, @Body() dto: CreateContractDto) { return this.service.createContract(user, channelId, dto); }
  @Patch('contracts/:id') @Permissions('distribution.contract.manage') updateContract(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateContractDto) { return this.service.updateContract(user, id, dto); }
  @Post('contracts/:id/activate') @Permissions('distribution.contract.manage') activateContract(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.activateContract(user, id); }
  @Post('contracts/:id/retire') @Permissions('distribution.contract.manage') retireContract(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.retireContract(user, id); }
  @Get('mappings') @Permissions('distribution.view') mappingList(@Query('channelId') channelId?: string) { return this.service.mappingWorkspace(channelId); }
  @Post('mappings/products') @Permissions('distribution.mapping.manage') productMapping(@CurrentUser() user: AuthUser, @Body() dto: MappingDto) { return this.service.productMapping(user, dto); }
  @Post('mappings/variants') @Permissions('distribution.mapping.manage') variantMapping(@CurrentUser() user: AuthUser, @Body() dto: VariantMappingDto) { return this.service.variantMapping(user, dto); }
  @Post('mappings/rate-plans') @Permissions('distribution.mapping.manage') rateMapping(@CurrentUser() user: AuthUser, @Body() dto: RateMappingDto) { return this.service.rateMapping(user, dto); }
  @Post('inventory-rules') @Permissions('distribution.inventory-rule.manage') inventoryRule(@CurrentUser() user: AuthUser, @Body() dto: InventoryRuleDto) { return this.service.inventoryRule(user, dto); }
  @Get('credentials') @Permissions('distribution.view') credentials(@Query('channelId') channelId?: string) { return this.service.credentials(channelId); }
  @Post('credentials') @Permissions('distribution.credential.manage') credential(@CurrentUser() user: AuthUser, @Body() dto: CreateCredentialDto) { return this.service.createCredential(user, dto); }
  @Post('credentials/:id/revoke') @Permissions('distribution.credential.manage') revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.revokeCredential(user, id); }
  @Post('projector/run') @Permissions('distribution.event.view') project() { return this.projector.project(); }
  @Get('inventory-rules') @Permissions('distribution.view') inventoryRules(@Query('channelId') channelId?: string) { return this.service.inventoryList(channelId); }
  @Get('events') @Permissions('distribution.event.view') eventFeed(@Query('channelId') channelId?: string, @Query('type') type?: any, @Query('resourceType') resourceType?: string) { return this.events.adminList(channelId, type, resourceType); }
  @Post('readiness') @Permissions('distribution.inspect') readiness(@Body() input: { channelId: string; productId: string; variantId: string; ratePlanId: string; currency?: string; units?: number }) { return this.service.readiness(input); }
}
