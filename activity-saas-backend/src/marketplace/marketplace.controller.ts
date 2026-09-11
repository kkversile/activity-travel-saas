import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MarketplaceProductViewDto, MarketplaceSearchDto } from '../eligibility/eligibility.dto';
import { MarketplaceService } from './marketplace.service';

@Controller('marketplace')
@ApiTags('Marketplace')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.TRAVEL_AGENT)
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}
  @Post('search') @Permissions('marketplace.search') @ApiBody({ schema: { type: 'object', example: { serviceDate: '2026-09-20', travellers: [{ travellerType: 'ADULT', quantity: 2 }], destination: 'Munnar', sort: 'RELEVANCE', limit: 20 } } }) search(@CurrentUser() user: AuthUser, @Body() dto: MarketplaceSearchDto) { return this.service.search(user, dto); }
  @Post('products/:productId/view') @Permissions('marketplace.view') @ApiBody({ schema: { type: 'object', example: { serviceDate: '2026-09-20', travellers: [{ travellerType: 'ADULT', quantity: 2 }] } } }) view(@CurrentUser() user: AuthUser, @Param('productId') productId: string, @Body() dto: MarketplaceProductViewDto) { return this.service.productView(user, productId, dto); }
}
