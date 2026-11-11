import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../common/config/env';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma/prisma.service';

export interface AttemptEvent {
  attemptId: string;
  userId: string;
  questionId: string;
  contextType: 'diagnostic' | 'practice' | 'reassessment';
  contextId: string;
  shownAt: string; // ISO
  answeredAt: string; // ISO
  timeMs: number | null;
  selectedOptionId: string | null;
  numericInput: string | null;
  roundingSuspected: boolean;
  isCorrect: boolean | null;
  skipped: boolean;
  sequenceNo: number;
  revisitCount: number;
  answerChanges: number;
}

interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

const CLAIM_INTERVAL_MS = 5_000;
// idle threshold comes from env (ATTEMPT_MIN_IDLE_MS, default 30s)
const MAX_DELIVERIES = 5;

/**
 * Redis Stream attempt pipeline (playbook 15.2, PH4-T03/T04).
 * Producer appends events; a consumer group batches them into
 * question_attempts with ON CONFLICT (id) DO NOTHING. Pending entries
 * are reclaimed via XAUTOCLAIM; after MAX_DELIVERIES failures the event
 * moves to the dead-letter stream.
 */
@Injectable()
export class AttemptStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptStreamService.name);
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private claimTimer: NodeJS.Timeout | null = null;
  /**
   * Dedicated connection for the blocking consumer. The shared client
   * must stay responsive for producer/cache commands — a BLOCKING
   * XREADGROUP on it would serialize every other Redis op behind the
   * block window (observed: ~1-2 s per command, NFR-003 violation).
   */
  private consumerRedis: Redis | null = null;
  private readonly consumerName = `consumer-${process.pid}-${Date.now().toString(36)}`;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get stream(): string {
    return this.env.ATTEMPT_STREAM;
  }
  get group(): string {
    return this.env.ATTEMPT_GROUP;
  }
  get deadLetter(): string {
    return this.env.ATTEMPT_DEADLETTER_STREAM;
  }

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test' || this.env.ATTEMPT_CONSUMER_ENABLED !== 'true') return;
    await this.ensureGroup();
    this.consumerRedis = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.running = true;
    this.loopPromise = this.readLoop();
    this.claimTimer = setInterval(() => void this.reclaimPending(), CLAIM_INTERVAL_MS);
    this.claimTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.claimTimer) clearInterval(this.claimTimer);
    await this.loopPromise?.catch(() => undefined);
    await this.consumerRedis?.quit().catch(() => this.consumerRedis?.disconnect());
    this.consumerRedis = null;
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.client.xgroup('CREATE', this.stream, this.group, '$', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP = already exists — fine.
      if (!String(err).includes('BUSYGROUP')) throw err;
    }
  }

  /** Producer: append one attempt event. Throws when Redis is down. */
  async append(event: AttemptEvent): Promise<string> {
    const id = await this.redis.client.xadd(this.stream, '*', 'payload', JSON.stringify(event));
    return id ?? '';
  }

  /** Blocking consumer loop — batches up to STREAM_BATCH_MAX or STREAM_BATCH_MS. */
  private async readLoop(): Promise<void> {
    while (this.running) {
      try {
        const conn = this.consumerRedis ?? this.redis.client;
        const res = (await conn.xreadgroup(
          'GROUP',
          this.group,
          this.consumerName,
          'COUNT',
          this.env.STREAM_BATCH_MAX,
          'BLOCK',
          this.env.STREAM_BATCH_MS,
          'STREAMS',
          this.stream,
          '>',
        )) as unknown as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          await this.ingest(entries.map(([id, fields]) => ({ id, fields: fieldsToMap(fields) })));
        }
      } catch (err) {
        if (!this.running) break;
        this.logger.warn(`stream read failed: ${String(err).slice(0, 200)}`);
        await sleep(1_000);
      }
    }
  }

  /** Reclaim pending entries idle > MIN_IDLE_MS; dead-letter after MAX_DELIVERIES. */
  async reclaimPending(): Promise<void> {
    try {
      const conn = this.consumerRedis ?? this.redis.client;
      const res = (await conn.xautoclaim(
        this.stream,
        this.group,
        this.consumerName,
        this.env.ATTEMPT_MIN_IDLE_MS,
        '0',
        'COUNT',
        this.env.STREAM_BATCH_MAX,
      )) as unknown as [string, [string, string[]][], string[]];
      const [, entries, deleted] = res;
      for (const id of deleted) await conn.xack(this.stream, this.group, id);
      if (entries.length === 0) return;
      const toDead: string[] = [];
      const toIngest: StreamEntry[] = [];
      for (const [id, fields] of entries) {
        // deliveries counter isn't returned by XAUTOCLAIM on all versions;
        // approximate via XPENDING per-id check is costly — use claim count
        // tracked in a local map keyed by entry id.
        const n = (this.deliveryCounts.get(id) ?? 0) + 1;
        this.deliveryCounts.set(id, n);
        if (n > MAX_DELIVERIES) toDead.push(id);
        else toIngest.push({ id, fields: fieldsToMap(fields) });
      }
      if (toIngest.length) await this.ingest(toIngest);
      for (const id of toDead) {
        const entry = entries.find(([eid]) => eid === id);
        if (entry) {
          await conn.xadd(
            this.deadLetter,
            '*',
            'payload',
            entry[1].join(' '),
            'reason',
            'max-deliveries',
          );
        }
        await this.redis.client.xack(this.stream, this.group, id);
        this.deliveryCounts.delete(id);
        this.logger.error(`attempt event ${id} moved to dead-letter stream`);
      }
    } catch (err) {
      this.logger.warn(`reclaim failed: ${String(err).slice(0, 200)}`);
    }
  }

  private readonly deliveryCounts = new Map<string, number>();

  /** One non-blocking read pass — used by the flush barrier and tests. */
  async processAvailable(): Promise<number> {
    const res = (await this.redis.client.xreadgroup(
      'GROUP',
      this.group,
      this.consumerName,
      'COUNT',
      this.env.STREAM_BATCH_MAX,
      'STREAMS',
      this.stream,
      '>',
    )) as unknown as [string, [string, string[]][]][] | null;
    if (!res) return 0;
    let n = 0;
    for (const [, entries] of res) {
      n += entries.length;
      await this.ingest(entries.map(([id, fields]) => ({ id, fields: fieldsToMap(fields) })));
    }
    return n;
  }

  /** Insert a batch of stream entries; ack only on success. */
  async ingest(entries: StreamEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const rows = entries.map((e) => {
      const p = JSON.parse(e.fields['payload'] ?? '{}') as AttemptEvent;
      return {
        id: p.attemptId,
        userId: p.userId,
        questionId: p.questionId,
        contextType: p.contextType,
        contextId: p.contextId,
        shownAt: new Date(p.shownAt),
        answeredAt: new Date(p.answeredAt),
        timeMs: p.timeMs,
        selectedOptionId: p.selectedOptionId,
        numericInput: p.numericInput,
        roundingSuspected: p.roundingSuspected,
        isCorrect: p.isCorrect,
        skipped: p.skipped,
        sequenceNo: p.sequenceNo,
        revisitCount: p.revisitCount,
        answerChanges: p.answerChanges,
      };
    });
    // ON CONFLICT (id) DO NOTHING — idempotent replays are safe.
    await this.prisma.questionAttempt.createMany({ data: rows, skipDuplicates: true });
    await this.redis.client.xack(this.stream, this.group, ...entries.map((e) => e.id));
    for (const e of entries) this.deliveryCounts.delete(e.id);
  }

  /** Pending (delivered-but-unacked) entry count for the group. */
  async pendingCount(): Promise<number> {
    const res = (await this.redis.client.xpending(this.stream, this.group)) as unknown as
      [number, string, string, [string, number, number][]] | number;
    return Array.isArray(res) ? Number(res[0]) : Number(res);
  }

  /** Attempt ids currently pending in the stream (barrier comparison). */
  async pendingAttemptIds(): Promise<Set<string>> {
    const res = (await this.redis.client.xpending(
      this.stream,
      this.group,
      '-',
      '+',
      1000,
    )) as unknown as [string, string, string, number][];
    const ids = new Set<string>();
    // XPENDING extended doesn't return payloads; fetch fields per id.
    for (const [id] of res) {
      const range = (await this.redis.client.xrange(this.stream, id, id)) as unknown as [
        string,
        string[],
      ][];
      const f = range[0]?.[1];
      if (f) {
        const m = fieldsToMap(f);
        try {
          ids.add((JSON.parse(m['payload'] ?? '{}') as AttemptEvent).attemptId);
        } catch {
          /* ignore */
        }
      }
    }
    return ids;
  }
}

function fieldsToMap(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) out[fields[i]!] = fields[i + 1]!;
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
