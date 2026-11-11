import { describe, expect, it } from 'vitest';
import { TokenService } from '../../src/auth/token.service';
import { JwtService } from '@nestjs/jwt';

const env = {
  JWT_ACCESS_SECRET: 'test-secret-at-least-16-chars',
  JWT_ACCESS_TTL_SECONDS: 900,
} as never;

const service = new TokenService(new JwtService(), env);

describe('TokenService', () => {
  it('signs and verifies an access token round-trip', () => {
    const token = service.signAccessToken({ id: 'u1', role: 'student', email: 'a@b.c' });
    const payload = service.verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('student');
    expect(payload.email).toBe('a@b.c');
  });

  it('rejects a token signed with a different secret', () => {
    const other = new TokenService(new JwtService(), {
      JWT_ACCESS_SECRET: 'different-secret-value!',
      JWT_ACCESS_TTL_SECONDS: 900,
    } as never);
    const token = other.signAccessToken({ id: 'u1', role: 'admin', email: 'a@b.c' });
    expect(() => service.verifyAccessToken(token)).toThrow();
  });
});
