import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendorToolsController } from './vendor-tools.controller';
import { VendorToolsService } from './vendor-tools.service';

@Module({ imports: [AuthModule], controllers: [VendorToolsController], providers: [VendorToolsService] })
export class VendorToolsModule {}
