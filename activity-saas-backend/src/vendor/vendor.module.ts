import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';

@Module({
  imports: [AuthModule],
  controllers: [VendorController],
  providers: [VendorService, RolesGuard],
})
export class VendorModule {}
