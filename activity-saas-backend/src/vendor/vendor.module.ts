import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';
import { VendorDocumentExpiryWorker } from './vendor-document-expiry.worker';

@Module({
  imports: [AuthModule],
  controllers: [VendorController],
  providers: [VendorService, VendorDocumentExpiryWorker, RolesGuard],
})
export class VendorModule {}
