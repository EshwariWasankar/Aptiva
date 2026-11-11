'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '../lib/apiClient';

/** P-05a: consume ?token= from the verification email link. */
function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Missing verification token.');
      return;
    }
    setState('working');
    api<null>('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
      .then(() => {
        setState('done');
        setMessage('Email verified. You can now sign in.');
      })
      .catch((err: unknown) => {
        setState('error');
        setMessage(
          err instanceof ApiError && err.status === 410
            ? 'This verification link has expired. Request a new one from your account settings.'
            : 'This verification link is invalid or has already been used.',
        );
      });
  }, [token]);

  return (
    <div className="flex flex-col gap-3 text-center">
      <h1 className="text-xl font-semibold">Verify email</h1>
      <p className="text-sm text-neutral-600">
        {state === 'working' && 'Verifying…'}
        {state === 'done' && message}
        {state === 'error' && message}
        {state === 'idle' && ''}
      </p>
      <a href="/login" className="text-sm text-neutral-600 underline">
        Go to sign in
      </a>
    </div>
  );
}

export function VerifyEmailPanel() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
