import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('api/v1')
export class HealthController {
  constructor(private configService: ConfigService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    // Basic readiness check - in later phases this will check DB and Redis
    // For PH0, we just verify config is loaded
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!databaseUrl || !redisUrl) {
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Configuration missing',
      };
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}
