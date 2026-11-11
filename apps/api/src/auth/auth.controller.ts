import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';
import { Public } from '../common/guards/auth.guard';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { AuthService, type IssuedSession } from './auth.service';
import { GoogleOAuthService, OAUTH_COOKIE_TTL_MS } from './google-oauth.service';
import {
  LoginDtoSchema,
  PasswordResetConfirmDtoSchema,
  PasswordResetRequestDtoSchema,
  RegisterDtoSchema,
  VerifyEmailDtoSchema,
} from './dto';
import { parseBody } from '../common/http/zod';

export const REFRESH_COOKIE = 'pp_refresh';
/** Custom header required on cookie-authenticated mutations (CSRF, SEC-007). */
export const CSRF_HEADER = 'x-aptiva-client';

const AUTH_RATE_LIMIT = { limit: 10, windowMs: 60_000, key: 'ip' as const };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleOAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // E-001
  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(parseBody(RegisterDtoSchema, body));
    this.setRefreshCookie(res, session);
    return this.sessionResponse(session);
  }

  // E-002
  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(parseBody(LoginDtoSchema, body));
    this.setRefreshCookie(res, session);
    return this.sessionResponse(session);
  }

  // E-003 — cookie-authenticated; requires the custom CSRF header.
  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireCsrfHeader(req);
    const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    this.setRefreshCookie(res, session);
    return this.sessionResponse(session);
  }

  // E-004
  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireCsrfHeader(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  // E-005 — redirects; no JSON body.
  @Public()
  @Get('google')
  googleStart(@Res() res: Response) {
    const { url, cookieValue } = this.google.begin();
    res.cookie(this.google.cookieName, cookieValue, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: OAUTH_COOKIE_TTL_MS,
      path: '/api/v1/auth',
    });
    res.redirect(url);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fail = () => res.redirect(`${this.env.WEB_BASE_URL}/login?error=oauth`);
    if (!code || !state) return fail();
    try {
      const userId = await this.google.complete(
        code,
        state,
        req.cookies?.[this.google.cookieName] as string | undefined,
      );
      if (!userId) return fail();
      const session = await this.auth.issueSessionForGoogleUser(userId);
      this.setRefreshCookie(res, session);
      res.clearCookie(this.google.cookieName, { path: '/api/v1/auth' });
      // Hand the access token to the SPA via a short-lived cookie-free redirect:
      // the web app exchanges it through /auth/refresh on first load instead.
      return res.redirect(`${this.env.WEB_BASE_URL}/login?oauth=done`);
    } catch {
      return fail();
    }
  }

  // E-006
  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @HttpCode(204)
  @Post('verify-email')
  async verifyEmail(@Body() body: unknown) {
    await this.auth.verifyEmail(parseBody(VerifyEmailDtoSchema, body).token);
  }

  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @HttpCode(204)
  @Post('password-reset/request')
  async passwordResetRequest(@Body() body: unknown) {
    await this.auth.requestPasswordReset(parseBody(PasswordResetRequestDtoSchema, body).email);
  }

  @Public()
  @RateLimit(AUTH_RATE_LIMIT)
  @HttpCode(204)
  @Post('password-reset/confirm')
  async passwordResetConfirm(@Body() body: unknown) {
    const dto = parseBody(PasswordResetConfirmDtoSchema, body);
    await this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  // ------------------------------------------------------------- helpers

  private sessionResponse(session: IssuedSession) {
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  private setRefreshCookie(res: Response, session: IssuedSession): void {
    const maxAge = this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge,
      ...(this.env.COOKIE_DOMAIN !== 'localhost' ? { domain: this.env.COOKIE_DOMAIN } : {}),
    });
  }

  private requireCsrfHeader(req: Request): void {
    if (!req.headers[CSRF_HEADER]) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Missing required header ${CSRF_HEADER}`,
      });
    }
  }
}
