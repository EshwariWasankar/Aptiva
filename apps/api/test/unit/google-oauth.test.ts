import { describe, expect, it } from 'vitest';
import { GoogleOAuthService } from '../../src/auth/google-oauth.service';

const env = {
  JWT_ACCESS_SECRET: 'test-secret-at-least-16-chars',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/google/callback',
  NOTICE_VERSION: '2026-11',
} as never;

const prismaStub = {} as never;

describe('GoogleOAuthService', () => {
  it('begin() produces an authorize URL with state and S256 challenge', () => {
    const svc = new GoogleOAuthService(prismaStub, env);
    const { url, cookieValue } = svc.begin();
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('state')).toBeTruthy();
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
    expect(cookieValue).toContain('.');
  });

  it('complete() rejects a state mismatch without touching the DB', async () => {
    const svc = new GoogleOAuthService(prismaStub, env);
    const { cookieValue } = svc.begin();
    const result = await svc.complete('code', 'wrong-state', cookieValue);
    expect(result).toBeNull();
  });

  it('complete() rejects a tampered cookie', async () => {
    const svc = new GoogleOAuthService(prismaStub, env);
    const { url, cookieValue } = svc.begin();
    const state = new URL(url).searchParams.get('state')!;
    const tampered = cookieValue.slice(0, -2) + 'xx';
    const result = await svc.complete('code', state, tampered);
    expect(result).toBeNull();
  });
});
