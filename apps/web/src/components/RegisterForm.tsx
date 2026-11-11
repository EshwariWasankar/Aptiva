'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ApiError, register } from '../lib/apiClient';
import { useSession } from '../lib/session';

// Must match NOTICE_VERSION on the API (PH1-T06 consent versioning).
export const CONSENT_NOTICE_VERSION = '2026-11';

const RegisterSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  gradYear: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= 1990 && Number(v) <= 2100), 'Invalid year'),
  branch: z.string().max(120).optional(),
  college: z.string().max(200).optional(),
  consent: z.literal(true, { error: 'Consent is required' }),
});

function strengthHint(pw: string): string {
  if (pw.length === 0) return '';
  if (pw.length < 10) return 'At least 10 characters required';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) return 'Strong';
  if (classes === 2) return 'Good — add more variety for a stronger password';
  return 'Weak — mix letters, numbers and symbols';
}

/** P-03 registration form (FR-001). */
export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [branch, setBranch] = useState('');
  const [college, setCollege] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { reload } = useSession();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = RegisterSchema.safeParse({
      email,
      password,
      gradYear: gradYear || undefined,
      branch: branch || undefined,
      college: college || undefined,
      consent,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await register({
        email: parsed.data.email,
        password: parsed.data.password,
        gradYear: parsed.data.gradYear ? Number(parsed.data.gradYear) : undefined,
        branch: parsed.data.branch || undefined,
        college: parsed.data.college || undefined,
        consentVersion: CONSENT_NOTICE_VERSION,
      });
      await reload();
      router.replace('/');
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 409
          ? 'An account with this email already exists. Try signing in.'
          : 'Registration failed. Please check your details and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  const hint = strengthHint(password);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
        {errors.email ? <span className="text-red-600">{errors.email}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
        {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
        {errors.password ? <span className="text-red-600">{errors.password}</span> : null}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Graduation year
          <input
            type="number"
            min={1990}
            max={2100}
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
          {errors.gradYear ? <span className="text-red-600">{errors.gradYear}</span> : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Branch
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        College (optional)
        <input
          type="text"
          value={college}
          onChange={(e) => setCollege(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span>
          I agree to the{' '}
          <Link href="/privacy" className="underline">
            privacy notice
          </Link>{' '}
          (version {CONSENT_NOTICE_VERSION}).
        </span>
      </label>
      {errors.consent ? <span className="text-sm text-red-600">{errors.consent}</span> : null}
      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Creating account…' : 'Create account'}
      </button>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-600">Already have an account?</span>
        <Link href="/login" className="text-neutral-600 underline">
          Sign in
        </Link>
      </div>
      <a
        href="/api/v1/auth/google"
        className="rounded border border-neutral-300 px-4 py-2 text-center text-sm"
      >
        Continue with Google
      </a>
    </form>
  );
}
