'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '../../../../../lib/apiClient';
import { getDiagnosticResult, type DiagnosticResult } from '../../../../../lib/diagnostic';

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

function ratio(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}×`;
}

/**
 * P-08 — result analysis (E-015): topic + difficulty accuracy, time vs
 * expected, skip pattern, consistency, thin-evidence list. Express
 * diagnostics carry a coarse badge.
 */
export default function DiagnosticResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let tries = 0;
    const poll = async () => {
      try {
        const r = await getDiagnosticResult(id);
        setResult(r.result);
        setPending(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'RESULT_NOT_READY' && tries < 30) {
          tries += 1;
          setTimeout(() => void poll(), 1000);
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load result');
        setPending(false);
      }
    };
    void poll();
  }, [id]);

  if (pending) {
    return <p className="text-neutral-500">Analysing your diagnostic…</p>;
  }
  if (error || !result) {
    return <p className="text-red-600">{error ?? 'No result'}</p>;
  }

  const thinNames = new Map(result.byTopic.map((t) => [t.topicId, t.topicName ?? t.topicId]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Diagnostic result</h1>
          <p className="text-sm text-neutral-500">
            {result.totals.answered}/{result.totals.questions} answered · {result.totals.correct}{' '}
            correct · {pct(result.totals.accuracy)} accuracy
          </p>
        </div>
        {result.coarse && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Coarse estimate (express)
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="font-semibold">By topic</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-2">Topic</th>
                <th className="pr-2">Section</th>
                <th className="pr-2">Accuracy</th>
                <th className="pr-2">Time</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {result.byTopic.map((t) => (
                <tr key={t.topicId} className="border-t border-neutral-100">
                  <td className="pr-2">{t.topicName ?? t.topicId.slice(0, 8)}</td>
                  <td className="pr-2 text-neutral-500">{t.sectionName ?? '—'}</td>
                  <td className="pr-2 font-medium">{pct(t.accuracy)}</td>
                  <td className="pr-2">{ratio(t.avgTimeRatio)}</td>
                  <td className={t.thinEvidence ? 'text-amber-600' : 'text-neutral-500'}>
                    {t.thinEvidence ? 'thin' : `${t.answered} items`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-neutral-200 p-4">
            <h2 className="font-semibold">By difficulty</h2>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {result.byDifficulty.map((b) => (
                <div key={b.band} className="flex justify-between">
                  <span className="capitalize text-neutral-600">{b.label}</span>
                  <span>
                    {pct(b.accuracy)}{' '}
                    <span className="text-neutral-400">
                      ({b.correct}/{b.attempts})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 p-4 text-sm">
            <h2 className="font-semibold">Pace</h2>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-neutral-600">Avg time vs expected</span>
                <span>{ratio(result.timeVsExpected.avgRatio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Over expected (&gt;1.2×)</span>
                <span>{pct(result.timeVsExpected.overExpectedShare)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Under expected (&lt;0.8×)</span>
                <span>{pct(result.timeVsExpected.underExpectedShare)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 p-4 text-sm">
            <h2 className="font-semibold">Consistency</h2>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-neutral-600">First half</span>
                <span>{pct(result.consistency.firstHalfAccuracy)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Second half</span>
                <span>{pct(result.consistency.secondHalfAccuracy)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Drift</span>
                <span className={result.consistency.unstable ? 'font-medium text-amber-600' : ''}>
                  {result.consistency.drift == null
                    ? '—'
                    : `${Math.round(result.consistency.drift * 100)}%`}
                  {result.consistency.unstable ? ' (unstable)' : ''}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 p-4 text-sm">
            <h2 className="font-semibold">Skips</h2>
            <p className="mt-1 text-neutral-600">
              {result.skipPattern.skippedCount} skipped ({pct(result.skipPattern.skippedShare)})
              {result.skipPattern.skippedPositions.length > 0 && (
                <span className="text-neutral-400">
                  {' '}
                  at positions {result.skipPattern.skippedPositions.join(', ')}
                </span>
              )}
            </p>
          </section>
        </div>
      </div>

      {result.thinEvidence.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Needs more evidence</h2>
          <p className="mt-1 text-sm text-amber-800">
            These topics had too few items to estimate reliably:{' '}
            {result.thinEvidence.map((t) => thinNames.get(t) ?? t).join(', ')}. Your plan will
            include probe questions for them.
          </p>
        </section>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push(`/diagnostic/${id}/review`)}
          className="rounded bg-neutral-900 px-6 py-2 text-sm text-white"
        >
          Review mistakes
        </button>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="rounded border border-neutral-300 px-6 py-2 text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}
