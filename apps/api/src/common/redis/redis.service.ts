import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env';

const PING_TIMEOUT_MS = 2_000;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: PING_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
    });
    // Connection errors surface through ping(); never crash the process here.
    this.redis.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  /** Raw client for stream/cache operations outside readiness probes. */
  get client(): Redis {
    return this.redis;
  }

  /** Readiness probe: bounded PING, resolves false instead of throwing. */
  async ping(): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('redis ping timeout')), PING_TIMEOUT_MS),
        ),
      ]);
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
