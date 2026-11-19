import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health/health.service';

@Controller()
@ApiTags('App')
export class AppController {
  constructor(private readonly healthService: HealthService) {}
  @Get('health')
  @Header('Cache-Control', 'no-store')
  async health() {
    const report = await this.healthService.readiness();
    if (report.status !== 'ok') throw new ServiceUnavailableException(report);
    return report;
  }
  @Get('health/ready')
  @Header('Cache-Control', 'no-store')
  ready() { return this.health(); }
  @Get('health/live')
  @Header('Cache-Control', 'no-store')
  live() { return { status: 'ok', service: 'voya-api', timestamp: new Date().toISOString() }; }
}
