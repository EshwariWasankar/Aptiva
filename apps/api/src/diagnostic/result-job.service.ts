import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../common/config/env';
import { RedisService } from '../common/redis/redis.service';
import { DiagnosticService } from './diagnostic.service';

export const DIAGNOSTIC_RESULT_QUEUE = 'aptiva-diagnostic-results';

/**
 * PH5: result computation runs after the flush barrier on a dedicated
 * BullMQ queue. Idempotent by diagnostic id (computeResult upserts).
 */
@Injectable()
export class DiagnosticResultJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiagnosticResultJobService.name);
  private queue: Queue<{ diagnosticId: string; userId: string }> | null = null;
  private worker: Worker<{ diagnosticId: string; userId: string }> | null = null;
  private connection: Redis | null = null;
  private available = false;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.redis.ping())) {
      this.logger.warn('Redis unreachable at boot — diagnostic result queue disabled');
      return;
    }
    this.connection = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    const connection = this.connection;
    this.queue = new Queue(DIAGNOSTIC_RESULT_QUEUE, { connection });
    this.worker = new Worker(
      DIAGNOSTIC_RESULT_QUEUE,
      async (job) => {
        // Resolved lazily: DiagnosticService depends on this service for
        // enqueue(), so a constructor injection would be circular.
        const diagnostics = this.moduleRef.get(DiagnosticService, { strict: false });
        await diagnostics.computeResult(job.data.diagnosticId);
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`diagnostic result job ${job?.id} failed: ${err.message}`);
    });
    this.available = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(diagnosticId: string, userId: string): Promise<void> {
    if (!this.available) throw new Error('diagnostic result queue unavailable');
    await this.queue!.add(
      'compute-result',
      { diagnosticId, userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }
}
