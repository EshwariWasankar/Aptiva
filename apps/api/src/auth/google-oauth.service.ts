import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ENV, type Env } from '../common/config/env';
import { safeEqual } from '../common/crypto';
import { PrismaService } from '../common/prisma/prisma.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const OAUTH_COOKIE = 'pp_oauth_txn';
export const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

interface OAuthTxn {
  state: string;
  verifier: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | undefined;
}

/**
 * Google OAuth 2.0 with state and PKCE (E-005, SEC-005).
 * The transaction (state + code_verifier) travels in a short-lived
 * HMAC-signed httpOnly cookie — no server-side session store needed.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get cookieName(): string {
    return OAUTH_COOKIE;
  }

  configured(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  /** Returns { url, cookieValue } for the authorize redirect. */
  begin(): { url: string; cookieValue: string } {
    if (!this.configured()) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Google sign-in is not configured',
      });
    }
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const txn: OAuthTxn = { state, verifier };
    const payload = Buffer.from(JSON.stringify(txn)).toString('base64url');
    const sig = this.sign(payload);
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: this.env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return { url: `${GOOGLE_AUTH_URL}?${params}`, cookieValue: `${payload}.${sig}` };
  }

  /**
   * Validates the callback: state must match the signed cookie, then the
   * code is exchanged and the Google profile fetched. Returns the upserted
   * internal user id, or null on any verification failure.
   */
  async complete(
    code: string,
    state: string,
    cookieValue: string | undefined,
  ): Promise<string | null> {
    const txn = this.readCookie(cookieValue);
    if (!txn || !safeEqual(txn.state, state)) return null;

    const tokens = await this.exchangeCode(code, txn.verifier);
    if (!tokens) return null;
    const profile = await this.fetchProfile(tokens.access_token);
    if (!profile) return null;
    return this.upsertUser(profile);
  }

  private async exchangeCode(
    code: string,
    verifier: string,
  ): Promise<{ access_token: string } | null> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: this.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ? { access_token: json.access_token } : null;
  }

  private async fetchProfile(accessToken: string): Promise<GoogleProfile | null> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!json.sub || !json.email) return null;
    return {
      sub: json.sub,
      email: json.email.toLowerCase(),
      emailVerified: json.email_verified === true,
      name: json.name,
    };
  }

  private async upsertUser(profile: GoogleProfile): Promise<string> {
    // Match on google_sub first, then email (linking a Google identity to an
    // existing email account only when the email is verified by Google).
    const bySub = await this.prisma.user.findUnique({ where: { googleSub: profile.sub } });
    if (bySub) return bySub.id;

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (!profile.emailVerified) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Google account email is not verified',
        });
      }
      const updated = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleSub: profile.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
      return updated.id;
    }

    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        googleSub: profile.sub,
        role: 'student',
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        profile: { create: {} },
        consents: {
          create: { noticeVersion: this.env.NOTICE_VERSION, purpose: 'core', granted: true },
        },
      },
    });
    return created.id;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.env.JWT_ACCESS_SECRET).update(payload).digest('base64url');
  }

  private readCookie(cookieValue: string | undefined): OAuthTxn | null {
    if (!cookieValue) return null;
    const dot = cookieValue.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    if (!safeEqual(sig, this.sign(payload))) return null;
    try {
      const txn = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthTxn;
      return typeof txn.state === 'string' && typeof txn.verifier === 'string' ? txn : null;
    } catch {
      return null;
    }
  }
}
