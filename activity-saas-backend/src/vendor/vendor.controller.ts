import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateVendorDto } from './update-vendor.dto';
import { VendorService } from './vendor.service';

@Controller('vendor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.service.getProfile(user);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateVendorDto) {
    return this.service.updateProfile(user, dto);
  }

  @Post('documents/:key')
  uploadDocument(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() body: { fileName?: string; dataUrl?: string }) {
    return this.service.uploadDocument(user, key, body.fileName || 'uploaded-document', body.dataUrl);
  }
}
