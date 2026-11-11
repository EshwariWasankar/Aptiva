import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { CompanyService } from './company.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [ContentModule],
  controllers: [ImportController],
  providers: [ImportService, CompanyService],
})
export class ImportModule {}
