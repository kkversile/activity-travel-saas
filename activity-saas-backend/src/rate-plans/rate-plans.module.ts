import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { RatePlansController } from './rate-plans.controller';
import { RatePlansService } from './rate-plans.service';
import { CommercialModule } from '../commercial/commercial.module';

@Module({
  imports: [AuthModule, CommercialModule],
  controllers: [RatePlansController],
  providers: [RatePlansService, RolesGuard],
})
export class RatePlansModule {}
