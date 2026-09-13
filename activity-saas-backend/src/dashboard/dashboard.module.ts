import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { QualityModule } from '../quality/quality.module';

@Module({
  imports: [AuthModule, QualityModule],
  controllers: [DashboardController],
  providers: [DashboardService, RolesGuard],
})
export class DashboardModule {}
