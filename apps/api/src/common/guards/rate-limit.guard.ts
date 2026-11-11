import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Bucket key scope: 'ip' (default) or 'user' (falls back to ip when anonymous). */
  key?: 'ip' | 'user';
}

export const RATE_LIMIT_KEY = 'aptiva:rateLimit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Baseline abuse limit applied to every route without a stricter @RateLimit. */
const DEFAULT_LIMIT: RateLimitOptions = { limit: 600, windowMs: 60_000, key: 'ip' };

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter (PH1-T03). Single-instance only —
 * multi-instance deployments need the Redis-backed limiter (noted for PH-12).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly buckets = new Map<string, Bucket>();
  private static lastSweep = Date.now();

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_LIMIT;
    // RATE_LIMIT_FACTOR raises every ceiling (integration tests run a fast
    // suite from one IP); unset in production → factor 1.
    const limit = Math.max(1, Math.floor(options.limit * (this.env.RATE_LIMIT_FACTOR ?? 1)));

    const req = context.switchToHttp().getRequest<Request>();
    RateLimitGuard.sweep();
    const key = `${options.key ?? 'ip'}:${this.clientKey(req, options.key ?? 'ip')}`;
    const now = Date.now();
    let bucket = RateLimitGuard.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      RateLimitGuard.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: { retryAfterSeconds: retryAfter },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private clientKey(req: Request, scope: 'ip' | 'user'): string {
    if (scope === 'user') {
      const user = (req as Request & { user?: { id?: string } }).user;
      if (user?.id) return `u:${user.id}`;
    }
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  private static sweep(): void {
    const now = Date.now();
    if (now - RateLimitGuard.lastSweep < 60_000) return;
    RateLimitGuard.lastSweep = now;
    for (const [key, bucket] of RateLimitGuard.buckets) {
      if (bucket.resetAt <= now) RateLimitGuard.buckets.delete(key);
    }
  }
}
