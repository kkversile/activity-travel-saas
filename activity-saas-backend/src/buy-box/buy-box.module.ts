import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BuyBoxAdminController, BuyBoxVendorController } from './buy-box.controller';
import { BuyBoxService } from './buy-box.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule], controllers: [BuyBoxAdminController, BuyBoxVendorController], providers: [BuyBoxService], exports: [BuyBoxService] })
export class BuyBoxModule {}
