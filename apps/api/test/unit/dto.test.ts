import { describe, expect, it } from 'vitest';
import { LoginDtoSchema, RegisterDtoSchema, UpdateMeDtoSchema } from '../../src/auth/dto';

const VALID_REGISTER = {
  email: 'student@example.com',
  password: 'a-strong-password-1',
  gradYear: 2027,
  branch: 'CSE',
  consentVersion: '2026-11',
};

describe('auth DTO schemas', () => {
  it('accepts a valid registration payload', () => {
    expect(RegisterDtoSchema.safeParse(VALID_REGISTER).success).toBe(true);
  });

  it('rejects missing consentVersion', () => {
    const { consentVersion: _omit, ...rest } = VALID_REGISTER;
    const result = RegisterDtoSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects passwords shorter than 10 chars at schema level', () => {
    const result = RegisterDtoSchema.safeParse({ ...VALID_REGISTER, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid gradYear', () => {
    expect(RegisterDtoSchema.safeParse({ ...VALID_REGISTER, gradYear: 1800 }).success).toBe(false);
  });

  it('accepts a minimal login payload', () => {
    expect(LoginDtoSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('UpdateMeDto allows partial nullable updates', () => {
    expect(UpdateMeDtoSchema.safeParse({ branch: 'ECE', college: null }).success).toBe(true);
  });
});
