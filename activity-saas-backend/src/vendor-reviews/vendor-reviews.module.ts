import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorReviewsController } from './vendor-reviews.controller';
import { VendorReviewsService } from './vendor-reviews.service';

@Module({ imports: [AuthModule], controllers: [VendorReviewsController], providers: [VendorReviewsService] })
export class VendorReviewsModule {}
