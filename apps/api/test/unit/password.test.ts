import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordPolicyError, PasswordService } from '../../src/auth/password.service';

const service = new PasswordService();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PasswordService', () => {
  it('hashes and verifies an Argon2id hash', async () => {
    const hash = await service.hash('correct-horse-battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, 'correct-horse-battery')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password!!')).resolves.toBe(false);
  });

  it('reports a breached password via the HIBP range API', async () => {
    const { sha1Hex } = await import('../../src/common/crypto');
    const pw = 'password123';
    const sfx = sha1Hex(pw).toUpperCase().slice(5);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => `${sfx}:1\n` }));
    await expect(service.isBreached(pw)).resolves.toBe(true);
    await expect(service.isBreached('a-totally-unique-pw-9876')).resolves.toBe(false);
  });

  it('fails open when HIBP is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(service.isBreached('whatever-password')).resolves.toBe(false);
  });

  it('rejects passwords shorter than 10 chars', async () => {
    await expect(service.assertAcceptable('short')).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it('rejects breached passwords through assertAcceptable', async () => {
    const { sha1Hex } = await import('../../src/common/crypto');
    const pw = 'breached-password-1';
    const sfx = sha1Hex(pw).toUpperCase().slice(5);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => `${sfx}:3\n` }));
    await expect(service.assertAcceptable(pw)).rejects.toBeInstanceOf(PasswordPolicyError);
  });
});
