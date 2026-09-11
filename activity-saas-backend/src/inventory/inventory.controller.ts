import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { InventoryBulkApplyDto, InventoryBulkPreviewDto, InventoryQueryDto } from './inventory.dto';
import { InventoryService } from './inventory.service';
import { swaggerExamples } from '../common/swagger-examples';

@Controller('inventory')
@ApiTags('Inventory')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get() @Permissions('inventory.view') list(@CurrentUser() u: AuthUser, @Query() q: InventoryQueryDto) { return this.service.list(u, q); }
  @Post('bulk/preview') @ApiBody({ description: 'Preview a capacity or session-status change without persisting it.', schema: { type: 'object', example: swaggerExamples.inventory.preview } }) @Permissions('inventory.view') preview(@CurrentUser() u: AuthUser, @Body() d: InventoryBulkPreviewDto) { return this.service.bulkPreview(u, d); }
  @Post('bulk/apply') @ApiBody({ description: 'Apply one or more inventory changes. Use versions returned by the inventory GET or preview response.', schema: { type: 'object', example: swaggerExamples.inventory.apply } }) @Permissions('inventory.edit') apply(@CurrentUser() u: AuthUser, @Body() d: InventoryBulkApplyDto) { return this.service.bulkApply(u, d); }
}
