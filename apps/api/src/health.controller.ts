import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/health')
  health() {
    return {
      ok: true,
      service: 'kubolesie-api',
      version: '0.0.1',
      env: process.env.NODE_ENV ?? 'development',
    };
  }

  @Get('/v1/health')
  healthV1() {
    return this.health();
  }
}
