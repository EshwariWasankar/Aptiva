'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '../lib/apiClient';
import { useSession } from '../lib/session';

/** P-04 login form. Error text is deliberately generic (SEC-003). */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const { reload } = useSession();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      await reload();
      router.replace('/');
    } catch (err) {
      // Generic message regardless of cause — never reveal which field failed.
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Invalid email or password.',
      );
    } finally {
      setPending(false);
    }
  }

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
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm">
        <Link href="/reset-password" className="text-neutral-600 underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-neutral-600 underline">
          Create account
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
