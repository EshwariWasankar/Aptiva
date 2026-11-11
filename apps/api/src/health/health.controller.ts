import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { Public } from '../common/guards/auth.guard';

/**
 * E-080 health endpoints (playbook Section 11.2).
 * /health is a pure liveness check; /ready verifies PostgreSQL and Redis.
 */
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{
    status: 'ok';
    checks: { postgres: 'up' | 'down'; redis: 'up' | 'down' };
  }> {
    const [postgres, redis] = await Promise.all([
      this.prisma.ping().then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.redis.ping().then((ok) => (ok ? ('up' as const) : ('down' as const))),
    ]);

    if (postgres === 'down' || redis === 'down') {
      const failed = [
        ...(postgres === 'down' ? ['postgres'] : []),
        ...(redis === 'down' ? ['redis'] : []),
      ];
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        details: { failed },
      });
    }

    return { status: 'ok', checks: { postgres, redis } };
  }
}
