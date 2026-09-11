import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({ imports: [PrismaModule, AuthModule, AuditModule, OutboxModule, StorageModule], controllers: [CatalogueController], providers: [CatalogueService], exports: [CatalogueService] })
export class CatalogueModule {}
