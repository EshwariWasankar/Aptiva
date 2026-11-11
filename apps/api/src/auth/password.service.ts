import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { sha1Hex } from '../common/crypto';

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const HIBP_TIMEOUT_MS = 3_000;

/**
 * Password policy (SEC-001): Argon2id hashing plus a breached-password
 * check against the HaveIBeenPwned k-anonymity range API. The HIBP check
 * fails open on network errors — usability over strictness — and the
 * outcome is logged so silent degradation is visible.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Returns true when the password appears in known breaches. */
  async isBreached(plain: string): Promise<boolean> {
    const sha1 = sha1Hex(plain).toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`HIBP range request failed with ${res.status}; allowing password`);
        return false;
      }
      const body = await res.text();
      return body.split('\n').some((line) => line.trim().split(':')[0] === suffix);
    } catch (err) {
      this.logger.warn(`HIBP check unreachable (${String(err)}); allowing password`);
      return false;
    }
  }

  /** Full policy check used by register and password reset. */
  async assertAcceptable(plain: string): Promise<void> {
    if (plain.length < 10) {
      throw new PasswordPolicyError('Password must be at least 10 characters');
    }
    if (await this.isBreached(plain)) {
      throw new PasswordPolicyError('Password appears in known data breaches');
    }
  }
}

export class PasswordPolicyError extends Error {}
