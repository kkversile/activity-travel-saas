import { Module } from '@nestjs/common';
import { VendorOutletsModule } from '../vendor-outlets/vendor-outlets.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({ imports: [VendorOutletsModule, AuthModule, StorageModule], controllers: [FilesController], providers: [FilesService] })
export class FilesModule {}
