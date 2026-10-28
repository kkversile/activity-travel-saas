import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionsGuard } from '../common/permissions.guard';
import { Permissions } from '../common/permissions.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ActivityAiCompleteImportDto, ActivityAiGenerateDto, ActivityAiPrepareImportDto, ActivityAiReviewDto, ActivityAiSaveDraftDto, ActivityAiValidateDto } from './activity-ai.dto';
import { ActivityAiService } from './activity-ai.service';
@Controller('activity-ai') @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Roles(UserRole.VENDOR) @Permissions('product.edit')
export class ActivityAiController {
  constructor(private readonly service: ActivityAiService) {}
  @Post('generate') generate(@CurrentUser() user: AuthUser, @Body() dto: ActivityAiGenerateDto) { return this.service.generate(user, dto); }
  @Post('validate') validate(@CurrentUser() user: AuthUser, @Body() dto: ActivityAiValidateDto) { return this.service.validate(user, dto); }
  @Post('prepare-import') prepare(@CurrentUser() user: AuthUser, @Body() dto: ActivityAiPrepareImportDto) { return this.service.prepare(user, dto); }
  @Post('review') review(@CurrentUser() user: AuthUser, @Body() dto: ActivityAiReviewDto) { return this.service.review(user, dto); }
  @Post('save-draft') saveDraft(@CurrentUser() user: AuthUser, @Body() dto: ActivityAiSaveDraftDto) { return this.service.saveDraft(user, dto); }
  @Post('complete-import') completeImport(@CurrentUser() user: AuthUser, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() dto: ActivityAiCompleteImportDto) { return this.service.completeImport(user, dto, idempotencyKey); }
}
