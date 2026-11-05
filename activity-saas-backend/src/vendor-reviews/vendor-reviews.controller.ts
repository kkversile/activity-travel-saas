import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { IngestVendorReviewDto, VendorReviewReplyDto } from './vendor-review.dto';
import { VendorReviewsService } from './vendor-reviews.service';

@Controller()
@ApiTags('Vendor reviews')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class VendorReviewsController {
  constructor(private readonly service: VendorReviewsService) {}

  @Post('admin/vendors/:tenantId/reviews')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Permissions('product.edit')
  ingest(@CurrentUser() user: AuthUser, @Param('tenantId') tenantId: string, @Body() dto: IngestVendorReviewDto) {
    return this.service.ingest(user, tenantId, dto);
  }

  @Get('vendor/reviews')
  @Roles(UserRole.VENDOR)
  @Permissions('product.view')
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Patch('vendor/reviews/:id/reply')
  @Roles(UserRole.VENDOR)
  @Permissions('product.edit')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VendorReviewReplyDto) {
    return this.service.reply(user, id, dto.vendorReply);
  }
}
