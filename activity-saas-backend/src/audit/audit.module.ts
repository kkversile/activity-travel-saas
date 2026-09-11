import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../common/request-context.module';
import { AuditService } from './audit.service';

@Global()
@Module({ imports: [PrismaModule, RequestContextModule], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
