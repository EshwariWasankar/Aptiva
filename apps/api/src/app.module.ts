import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { HealthModule } from './common/health/health.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MlModule } from './ml/ml.module';

@Module({
  imports: [
    AppConfigModule,
    HealthModule,
    MonitoringModule,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
