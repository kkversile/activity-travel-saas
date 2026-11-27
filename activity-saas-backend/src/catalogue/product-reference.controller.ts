import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { Permissions } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.types';
import { PRODUCT_ENTRY_VERSION, PRODUCT_SUBTYPES } from '../common/product-entry-contract';
import { importChoices } from '../common/product-import-contract';
import { ProductDestinationsService } from './product-destinations.service';

@Controller('product-entry')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ProductReferenceController {
  constructor(private readonly destinations: ProductDestinationsService) {}
  @Get('reference') @Permissions('product.view')
  async reference() { return { version: PRODUCT_ENTRY_VERSION, destinations: await this.destinations.list(), subtypes: PRODUCT_SUBTYPES, choices: importChoices }; }
  @Post('destinations') @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) @Permissions('platform.settings.manage')
  add(@CurrentUser() actor: AuthUser, @Body() input: unknown) { return this.destinations.add(actor, input); }
}
