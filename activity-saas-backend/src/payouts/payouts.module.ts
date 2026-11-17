import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';

@Module({ imports: [AuthModule, VendorOutletsModule], controllers: [PayoutsController], providers: [PayoutsService, RolesGuard] })
export class PayoutsModule {}
