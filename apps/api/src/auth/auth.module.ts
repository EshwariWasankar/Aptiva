import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret', signOptions: { expiresIn: '7d' } })],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
