import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ActivityMediaDto, ActivityMediaUploadDto, ActivityQueryDto, CreateActivityDto, UpdateActivityDto } from './activity.dto';
import { ActivitiesService } from './activities.service';

@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUB_ADMIN)
export class ActivitiesController {
  constructor(private readonly service: ActivitiesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ActivityQueryDto) { return this.service.list(user, query); }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.get(user, id); }

  @Post()
  @Roles(UserRole.VENDOR)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateActivityDto) { return this.service.create(user, dto); }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateActivityDto) { return this.service.update(user, id, dto); }

  @Post(':id/media')
  addMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ActivityMediaDto) { return this.service.addMedia(user, id, dto); }

  @Post(':id/media/upload')
  uploadMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ActivityMediaUploadDto) { return this.service.uploadMedia(user, id, dto); }

  @Delete(':id/media/:mediaId')
  removeMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('mediaId') mediaId: string) { return this.service.removeMedia(user, id, mediaId); }

  @Post(':id/submit')
  @Roles(UserRole.VENDOR)
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.submit(user, id); }

  @Post(':id/publish')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUB_ADMIN)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.publish(user, id); }
}
