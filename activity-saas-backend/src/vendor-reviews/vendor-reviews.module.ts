import { Module } from '@nestjs/common';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';
import { AuthModule } from '../auth/auth.module';
import { VendorReviewsController } from './vendor-reviews.controller';
import { VendorReviewsService } from './vendor-reviews.service';

@Module({ imports: [VendorOutletsModule, AuthModule], controllers: [VendorReviewsController], providers: [VendorReviewsService] })
export class VendorReviewsModule {}
