import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminQualityController, VendorQualityController } from './quality.controller';
import { SupplierPerformanceService } from './supplier-performance.service';
import { SupplierQualityEvaluator } from './supplier-quality-evaluator';
import { SupplierQualityIssueService, SupplierQualityPolicyService, SupplierQualitySnapshotService, SupplierTierService } from './supplier-quality.service';

@Module({ imports: [VendorOutletsModule, PrismaModule, AuthModule], controllers: [VendorQualityController, AdminQualityController], providers: [SupplierQualityEvaluator, SupplierPerformanceService, SupplierQualitySnapshotService, SupplierQualityPolicyService, SupplierQualityIssueService, SupplierTierService], exports: [SupplierPerformanceService, SupplierQualitySnapshotService] })
export class QualityModule {}
