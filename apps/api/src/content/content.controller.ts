import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/guards/auth.guard';
import { ContentService } from './content.service';

/** E-055 / E-056 — public blueprint catalogue (no auth required). */
@ApiTags('assessments')
@Controller('assessments')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get()
  list() {
    return this.content.listPublicAssessments();
  }

  @Public()
  @Get(':slug/blueprint')
  blueprint(@Param('slug') slug: string) {
    return this.content.getPublicBlueprint(slug);
  }
}
