import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('App')
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'voya-api', timestamp: new Date().toISOString() };
  }

}
