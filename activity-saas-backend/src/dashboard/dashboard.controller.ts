import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.summary(user);
  }
}
