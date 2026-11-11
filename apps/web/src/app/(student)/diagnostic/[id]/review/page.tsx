'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Katex } from '../../../../../components/Katex';
import { ErrorCausePicker } from '../../../../../components/ErrorCausePicker';
import { ConflictNote } from '../../../../../components/ConflictNote';
import {
  getDiagnosticReview,
  type ReviewItem,
  type ReviewResponse,
} from '../../../../../lib/diagnostic';

/**
 * P-09 — mistake review: question, correct answer, worked solution, time
 * vs expected, error-cause tag (E-016) and skip-for-now.
 */
export default function DiagnosticReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    getDiagnosticReview(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load review'));
  }, [id]);

  function skip(item: ReviewItem) {
    setSkipped((prev) => new Set(prev).add(item.attemptId));
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-neutral-500">Loading review…</p>;

  const misses = data.items.filter((i) => i.isCorrect !== true && !skipped.has(i.attemptId));

  if (misses.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Nothing to review</h1>
        <p className="mt-2 text-neutral-600">Every answered question was correct.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Review your mistakes</h1>
        <p className="text-sm text-neutral-500">
          {misses.length} item{misses.length === 1 ? '' : 's'} to look at. Tag why each went wrong —
          your label is what we store.
        </p>
      </div>

      {misses.map((item) => (
        <article key={item.attemptId} className="rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              Q{item.sequenceNo} · {item.topicName} ·{' '}
              {item.timeMs != null && item.expectedTimeMs > 0
                ? `${(item.timeMs / item.expectedTimeMs).toFixed(2)}× expected time`
                : '—'}
            </span>
            <span
              className={`rounded px-2 py-0.5 ${item.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              {item.isCorrect ? 'Correct' : item.skipped ? 'Skipped' : 'Wrong'}
            </span>
          </div>

          <div className="mt-3">
            <Katex text={item.stem} className="text-sm leading-6" />
          </div>

          {item.format === 'mcq' && (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {item.options.map((o) => (
                <li
                  key={o.id}
                  className={`rounded px-3 py-1.5 ${
                    o.isCorrect
                      ? 'bg-green-50 text-green-900'
                      : o.id === item.selectedOptionId
                        ? 'bg-red-50 text-red-900'
                        : 'text-neutral-600'
                  }`}
                >
                  {o.isCorrect ? '✓ ' : o.id === item.selectedOptionId ? '✗ ' : ''}
                  <Katex text={o.text} />
                </li>
              ))}
            </ul>
          )}
          {item.format === 'numerical' && (
            <p className="mt-3 text-sm">
              <span className="text-neutral-500">Correct answer: </span>
              <span className="font-mono font-medium">
                {item.numericAnswer}
                {item.answerFormat === 'integer' ? '' : ` (${item.answerFormat})`}
              </span>
              <span className="ml-3 text-neutral-500">Yours: </span>
              <span className="font-mono">{item.numericInput ?? '—'}</span>
            </p>
          )}

          {item.solution && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-blue-700">Worked solution</summary>
              <div className="mt-2 rounded bg-neutral-50 p-3 text-sm">
                <Katex text={item.solution} />
              </div>
            </details>
          )}

          {item.feedback && (
            <p className="mt-2 text-xs text-neutral-500">
              Tagged: {item.feedback.errorTypeLabel}
              {item.feedback.freeText ? ` — ${item.feedback.freeText}` : ''}
            </p>
          )}
          {item.inference?.conflict && conflicts.get(item.attemptId) !== false && (
            <div className="mt-2">
              <ConflictNote
                onDismiss={() => {
                  setConflicts((m) => {
                    const next = new Map(m);
                    next.set(item.attemptId, false);
                    return next;
                  });
                }}
              />
            </div>
          )}

          {!item.feedback && !item.inference?.conflict && (
            <div className="mt-3">
              <ErrorCausePicker
                attemptId={item.attemptId}
                onSaved={(r) => {
                  if (r.conflict) setConflicts((m) => new Map(m).set(item.attemptId, true));
                  void getDiagnosticReview(id).then(setData);
                }}
              />
            </div>
          )}
          {item.feedback && !item.inference?.conflict && (
            <button
              type="button"
              onClick={() => skip(item)}
              className="mt-3 text-xs text-neutral-400 underline"
            >
              Skip for now
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
