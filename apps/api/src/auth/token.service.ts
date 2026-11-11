import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, type Env } from '../common/config/env';
import type { AuthUser } from '../common/guards/auth.guard';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  email: string;
}

/** Issues and verifies short-lived JWT access tokens (Section 2.3). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  signAccessToken(user: { id: string; role: string; email: string }): string {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, email: user.email };
    return this.jwt.sign(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
    });
  }

  toAuthUser(payload: AccessTokenPayload): AuthUser {
    return { id: payload.sub, role: payload.role, email: payload.email };
  }
}
