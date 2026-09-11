import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
@ApiTags('Payouts')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class PayoutsController {
  constructor(private readonly service: PayoutsService) {}

  @Get()
  @Permissions('payout.view')
  list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
}
