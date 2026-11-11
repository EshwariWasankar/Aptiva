import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AptivaRequest } from './request-id.middleware';

/** Wraps successful responses in the { data, meta } envelope (Section 11.1). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AptivaRequest>();
    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        meta: { requestId: req.requestId ?? 'unknown' },
      })),
    );
  }
}
