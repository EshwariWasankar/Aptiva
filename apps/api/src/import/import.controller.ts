import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/guards/auth.guard';
import { parseBody } from '../common/http/zod';
import { Roles } from '../common/guards/roles.guard';
import {
  BlueprintDraftSchema,
  CompanyImportSchema,
  ImportRunSchema,
  PatternMapSchema,
} from './dto';
import { CompanyService } from './company.service';
import { ImportService } from './import.service';

/**
 * PH-3 admin import APIs.
 * E-062 POST /admin/import — question sources (dry-run or real).
 * E-063 GET/DELETE /admin/import-batches — list and reverse.
 * E-067 POST /admin/company-imports — DS-07 records / DS-08 coverage.
 * E-068 GET /admin/company-patterns — review queue.
 * E-069 POST /admin/company-patterns/:id/map — map/reject + synonyms.
 * Plus PH3-T06 coverage report and PH3-T10/T11 draft + fit endpoints.
 */
@ApiTags('admin-import')
@ApiBearerAuth()
@Controller('admin')
export class ImportController {
  constructor(
    private readonly imports: ImportService,
    private readonly companies: CompanyService,
  ) {}

  @Post('import')
  @Roles('admin')
  runImport(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.imports.runImport(parseBody(ImportRunSchema, body), user.id);
  }

  @Get('import-batches')
  @Roles('admin')
  listBatches() {
    return this.imports.listBatches();
  }

  @Delete('import-batches/:id')
  @Roles('admin')
  @HttpCode(204)
  async reverseBatch(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.imports.reverseBatch(id, user.id);
  }

  @Get('coverage')
  @Roles('admin', 'reviewer')
  coverage() {
    return this.imports.coverageReport();
  }

  @Post('company-imports')
  @Roles('admin')
  runCompanyImport(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.companies.runCompanyImport(parseBody(CompanyImportSchema, body), user.id);
  }

  @Get('company-patterns')
  @Roles('admin', 'reviewer')
  listPatterns(
    @Query('company') company?: string,
    @Query('status') status?: string,
    @Query('unmapped') unmapped?: string,
  ) {
    return this.companies.listPatterns({
      ...(company ? { company } : {}),
      ...(status ? { status } : {}),
      ...(unmapped === 'true' ? { unmapped: true } : {}),
    });
  }

  @Post('company-patterns/:id/map')
  @Roles('admin')
  mapPattern(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.companies.mapPattern(id, parseBody(PatternMapSchema, body), user.id);
  }

  @Post('blueprints/draft-from-records')
  @Roles('admin')
  draftBlueprint(@Body() body: unknown) {
    return this.companies.draftBlueprint(parseBody(BlueprintDraftSchema, body));
  }

  @Post('blueprints/:id/fit-tags')
  @Roles('admin')
  fitTags(@Param('id') id: string) {
    return this.companies.recomputeFitTags(id);
  }
}
