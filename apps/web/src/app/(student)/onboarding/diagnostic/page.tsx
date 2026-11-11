'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../../../lib/apiClient';
import {
  createDiagnostic,
  getActiveDiagnostic,
  type DiagnosticActive,
} from '../../../../lib/diagnostic';

/**
 * P-06 — diagnostic intro (playbook P-06): explains what the diagnostic
 * measures, offers standard vs express (express suggested within 48 h of
 * a test date), and resumes an in-progress diagnostic.
 */
export default function OnboardingDiagnosticPage() {
  const router = useRouter();
  const [active, setActive] = useState<DiagnosticActive | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nearTest, setNearTest] = useState(false);

  useEffect(() => {
    getActiveDiagnostic()
      .then(setActive)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function start(mode: 'standard' | 'express') {
    setBusy(mode);
    setError(null);
    try {
      const d = await createDiagnostic(mode);
      router.push(`/diagnostic/${d.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DIAGNOSTIC_ACTIVE' && e.details) {
        const id = (e.details as { diagnosticId?: string }).diagnosticId;
        if (id) {
          router.push(`/diagnostic/${id}`);
          return;
        }
      }
      setError(e instanceof Error ? e.message : 'Could not start the diagnostic');
      setBusy(null);
    }
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Setup diagnostic</h1>
        <p className="mt-2 text-neutral-600">
          This short assessment measures your baseline across Quantitative, Logical Reasoning, Data
          Interpretation and Verbal sections. It never counts against you — it only shapes your
          plan. Answers are marked and timed on the server.
        </p>
      </div>

      {active && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">
            You have a {active.mode} diagnostic in progress ({active.answeredCount}/
            {active.questionCount} answered
            {active.status === 'paused' ? ', paused' : ''}).
          </p>
          <button
            type="button"
            onClick={() => router.push(`/diagnostic/${active.id}`)}
            className="mt-2 rounded bg-blue-700 px-4 py-2 text-sm text-white"
          >
            Resume diagnostic
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-5">
          <h2 className="font-semibold">Core diagnostic</h2>
          <p className="mt-1 text-sm text-neutral-600">
            27 questions across all four sections · about 30 minutes · recommended when your test is
            more than 48 hours away.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void start('standard')}
            className="mt-4 w-full rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy === 'standard' ? 'Starting…' : 'Start core diagnostic'}
          </button>
        </div>

        <div className="rounded-lg border border-neutral-200 p-5">
          <h2 className="font-semibold">Express diagnostic</h2>
          <p className="mt-1 text-sm text-neutral-600">
            12 questions · about 10–15 minutes · results are flagged <em>coarse</em>. Suggested when
            your test is within 48 hours.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={nearTest}
              onChange={(e) => setNearTest(e.target.checked)}
            />
            My test is within 48 hours
          </label>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void start('express')}
            className={`mt-4 w-full rounded px-4 py-2 text-sm text-white disabled:opacity-50 ${
              nearTest ? 'bg-amber-600' : 'bg-neutral-700'
            }`}
          >
            {busy === 'express' ? 'Starting…' : 'Start express diagnostic'}
          </button>
        </div>
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
