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
import { ResourceDto, SessionResourceAllocationDto, UpdateResourceDto } from './resources.dto';
import { ResourcesService } from './resources.service';
import { swaggerExamples } from '../common/swagger-examples';

@Controller()
@ApiTags('Resources')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}
  @Get('resources') @Permissions('resource.view') list(@CurrentUser() u: AuthUser) { return this.service.list(u); }
  @Post('resources') @ApiBody({ schema: { type: 'object', example: swaggerExamples.resources.create } }) @Permissions('resource.edit') create(@CurrentUser() u: AuthUser, @Body() d: ResourceDto) { return this.service.create(u, d); }
  @Patch('resources/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.resources.update } }) @Permissions('resource.edit') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateResourceDto) { return this.service.update(u, id, d); }
  @Post('resources/:id/archive') @ApiBody({ schema: { type: 'object', example: { expectedVersion: 1 } } }) @Permissions('resource.edit') archive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateResourceDto) { return this.service.archive(u, id, d.expectedVersion); }
  @Get('schedules/:scheduleId/resource-requirements') @Permissions('resource.view') requirements(@CurrentUser() u: AuthUser, @Param('scheduleId') id: string) { return this.service.requirements(u, id); }
  @Get('sessions/:sessionId/resources') @Permissions('resource.view') sessionResources(@CurrentUser() u: AuthUser, @Param('sessionId') id: string) { return this.service.sessionResources(u, id); }
  @Post('sessions/:sessionId/resources') @ApiBody({ description: 'Replace resourceId with a resource returned by GET /api/resources.', schema: { type: 'object', example: swaggerExamples.resources.allocate } }) @Permissions('resource.edit') allocate(@CurrentUser() u: AuthUser, @Param('sessionId') id: string, @Body() d: SessionResourceAllocationDto) { return this.service.allocate(u, id, d); }
  @Delete('sessions/:sessionId/resources/:resourceId') @Permissions('resource.edit') release(@CurrentUser() u: AuthUser, @Param('sessionId') id: string, @Param('resourceId') resourceId: string) { return this.service.releaseAllocation(u, id, resourceId); }
}
