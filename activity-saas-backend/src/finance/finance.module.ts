import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';

@Module({ imports: [AuthModule, VendorOutletsModule], controllers: [FinanceController], providers: [FinanceService] })
export class FinanceModule {}
