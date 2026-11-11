import { z } from 'zod';

/** Request schemas for E-001..E-007 (playbook Section 11.1). */

export const RegisterDtoSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  gradYear: z.number().int().min(1990).max(2100).optional(),
  branch: z.string().max(120).optional(),
  college: z.string().max(200).optional(),
  consentVersion: z.string().min(1, 'Consent is required'),
});
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const VerifyEmailDtoSchema = z.object({
  token: z.string().min(10).max(200),
});
export type VerifyEmailDto = z.infer<typeof VerifyEmailDtoSchema>;

export const PasswordResetRequestDtoSchema = z.object({
  email: z.string().email().max(320),
});
export type PasswordResetRequestDto = z.infer<typeof PasswordResetRequestDtoSchema>;

export const PasswordResetConfirmDtoSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
});
export type PasswordResetConfirmDto = z.infer<typeof PasswordResetConfirmDtoSchema>;

export const UpdateMeDtoSchema = z.object({
  gradYear: z.number().int().min(1990).max(2100).nullable().optional(),
  branch: z.string().max(120).nullable().optional(),
  college: z.string().max(200).nullable().optional(),
  language: z.string().min(2).max(10).optional(),
});
export type UpdateMeDto = z.infer<typeof UpdateMeDtoSchema>;

/** Public user projection returned by auth and /me endpoints. */
export interface PublicUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
}
