import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Injectable, type NestMiddleware } from '@nestjs/common';

/** Express request augmented with the request id assigned by the middleware. */
export interface AptivaRequest extends Request {
  requestId: string;
}

/** Assigns a request id to every request (playbook Section 10.2 cross-cutting). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AptivaRequest, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}
