import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { parseBody } from '../common/http/zod';
import { Roles } from '../common/guards/roles.guard';
import { ContentService } from './content.service';
import { BlueprintBodySchema, BlueprintCreateSchema } from './dto';

/**
 * E-064 blueprint CRUD with versioning and per-field provenance
 * (PH2-T04/T07). PUT creates a new immutable version.
 */
@ApiTags('admin-blueprints')
@ApiBearerAuth()
@Controller('admin/blueprints')
export class AdminBlueprintsController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.content.listBlueprints();
  }

  @Post()
  @Roles('admin')
  create(@Body() body: unknown) {
    return this.content.createBlueprint(parseBody(BlueprintCreateSchema, body));
  }

  @Get(':id')
  @Roles('admin')
  detail(@Param('id') id: string) {
    return this.content.getBlueprintDetail(id);
  }

  @Put(':id')
  @Roles('admin')
  addVersion(@Param('id') id: string, @Body() body: unknown) {
    return this.content.addBlueprintVersion(id, parseBody(BlueprintBodySchema, body));
  }
}
