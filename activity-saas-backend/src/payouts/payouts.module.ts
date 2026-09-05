import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({ imports: [AuthModule], controllers: [PayoutsController], providers: [PayoutsService, RolesGuard] })
export class PayoutsModule {}
