import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Cryptographically random URL-safe token (refresh tokens, auth tokens, OAuth state). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

/** Constant-time string comparison for secrets/tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
