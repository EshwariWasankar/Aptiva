import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  details?: Record<string, unknown>;
}

/**
 * Audit-log writer (PH1-T04). Writes to audit_log; never throws into the
 * request path — audit failures are logged, not fatal.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          objectType: entry.objectType ?? null,
          objectId: entry.objectId ?? null,
          ...(entry.details !== undefined
            ? { details: entry.details as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (err) {
      this.logger.warn(`audit write failed for ${entry.action}: ${String(err)}`);
    }
  }
}
