import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

export const RECALC_QUEUE = 'aptiva-recalc';

export interface RecalcJobData {
  sessionId: string;
  userId: string;
}

/**
 * PH4-T06 — finish/submit returns 202 and enqueues a recalculation job.
 * PH-4 ships a placeholder processor: practice sessions have no profile
 * math yet (PH-6), so the job verifies the session's attempts are fully
 * persisted and marks recalc_status = 'done'. It is idempotent — the
 * real recalculation (PH-5/6) is a pure function of persisted attempts.
 *
 * If Redis is unreachable at boot the queue/worker are skipped; the API
 * keeps serving (NFR-004) and enqueueRecalc throws so callers can log.
 */
@Injectable()
export class RecalcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecalcService.name);
  private queue: Queue<RecalcJobData> | null = null;
  private worker: Worker<RecalcJobData> | null = null;
  private connection: Redis | null = null;
  private available = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.redis.ping())) {
      this.logger.warn('Redis unreachable at boot — recalc queue disabled until restart');
      return;
    }
    await this.startWorkers();
  }

  private async startWorkers(): Promise<void> {
    // BullMQ requires an unrestricted connection (blocking commands).
    this.connection = new Redis(this.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    const connection = this.connection;
    this.queue = new Queue<RecalcJobData>(RECALC_QUEUE, { connection });
    this.worker = new Worker<RecalcJobData>(
      RECALC_QUEUE,
      async (job) => {
        const { sessionId } = job.data;
        const attempts = await this.prisma.questionAttempt.count({
          where: { contextType: 'practice', contextId: sessionId },
        });
        await this.prisma.practiceSession.updateMany({
          where: { id: sessionId, recalcStatus: 'pending' },
          data: { recalcStatus: 'done' },
        });
        this.logger.log(`recalc placeholder done session=${sessionId} attempts=${attempts}`);
      },
      { connection, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`recalc job ${job?.id} failed: ${err.message}`);
    });
    this.available = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueRecalc(data: RecalcJobData): Promise<void> {
    if (!this.available) {
      if (!(await this.redis.ping())) {
        throw new Error('recalc queue unavailable: Redis unreachable');
      }
      await this.startWorkers();
    }
    await this.queue!.add('session-recalc', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
  }
}
