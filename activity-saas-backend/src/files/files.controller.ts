import { Controller, Get, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth.types';
import { FilesService } from './files.service';

@Controller('files')
@ApiTags('Files')
export class FilesController {
  constructor(private readonly service: FilesService) {}
  @Get('public/:id/content')
  async publicContent(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const { asset, buffer } = await this.service.content(undefined, id, true);
    response.setHeader('Content-Disposition', `inline; filename="${asset.originalName.replace(/"/g, '')}"`);
    return new StreamableFile(buffer, { type: asset.mimeType });
  }
  @Get(':id/content')
  @UseGuards(JwtAuthGuard)
  async privateContent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const { asset, buffer } = await this.service.content(user, id);
    response.setHeader('Content-Disposition', `inline; filename="${asset.originalName.replace(/"/g, '')}"`);
    return new StreamableFile(buffer, { type: asset.mimeType });
  }
}
