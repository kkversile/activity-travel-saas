import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { UpdateVendorDto } from './update-vendor.dto';
import { VendorService } from './vendor.service';

@Controller('vendor')
@ApiTags('Vendor')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get('profile')
  @Permissions('vendor.profile.view')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user);
  }

  @Patch('profile')
  @ApiBody({ schema: { type: 'object', example: { legalBusinessName: 'Blue Mountain Adventures Pvt. Ltd.', operatingCity: 'Munnar', operatingRegion: 'Kerala', gstin: '32AACCB1234F1Z5', category: 'Trekking, Nature & Wildlife', payoutAccountMasked: 'HDFC •••• 4821', payoutAccountHolder: 'Blue Mountain Adventures Pvt. Ltd.', payoutBankName: 'HDFC Bank', payoutBranch: 'Munnar', payoutIfsc: 'HDFC0001234', payoutCurrency: 'INR', payoutAccountType: 'CURRENT' } } })
  @Permissions('vendor.profile.edit')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateVendorDto) {
    return this.service.updateProfile(user, dto);
  }

  @Post('documents/:key')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'PDF, JPEG, or PNG document' } } } })
  @Permissions('document.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_request, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) }))
  uploadDocument(@CurrentUser() user: AuthUser, @Param('key') key: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    return this.service.uploadDocument(user, key, file);
  }
}
