import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/guards/auth.guard';
import { parseBody } from '../common/http/zod';
import { Roles } from '../common/guards/roles.guard';
import { ContentService } from './content.service';
import { QuestionListQuerySchema, QuestionReviewSchema, QuestionUpsertSchema } from './dto';

/**
 * E-060 question CRUD and E-061 review workflow (PH2-T04).
 * Admins manage; reviewers can read and submit review decisions.
 */
@ApiTags('admin-questions')
@ApiBearerAuth()
@Controller('admin/questions')
export class AdminQuestionsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles('admin', 'reviewer')
  list(@Query() query: unknown) {
    return this.content.listQuestions(parseBody(QuestionListQuerySchema, query));
  }

  @Post()
  @Roles('admin')
  create(@Body() body: unknown) {
    return this.content.createQuestion(parseBody(QuestionUpsertSchema, body));
  }

  @Get(':id')
  @Roles('admin', 'reviewer')
  get(@Param('id') id: string) {
    return this.content.getQuestion(id);
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.content.updateQuestion(id, parseBody(QuestionUpsertSchema, body));
  }

  // E-061 — approve/reject; unique per reviewer (409 on repeat).
  @Post(':id/review')
  @HttpCode(200)
  @Roles('admin', 'reviewer')
  review(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.content.reviewQuestion(id, user.id, parseBody(QuestionReviewSchema, body));
  }
}
