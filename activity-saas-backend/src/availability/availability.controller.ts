import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AvailabilityService } from './availability.service';
import { BulkSlotsDto, CreatePromotionDto, PricingRuleDto } from './availability.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get('availability')
  list(@CurrentUser() user: AuthUser, @Query('activityId') activityId?: string) { return this.service.list(user, activityId); }

  @Post('availability/bulk')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkSlotsDto) { return this.service.bulkUpsert(user, dto); }

  @Delete('availability/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.remove(user, id); }

  @Get('promotions')
  promotions(@CurrentUser() user: AuthUser) { return this.service.listPromotions(user); }

  @Post('promotions')
  createPromotion(@CurrentUser() user: AuthUser, @Body() dto: CreatePromotionDto) { return this.service.createPromotion(user, dto); }

  @Patch('promotions/:id')
  toggle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('active') active: boolean) { return this.service.togglePromotion(user, id, Boolean(active)); }

  @Get('pricing-rules') rules(@CurrentUser() user: AuthUser, @Query('activityId') activityId?: string) { return this.service.listPricingRules(user, activityId); }

  @Post('pricing-rules') createRule(@CurrentUser() user: AuthUser, @Body() dto: PricingRuleDto) { return this.service.createPricingRule(user, dto); }

  @Patch('pricing-rules/:id') updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<PricingRuleDto>) { return this.service.updatePricingRule(user, id, dto); }

  @Delete('pricing-rules/:id') deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.deletePricingRule(user, id); }
}
