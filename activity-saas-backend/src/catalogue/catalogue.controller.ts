import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Permissions } from '../common/permissions.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CatalogueService } from './catalogue.service';
import { ArchiveVariantDto, BookingQuestionDto, CreateProductDto, CreateProductRevisionDto, ProductMediaDto, ProductMediaUploadDto, ProductQueryDto, RejectProductRevisionDto, UpdateBookingQuestionDto, UpdateProductRevisionDto, UpdateVariantDto, VariantDto } from './catalogue.dto';
import { swaggerExamples } from '../common/swagger-examples';

@Controller()
@ApiTags('Catalogue')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.VENDOR)
export class CatalogueController {
  constructor(private readonly service: CatalogueService) {}
  @Get('products') @Permissions('product.view') list(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) { return this.service.list(user, query); }
  @Get('products/:id') @Permissions('product.view') get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.get(user, id); }
  @Post('products') @ApiBody({ description: 'Creates a product and its first draft revision.', schema: { type: 'object', example: swaggerExamples.catalogue.createProduct } }) @Permissions('product.edit') create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) { return this.service.create(user, dto); }
  @Post('products/:productId/revisions') @ApiBody({ description: 'Clone a published, rejected, or superseded revision. Replace the source ID with a revision ID from GET /api/products/:id.', schema: { type: 'object', example: swaggerExamples.catalogue.createRevision } }) @Permissions('product.edit') revision(@CurrentUser() user: AuthUser, @Param('productId') id: string, @Body() dto: CreateProductRevisionDto) { return this.service.createRevision(user, id, dto); }
  @Patch('product-revisions/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.updateRevision } }) @Permissions('product.edit') updateRevision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductRevisionDto) { return this.service.updateRevision(user, id, dto); }
  @Post('product-revisions/:id/submit') @Permissions('product.edit') submit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.submitRevision(user, id); }
  @Get('product-revisions/:revisionId/booking-questions') @Permissions('product.view') bookingQuestions(@CurrentUser() user: AuthUser, @Param('revisionId') id: string) { return this.service.listBookingQuestions(user, id); }
  @Post('product-revisions/:revisionId/booking-questions') @ApiBody({ schema: { type: 'object', example: { code: 'lead_phone', label: 'Lead traveller phone', type: 'TEXT', required: true, appliesPerTraveller: false, rank: 1 } } }) @Permissions('product.edit') createBookingQuestion(@CurrentUser() user: AuthUser, @Param('revisionId') id: string, @Body() dto: BookingQuestionDto) { return this.service.createBookingQuestion(user, id, dto); }
  @Patch('booking-questions/:id') @Permissions('product.edit') updateBookingQuestion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingQuestionDto) { return this.service.updateBookingQuestion(user, id, dto); }
  @Delete('booking-questions/:id') @Permissions('product.edit') archiveBookingQuestion(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.archiveBookingQuestion(user, id); }
  @Post('product-revisions/:revisionId/media') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.media } }) @Permissions('product.edit') addMedia(@CurrentUser() user: AuthUser, @Param('revisionId') id: string, @Body() dto: ProductMediaDto) { return this.service.addMedia(user, id, dto); }
  @Post('product-revisions/:revisionId/media/upload') @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['file', 'kind'], properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: ['IMAGE', 'VIDEO'], example: 'IMAGE' }, description: { type: 'string', example: 'Sunrise viewpoint at Top Station' }, seoTitle: { type: 'string', example: 'Sunrise Trek to Top Station in Munnar' }, seoDescription: { type: 'string', example: 'Guided sunrise trek and viewpoint experience in Munnar.' }, rank: { type: 'integer', example: 1 } } } }) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) @Permissions('product.edit') uploadMedia(@CurrentUser() user: AuthUser, @Param('revisionId') id: string, @UploadedFile() file: any, @Body() dto: ProductMediaUploadDto) { return this.service.uploadMedia(user, id, file, dto); }
  @Delete('product-revisions/:revisionId/media/:mediaId') @Permissions('product.edit') archiveMedia(@CurrentUser() user: AuthUser, @Param('revisionId') id: string, @Param('mediaId') mediaId: string) { return this.service.archiveMedia(user, id, mediaId); }
  @Get('products/:productId/variants') @Permissions('product.view') variants(@CurrentUser() user: AuthUser, @Param('productId') id: string) { return this.service.variants(user, id); }
  @Post('products/:productId/variants') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.variant } }) @Permissions('product.edit') createVariant(@CurrentUser() user: AuthUser, @Param('productId') id: string, @Body() dto: VariantDto) { return this.service.createVariant(user, id, dto); }
  @Patch('variants/:id') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.updateVariant } }) @Permissions('product.edit') updateVariant(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVariantDto) { return this.service.updateVariant(user, id, dto); }
  @Post('variants/:id/archive') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.archiveVariant } }) @Permissions('product.edit') archiveVariant(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArchiveVariantDto) { return this.service.archiveVariant(user, id, dto); }
  @Get('admin/product-revisions/review') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('product.view') reviewQueue() { return this.service.listReview(); }
  @Post('admin/product-revisions/:id/publish') @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('product.publish') publish(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.review(user, id, 'publish'); }
  @Post('admin/product-revisions/:id/reject') @ApiBody({ schema: { type: 'object', example: swaggerExamples.catalogue.rejectRevision } }) @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN) @Permissions('product.publish') reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectProductRevisionDto) { return this.service.review(user, id, 'reject', dto); }
}
