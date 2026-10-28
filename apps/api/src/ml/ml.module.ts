// apps/api/src/ml/ml.module.ts
import { Module } from '@nestjs/common';
import { MlService } from './ml.service';
import { MlController } from './ml.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MlService, PrismaService],
  controllers: [MlController],
  exports: [MlService],
})
export class MlModule {}
