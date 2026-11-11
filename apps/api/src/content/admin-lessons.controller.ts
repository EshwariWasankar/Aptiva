import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { parseBody } from '../common/http/zod';
import { Roles } from '../common/guards/roles.guard';
import { ContentService } from './content.service';
import { LessonUpdateSchema, LessonUpsertSchema } from './dto';

const LessonListQuerySchema = z.object({
  topicId: z.string().uuid().optional(),
  status: z.enum(['draft', 'published']).optional(),
});

/** E-065 concept-repair lessons (PH2-T04). */
@ApiTags('admin-lessons')
@ApiBearerAuth()
@Controller('admin/lessons')
export class AdminLessonsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles('admin')
  list(@Query() query: unknown) {
    return this.content.listLessons(parseBody(LessonListQuerySchema, query));
  }

  @Post()
  @Roles('admin')
  create(@Body() body: unknown) {
    return this.content.createLesson(parseBody(LessonUpsertSchema, body));
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.content.updateLesson(id, parseBody(LessonUpdateSchema, body));
  }
}
