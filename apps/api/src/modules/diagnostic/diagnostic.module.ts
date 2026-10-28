import { Module } from '@nestjs/common';
import { DiagnosticService } from './diagnostic.service';
import { DiagnosticController } from './diagnostic.controller';
import { PrismaService } from '../../prisma.service';

@Module({
  providers: [DiagnosticService, PrismaService],
  controllers: [DiagnosticController],
})
export class DiagnosticModule {}
