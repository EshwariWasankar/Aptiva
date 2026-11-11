import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module';
import { DiagnosticService } from './diagnostic.service';
import { FeedbackService } from './feedback.service';
import { DiagnosticResultJobService } from './result-job.service';
import { AttemptFeedbackController, DiagnosticsController } from './diagnostic.controller';

@Module({
  imports: [AttemptsModule],
  controllers: [DiagnosticsController, AttemptFeedbackController],
  providers: [DiagnosticService, FeedbackService, DiagnosticResultJobService],
})
export class DiagnosticModule {}
