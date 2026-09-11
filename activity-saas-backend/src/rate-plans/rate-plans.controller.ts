import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { CreateRatePlanDto, UpdateRatePlanDto } from './rate-plan.dto';
import { RatePlansService } from './rate-plans.service';
import { swaggerExamples } from '../common/swagger-examples';

@Controller()
@ApiTags('Rate Plans')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class RatePlansController {
  constructor(private readonly service: RatePlansService) {}

  @Get('variants/:variantId/rate-plans')
  @Permissions('rateplan.view')
  list(@CurrentUser() user: AuthUser, @Param('variantId') variantId: string) {
    return this.service.list(user, variantId);
  }

  @Post('variants/:variantId/rate-plans')
  @ApiBody({ description: 'Creates a rate plan with traveller and cancellation rules.', schema: { type: 'object', example: swaggerExamples.ratePlans.create } })
  @Permissions('rateplan.edit')
  create(@CurrentUser() user: AuthUser, @Param('variantId') variantId: string, @Body() dto: CreateRatePlanDto) {
    return this.service.create(user, variantId, dto);
  }

  @Patch('rate-plans/:id')
  @ApiBody({ schema: { type: 'object', example: swaggerExamples.ratePlans.update } })
  @Permissions('rateplan.edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRatePlanDto) {
    return this.service.update(user, id, dto);
  }
}
