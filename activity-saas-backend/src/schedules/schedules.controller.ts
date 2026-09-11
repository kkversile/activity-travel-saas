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
import { CreateScheduleDto, MaterializeSessionsDto, RatePlanScheduleDto, ResourceRequirementDto, ScheduleExceptionDto, ScheduleSlotDto, ScheduleVersionDto, UpdateResourceRequirementDto, UpdateScheduleDto, UpdateScheduleSlotDto } from './schedules.dto';
import { SchedulesService } from './schedules.service';
import { swaggerExamples } from '../common/swagger-examples';

@Controller()
@ApiTags('Schedules')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}
  @Get('variants/:variantId/schedules') @Permissions('schedule.view') list(@CurrentUser() u: AuthUser, @Param('variantId') v: string) { return this.service.list(u, v); }
  @Post('variants/:variantId/schedules') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.create } }) @Permissions('schedule.edit') create(@CurrentUser() u: AuthUser, @Param('variantId') v: string, @Body() d: CreateScheduleDto) { return this.service.create(u, v, d); }
  @Get('schedules/:id') @Permissions('schedule.view') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service['ownedSchedule'](u, id); }
  @Patch('schedules/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.update } }) @Permissions('schedule.edit') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateScheduleDto) { return this.service.update(u, id, d); }
  @Post('schedules/:id/activate') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') activate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.activate(u, id, d.expectedVersion); }
  @Post('schedules/:id/deactivate') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') deactivate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.deactivate(u, id, d.expectedVersion); }
  @Post('schedules/:id/archive') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') archive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.archive(u, id, d.expectedVersion); }
  @Post('schedules/:id/slots') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.slot } }) @Permissions('schedule.edit') addSlot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleSlotDto & ScheduleVersionDto) { return this.service.addSlot(u, id, d); }
  @Patch('schedule-slots/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.updateSlot } }) @Permissions('schedule.edit') updateSlot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateScheduleSlotDto) { return this.service.updateSlot(u, id, d); }
  @Post('schedule-slots/:id/archive') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') archiveSlot(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.archiveSlot(u, id, d.expectedVersion); }
  @Post('schedules/:id/rate-plans/:ratePlanId') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') map(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('ratePlanId') ratePlanId: string, @Body() d: ScheduleVersionDto) { return this.service.mapRatePlan(u, id, { ratePlanId, expectedVersion: d.expectedVersion }); }
  @Delete('schedules/:id/rate-plans/:ratePlanId') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') unmap(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('ratePlanId') ratePlanId: string, @Body() d: ScheduleVersionDto) { return this.service.unmapRatePlan(u, id, ratePlanId, d.expectedVersion); }
  @Post('schedules/:id/exceptions') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.exception } }) @Permissions('schedule.edit') exception(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleExceptionDto) { return this.service.addException(u, id, d); }
  @Post('schedule-exceptions/:id/archive') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') archiveException(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.archiveException(u, id, d.expectedVersion); }
  @Post('schedules/:id/materialize') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.materialize } }) @Permissions('schedule.edit') materialize(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: MaterializeSessionsDto) { return this.service.materialize(u, id, d); }
  @Post('schedules/:id/resource-requirements') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.requirement } }) @Permissions('schedule.edit') requirement(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ResourceRequirementDto) { return this.service.addRequirement(u, id, d); }
  @Patch('schedule-resource-requirements/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.updateRequirement } }) @Permissions('schedule.edit') updateRequirement(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: UpdateResourceRequirementDto) { return this.service.updateRequirement(u, id, d); }
  @Post('schedule-resource-requirements/:id/archive') @ApiBody({ schema: { type: 'object', example: swaggerExamples.schedules.version } }) @Permissions('schedule.edit') archiveRequirement(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() d: ScheduleVersionDto) { return this.service.archiveRequirement(u, id, d.expectedVersion); }
}
