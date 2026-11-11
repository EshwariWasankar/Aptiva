import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorCode } from '@aptiva/shared';
import type { AptivaRequest } from './request-id.middleware';

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Global exception filter producing the error envelope (Section 11.1).
 * Unexpected errors are logged server-side and returned as a generic
 * INTERNAL error — details and stacks never reach the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AptivaRequest>();
    const requestId = req.requestId ?? 'unknown';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code =
        typeof payload.code === 'string'
          ? (payload.code as ApiErrorCode)
          : (STATUS_TO_CODE[status] ?? 'INTERNAL');
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : exception.message || 'Request failed';
      res.status(status).json({
        error: {
          code,
          message,
          ...(payload.details !== undefined ? { details: payload.details } : {}),
          requestId,
        },
      });
      return;
    }

    this.logger.error(
      `Unhandled exception on ${req.method} ${req.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error',
        requestId,
      },
    });
  }
}
