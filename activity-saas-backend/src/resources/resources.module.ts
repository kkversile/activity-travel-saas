import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, VendorOutletsModule], controllers: [ResourcesController], providers: [ResourcesService], exports: [ResourcesService] })
export class ResourcesModule {}
