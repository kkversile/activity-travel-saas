import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [AuthModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, RolesGuard],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
