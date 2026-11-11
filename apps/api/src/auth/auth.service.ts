import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, type Env } from '../common/config/env';
import { randomToken, safeEqual, sha256Hex } from '../common/crypto';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../common/mail/mailer.service';
import { PasswordPolicyError, PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { LoginDto, RegisterDto } from './dto';
import type { PublicUser } from './dto';

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------- E-001

  async register(dto: RegisterDto): Promise<IssuedSession> {
    try {
      await this.password.assertAcceptable(dto.password);
    } catch (err) {
      if (err instanceof PasswordPolicyError) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: err.message });
      }
      throw err;
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await this.password.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'student',
        profile: {
          create: {
            gradYear: dto.gradYear ?? null,
            branch: dto.branch ?? null,
            college: dto.college ?? null,
          },
        },
        consents: {
          create: {
            noticeVersion: dto.consentVersion,
            purpose: 'core',
            granted: true,
          },
        },
      },
    });

    await this.sendEmailVerification(user.id, email);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.register',
      objectType: 'user',
      objectId: user.id,
    });

    return this.issueSession(user.id);
  }

  // ------------------------------------------------------------- E-002

  async login(dto: LoginDto): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Generic failure — never reveal whether the email exists.
    const invalid = () =>
      new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials' });

    if (!user || !user.passwordHash) throw invalid();
    const ok = await this.password.verify(user.passwordHash, dto.password);
    if (!ok) {
      await this.audit.record({
        action: 'auth.login_failed',
        objectType: 'user',
        objectId: user.id,
      });
      throw invalid();
    }
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      objectType: 'user',
      objectId: user.id,
    });
    return this.issueSession(user.id);
  }

  // ------------------------------------------------- E-003 / E-004

  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw this.unauthenticated();
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: { user: true },
    });
    if (!record) throw this.unauthenticated();

    if (record.revokedAt !== null) {
      // Reuse of a rotated/revoked token: compromise signal — kill the family.
      await this.revokeFamily(record.familyId);
      await this.audit.record({
        actorId: record.userId,
        action: 'auth.refresh_reuse_detected',
        objectType: 'refresh_token_family',
        objectId: record.familyId,
      });
      throw this.unauthenticated();
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw this.unauthenticated();
    }

    // Rotate: revoke the presented token and issue a new one in the same
    // family, atomically — a lost race means the token was already rotated.
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) throw this.unauthenticated();
      return this.rotate(record.familyId, record.userId, tx);
    });
    return {
      accessToken: this.tokens.signAccessToken({
        id: record.user.id,
        role: record.user.role,
        email: record.user.email,
      }),
      refreshToken,
      user: this.toPublicUser(record.user),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ------------------------------------------------------------- E-006

  async verifyEmail(rawToken: string): Promise<void> {
    const record = await this.consumeAuthToken(rawToken, 'email_verify');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.email_verified',
      objectType: 'user',
      objectId: record.userId,
    });
  }

  async requestPasswordReset(emailRaw: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always succeed silently — never reveal whether the email exists.
    if (!user) return;

    const raw = randomToken(32);
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: 'password_reset',
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    const link = `${this.env.WEB_BASE_URL}/reset-password?token=${raw}`;
    await this.mailer.send({
      to: email,
      subject: 'Reset your Aptiva password',
      text: `Reset your password: ${link}\nThis link expires in 1 hour.`,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.password_reset_requested',
      objectType: 'user',
      objectId: user.id,
    });
  }

  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
    try {
      await this.password.assertAcceptable(newPassword);
    } catch (err) {
      if (err instanceof PasswordPolicyError) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: err.message });
      }
      throw err;
    }
    const record = await this.consumeAuthToken(rawToken, 'password_reset');
    const passwordHash = await this.password.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Reset invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.password_reset_confirmed',
      objectType: 'user',
      objectId: record.userId,
    });
  }

  // ------------------------------------------------------------- Google

  /** Called by GoogleOAuthService after a successful upsert. */
  async issueSessionForGoogleUser(userId: string): Promise<IssuedSession> {
    return this.issueSession(userId);
  }

  // ------------------------------------------------------------- helpers

  private async issueSession(userId: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const refreshToken = await this.rotate(randomUUID(), userId);
    return {
      accessToken: this.tokens.signAccessToken({
        id: user.id,
        role: user.role,
        email: user.email,
      }),
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  private async rotate(
    familyId: string,
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const raw = randomToken(32);
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    return raw;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async consumeAuthToken(
    rawToken: string,
    purpose: 'email_verify' | 'password_reset',
  ): Promise<{ userId: string }> {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
    });
    if (!record || record.purpose !== purpose) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid token' });
    }
    if (record.usedAt !== null) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Token has already been used',
      });
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({ code: 'TOKEN_EXPIRED', message: 'Token has expired' });
    }
    await this.prisma.authToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { userId: record.userId };
  }

  private async sendEmailVerification(userId: string, email: string): Promise<void> {
    const raw = randomToken(32);
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose: 'email_verify',
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });
    const link = `${this.env.WEB_BASE_URL}/verify-email?token=${raw}`;
    await this.mailer.send({
      to: email,
      subject: 'Verify your Aptiva email',
      text: `Verify your email address: ${link}\nThis link expires in 24 hours.`,
    });
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    role: string;
    emailVerifiedAt: Date | null;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  private unauthenticated(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Invalid or expired session',
    });
  }

  /** Used by tests: constant-time check helper re-export. */
  static tokensEqual(a: string, b: string): boolean {
    return safeEqual(a, b);
  }
}
