import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditLog } from '@prisma/client';

/** Service responsible for writing audit log entries */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(userId: number, action: string, details?: any): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        details: details ? JSON.stringify(details) : undefined,
      },
    });
  }
}
