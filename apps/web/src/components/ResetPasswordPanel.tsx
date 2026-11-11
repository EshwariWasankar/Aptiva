'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { api, ApiError } from '../lib/apiClient';

const RequestSchema = z.object({ email: z.string().email('Enter a valid email') });
const ConfirmSchema = z.object({
  password: z.string().min(10, 'Password must be at least 10 characters'),
  confirm: z.string(),
});

/** P-05b: request a reset link, or confirm with ?token=. */
function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token');

  if (token) return <ResetConfirm token={token} />;
  return <ResetRequest />;
}

function ResetRequest() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = RequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api<null>('/auth/password-reset/request', {
        method: 'POST',
        body: { email: parsed.data.email },
        auth: false,
      });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p className="text-sm text-neutral-700">
        If an account exists for that email, a reset link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">Reset password</h1>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <a href="/login" className="text-sm text-neutral-600 underline">
        Back to sign in
      </a>
    </form>
  );
}

function ResetConfirm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = ConfirmSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    if (parsed.data.password !== parsed.data.confirm) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api<null>('/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, password: parsed.data.password },
        auth: false,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 410
          ? 'This reset link has expired. Request a new one.'
          : 'This reset link is invalid or has already been used.',
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-sm text-neutral-700">Password updated. You can sign in now.</p>
        <a href="/login" className="text-sm text-neutral-600 underline">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirm password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        {pending ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

export function ResetPasswordPanel() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
