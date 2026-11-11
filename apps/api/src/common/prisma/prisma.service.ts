import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Readiness probe: confirms the database accepts queries. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
