import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ContentModule } from './content/content.module';
import { ImportModule } from './import/import.module';
import { AttemptsModule } from './attempts/attempts.module';
import { DiagnosticModule } from './diagnostic/diagnostic.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './common/audit/audit.module';
import { ConfigModule } from './common/config/config.module';
import { EnvelopeInterceptor } from './common/http/envelope.interceptor';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { AuthGuard } from './common/guards/auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MailerModule } from './common/mail/mailer.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    MailerModule,
    AuthModule,
    UsersModule,
    AdminModule,
    ContentModule,
    ImportModule,
    AttemptsModule,
    DiagnosticModule,
    HealthModule,
  ],
  providers: [
    // Guard order matters: AuthGuard populates req.user before the
    // user-scoped rate limiter and role guard read it.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, cookieParser()).forRoutes('{*path}');
  }
}
