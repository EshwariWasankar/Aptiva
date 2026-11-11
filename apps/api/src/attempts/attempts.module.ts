import { Module } from '@nestjs/common';
import { AttemptStreamService } from './attempt-stream.service';
import { AttemptsService } from './attempts.service';
import { RecalcService } from './recalc.service';
import { SessionsController } from './sessions.controller';

@Module({
  controllers: [SessionsController],
  providers: [AttemptsService, AttemptStreamService, RecalcService],
  exports: [AttemptsService, AttemptStreamService, RecalcService],
})
export class AttemptsModule {}
