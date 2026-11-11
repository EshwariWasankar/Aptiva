import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/guards/roles.guard';
import { ContentService } from './content.service';

/** Supporting endpoint: taxonomy tree for admin pickers (P-20/P-21/P-23). */
@ApiTags('admin-taxonomy')
@ApiBearerAuth()
@Controller('admin/taxonomy')
export class AdminTaxonomyController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles('admin', 'reviewer')
  list() {
    return this.content.listTopics();
  }
}
