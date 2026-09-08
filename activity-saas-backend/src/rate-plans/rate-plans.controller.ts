import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateRatePlanDto, UpdateRatePlanDto } from './rate-plan.dto';
import { RatePlansService } from './rate-plans.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class RatePlansController {
  constructor(private readonly service: RatePlansService) {}

  @Get('activities/:activityId/rate-plans')
  list(@CurrentUser() user: AuthUser, @Param('activityId') activityId: string) {
    return this.service.list(user, activityId);
  }

  @Post('activities/:activityId/rate-plans')
  create(@CurrentUser() user: AuthUser, @Param('activityId') activityId: string, @Body() dto: CreateRatePlanDto) {
    return this.service.create(user, activityId, dto);
  }

  @Patch('rate-plans/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRatePlanDto) {
    return this.service.update(user, id, dto);
  }
}
