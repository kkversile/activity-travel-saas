import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorToolsController } from './vendor-tools.controller';
import { VendorToolsService } from './vendor-tools.service';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';

@Module({ imports: [AuthModule, VendorOutletsModule], controllers: [VendorToolsController], providers: [VendorToolsService] })
export class VendorToolsModule {}
