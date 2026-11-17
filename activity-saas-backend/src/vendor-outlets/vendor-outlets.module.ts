import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorOutletsController } from './vendor-outlets.controller';
import { VendorOutletAccessService } from './vendor-outlet-access.service';
import { VendorOutletsService } from './vendor-outlets.service';

@Module({ imports: [AuthModule], controllers: [VendorOutletsController], providers: [VendorOutletsService, VendorOutletAccessService], exports: [VendorOutletAccessService, VendorOutletsService] })
export class VendorOutletsModule {}
