'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '../../../../lib/apiClient';
import { Katex } from '../../../../components/Katex';
import {
  getNextQuestion,
  pauseDiagnostic,
  submitDiagnostic,
  submitDiagnosticAnswer,
  type ServedQuestion,
} from '../../../../lib/diagnostic';
import { randomUUID } from '../../../../lib/uuid';

interface Item {
  question: ServedQuestion;
  position: number;
  total: number;
  shownAtMs: number;
  attemptId: string;
  answered: boolean;
}

/**
 * P-07 — diagnostic runner: stem with KaTeX, MCQ options or numeric
 * entry, display-only timer, skip, next, progress, single pause.
 * Answers are marked server-side; feedback is shown only after submit.
 */
export default function DiagnosticRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [done, setDone] = useState<{ answered: number; total: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const attemptIds = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNext = useCallback(async () => {
    setError(null);
    try {
      const r = await getNextQuestion(id);
      if (r.done) {
        setDone({ answered: r.answeredCount ?? 0, total: r.totalCount ?? 0 });
        return;
      }
      const q = r.question!;
      setItem({
        question: q,
        position: r.position!,
        total: r.total!,
        shownAtMs: new Date(q.shownAt).getTime(),
        attemptId: randomUUID(),
        answered: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load question');
    }
  }, [id]);

  useEffect(() => {
    void loadNext();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadNext]);

  // Display-only elapsed timer (server timestamps are authoritative).
  useEffect(() => {
    if (!item || item.answered) return;
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - item.shownAtMs);
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [item]);

  const [selected, setSelected] = useState<string | null>(null);
  const [numeric, setNumeric] = useState('');

  useEffect(() => {
    setSelected(null);
    setNumeric('');
    setElapsed(0);
  }, [item?.question.id]);

  async function answer(skipped: boolean): Promise<boolean> {
    if (!item) return false;
    const body = {
      attemptId: item.attemptId,
      selectedOptionId: item.question.format === 'mcq' ? selected : null,
      numericInput: item.question.format === 'numerical' ? numeric || null : null,
      skipped,
      revisitCount: 0,
      answerChanges: 0,
    };
    try {
      const ack = await submitDiagnosticAnswer(id, item.question.id, body);
      attemptIds.current.push(ack.attemptId);
      setItem({ ...item, answered: true });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_NUMERIC_INPUT') {
        setError('That answer could not be parsed — try again.');
        return false;
      }
      setError(e instanceof Error ? e.message : 'Submission failed');
      return false;
    }
  }

  async function next() {
    if (!item) return;
    if (!item.answered) {
      // Answer if possible, otherwise record an honest skip.
      const ok = await answer(!canAnswer);
      if (!ok) return;
    }
    await loadNext();
  }

  async function doPause() {
    setSubmitting(true);
    try {
      await pauseDiagnostic(id);
      setPaused(true);
    } catch {
      setError('Could not pause — the diagnostic may already be paused.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitDiagnostic(id, attemptIds.current);
      router.push(`/diagnostic/${id}/result`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
      setSubmitting(false);
    }
  }

  function fmtElapsed(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  if (paused) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-xl font-semibold">Paused</h1>
        <p className="mt-2 text-neutral-600">
          Your progress is saved. You can pause only once — resume when you're ready.
        </p>
        <button
          type="button"
          onClick={() => {
            setPaused(false);
            void loadNext();
          }}
          className="mt-6 rounded bg-neutral-900 px-6 py-2 text-white"
        >
          Resume
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-xl font-semibold">All questions answered</h1>
        <p className="mt-2 text-neutral-600">
          {done.answered}/{done.total} recorded. Submit to see your analysed result.
        </p>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void doSubmit()}
          className="mt-6 rounded bg-neutral-900 px-6 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit diagnostic'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (!item) {
    return <p className="text-neutral-500">{error ?? 'Loading…'}</p>;
  }

  const q = item.question;
  const canAnswer = q.format === 'mcq' ? selected !== null : numeric.trim() !== '';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          Question {item.position} of {item.total}
        </span>
        <span className="font-mono">{fmtElapsed(elapsed)}</span>
        <span>expected ~{Math.round(q.expectedTimeMs / 1000)}s</span>
      </div>
      <div className="h-1.5 w-full rounded bg-neutral-200">
        <div
          className="h-1.5 rounded bg-neutral-900"
          style={{ width: `${(item.position / item.total) * 100}%` }}
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <Katex text={q.stem} className="text-base leading-7" />

        {q.format === 'mcq' ? (
          <div className="mt-5 flex flex-col gap-2" role="radiogroup" aria-label="Answer options">
            {q.options.map((o) => (
              <label
                key={o.id}
                className={`flex cursor-pointer items-center gap-3 rounded border px-4 py-3 text-sm ${
                  selected === o.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
                }`}
              >
                <input
                  type="radio"
                  name="answer"
                  value={o.id}
                  checked={selected === o.id}
                  onChange={() => setSelected(o.id)}
                  className="accent-neutral-900"
                />
                <Katex text={o.text} />
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <label htmlFor="numeric-answer" className="text-sm text-neutral-600">
              Your answer
            </label>
            <input
              id="numeric-answer"
              type="text"
              inputMode="decimal"
              value={numeric}
              onChange={(e) => setNumeric(e.target.value)}
              placeholder="e.g. 42 or 3.14"
              className="mt-1 w-48 rounded border border-neutral-300 px-3 py-2 font-mono"
            />
            {q.answerFormat === 'integer' && (
              <p className="mt-1 text-xs text-neutral-500">Whole number expected.</p>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => void doPause()}
          disabled={submitting}
          className="text-sm text-neutral-500 underline disabled:opacity-50"
        >
          Pause (once)
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void answer(true)}
            className="rounded border border-neutral-300 px-4 py-2 text-sm"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void next()}
            className="rounded bg-neutral-900 px-6 py-2 text-sm text-white disabled:opacity-50"
          >
            {item.answered ? 'Next' : canAnswer ? 'Answer & next' : 'Skip & next'}
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-400">
        Answers are marked on the server; correctness is revealed after you submit.
      </p>
    </div>
  );
}
