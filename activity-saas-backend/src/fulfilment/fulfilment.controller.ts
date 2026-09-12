import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FulfilmentEvidenceKind, UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CompleteBookingDto, EvidenceReplaceDto, EvidenceUploadDto, FulfilmentQueryDto, ReferenceEvidenceDto, VoucherShareDto } from './fulfilment.dto';
import { FulfilmentService } from './fulfilment.service';

const uploadOptions = { limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req: any, file: any, cb: (error: Error | null, acceptFile: boolean) => void) => cb(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) };

@Controller('vendor/fulfilment') @ApiTags('Vendor Fulfilment') @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Roles(UserRole.VENDOR)
export class VendorFulfilmentController {
  constructor(private readonly service: FulfilmentService) {}
  @Get() @Permissions('fulfilment.view.vendor') list(@CurrentUser() user: AuthUser, @Query() query: FulfilmentQueryDto) { return this.service.vendorList(user, query); }
  @Get(':bookingId') @Permissions('fulfilment.view.vendor') detail(@CurrentUser() user: AuthUser, @Param('bookingId') id: string) { return this.service.vendorDetail(user, id); }
  @Post(':bookingId/evidence/pnr') @Permissions('fulfilment.edit.vendor') pnr(@CurrentUser() user: AuthUser, @Param('bookingId') id: string, @Body() dto: ReferenceEvidenceDto) { return this.service.addReference(user, id, FulfilmentEvidenceKind.PNR_REFERENCE, dto); }
  @Post(':bookingId/evidence/qr-token') @Permissions('fulfilment.edit.vendor') qr(@CurrentUser() user: AuthUser, @Param('bookingId') id: string, @Body() dto: ReferenceEvidenceDto) { return this.service.addReference(user, id, FulfilmentEvidenceKind.QR_TOKEN, dto); }
  @Post(':bookingId/evidence/ticket') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('file', uploadOptions)) @Permissions('fulfilment.edit.vendor') ticket(@CurrentUser() user: AuthUser, @Param('bookingId') id: string, @UploadedFile() file: any, @Body() dto: EvidenceUploadDto) { return this.service.upload(user, id, FulfilmentEvidenceKind.TICKET_FILE, file, dto); }
  @Post(':bookingId/evidence/attachment') @ApiConsumes('multipart/form-data') @UseInterceptors(FileInterceptor('file', uploadOptions)) @Permissions('fulfilment.edit.vendor') attachment(@CurrentUser() user: AuthUser, @Param('bookingId') id: string, @UploadedFile() file: any, @Body() dto: EvidenceUploadDto) { return this.service.upload(user, id, FulfilmentEvidenceKind.SUPPLIER_ATTACHMENT, file, dto); }
  @Post('evidence/:id/replace') @Permissions('fulfilment.edit.vendor') replace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EvidenceReplaceDto) { return this.service.replaceReference(user, id, dto); }
  @Post(':bookingId/voucher/retry') @Permissions('fulfilment.edit.vendor') retry(@CurrentUser() user: AuthUser, @Param('bookingId') id: string) { return this.service.retryVendor(user, id); }
  @Get(':bookingId/voucher') @Permissions('fulfilment.view.vendor') voucher(@CurrentUser() user: AuthUser, @Param('bookingId') id: string) { return this.service.voucher(user, id); }
}

@Controller('agent/bookings') @ApiTags('Agent Vouchers') @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Roles(UserRole.TRAVEL_AGENT)
export class AgentVoucherController {
  constructor(private readonly service: FulfilmentService) {}
  @Get(':bookingId/voucher') @Permissions('fulfilment.view.agent') voucher(@CurrentUser() user: AuthUser, @Param('bookingId') id: string) { return this.service.voucher(user, id); }
  @Post(':bookingId/voucher/share') @Permissions('voucher.share') share(@CurrentUser() user: AuthUser, @Param('bookingId') id: string, @Body() dto: VoucherShareDto) { return this.service.share(user, id, dto); }
}

@Controller('admin/fulfilment') @ApiTags('Admin Fulfilment') @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
export class AdminFulfilmentController {
  constructor(private readonly service: FulfilmentService) {}
  @Get() @Permissions('fulfilment.view.admin') list(@Query() query: FulfilmentQueryDto) { return this.service.adminList(query); }
  @Get(':bookingId') @Permissions('fulfilment.view.admin') detail(@Param('bookingId') id: string) { return this.service.adminDetail(id); }
  @Post(':bookingId/voucher/retry') @Permissions('fulfilment.retry.admin') retry(@CurrentUser() user: AuthUser, @Param('bookingId') id: string) { return this.service.retryAdmin(user, id); }
}

@Controller('vendor/manifest') @ApiTags('Vendor Manifest') @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Roles(UserRole.VENDOR)
export class ManifestController {
  constructor(private readonly service: FulfilmentService) {}
  @Get() @Permissions('manifest.view') manifest(@CurrentUser() user: AuthUser, @Query('serviceDate') serviceDate: string, @Query() filters: any) { if (!serviceDate) throw new BadRequestException('serviceDate is required'); return this.service.manifest(user, serviceDate, filters); }
  @Get('export.csv') @Permissions('manifest.view') async csv(@CurrentUser() user: AuthUser, @Query('serviceDate') serviceDate: string, @Query() filters: any, @Res() response: Response) { if (!serviceDate) throw new BadRequestException('serviceDate is required'); response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="manifest-${serviceDate}.csv"`); response.send(await this.service.manifestCsv(user, serviceDate, filters)); }
  @Post('bookings/:id/check-in') @Permissions('manifest.checkin') checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Headers('x-check-in-note') note?: string) { return this.service.checkIn(user, id, note); }
  @Post('bookings/:id/complete') @Permissions('manifest.checkin') complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteBookingDto) { return this.service.complete(user, id, dto); }
}
