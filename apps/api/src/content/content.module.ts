import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminQuestionsController } from './admin-questions.controller';
import { AdminBlueprintsController } from './admin-blueprints.controller';
import { AdminLessonsController } from './admin-lessons.controller';
import { AdminTaxonomyController } from './admin-taxonomy.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [
    ContentController,
    AdminQuestionsController,
    AdminBlueprintsController,
    AdminLessonsController,
    AdminTaxonomyController,
  ],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
