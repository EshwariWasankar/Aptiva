import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/guards/auth.guard';
import { Roles } from '../common/guards/roles.guard';
import { parseBody } from '../common/http/zod';
import { DiagnosticService } from './diagnostic.service';
import { FeedbackService } from './feedback.service';
import {
  AttemptSubmitSchema,
  DiagnosticCreateSchema,
  DiagnosticSubmitSchema,
  ErrorFeedbackSchema,
} from './dto';

/**
 * PH-5 diagnostic endpoints (E-010..E-016) + P-09 review data and the
 * error-type catalogue. Student-only; ownership enforced per row.
 */
@ApiTags('diagnostics')
@ApiBearerAuth()
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticService) {}

  @Post()
  @Roles('student')
  create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.diagnostics.createDiagnostic(user.id, parseBody(DiagnosticCreateSchema, body));
  }

  @Get('active')
  @Roles('student')
  active(@CurrentUser() user: AuthUser) {
    return this.diagnostics.getActive(user.id);
  }

  @Get('error-types')
  @Roles('student')
  errorTypes() {
    return this.diagnostics.errorTypes();
  }

  @Get(':id/next')
  @Roles('student')
  next(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.nextQuestion(user.id, id);
  }

  @Put(':id/answers/:questionId')
  @Roles('student')
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.diagnostics.submitAnswer(
      user.id,
      id,
      questionId,
      parseBody(AttemptSubmitSchema, body),
    );
  }

  @Post(':id/pause')
  @Roles('student')
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.pause(user.id, id);
  }

  @Post(':id/submit')
  @Roles('student')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.diagnostics.submit(user.id, id, parseBody(DiagnosticSubmitSchema, body ?? {}));
  }

  @Get(':id/result')
  @Roles('student')
  result(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.getResult(user.id, id);
  }

  @Get(':id/review')
  @Roles('student')
  review(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.diagnostics.getReviewItems(user.id, id);
  }
}

/** E-016 — attempt error feedback (separate controller: /attempts path). */
@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class AttemptFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Put(':attemptId/error-feedback')
  @Roles('student')
  submit(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    return this.feedback.submitFeedback(user.id, attemptId, parseBody(ErrorFeedbackSchema, body));
  }
}
