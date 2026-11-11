'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Katex } from '../../../../components/Katex';
import { ApiError } from '../../../../lib/apiClient';
import { adminListQuestions, adminReviewQuestion, type Question } from '../../../../lib/content';

/** P-24 — review queue: draft/reviewed items awaiting a decision (E-061). */
export default function ReviewPage() {
  const [items, setItems] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'draft' | 'reviewed'>('draft');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListQuestions({ status, pageSize: 50 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(q: Question, decision: 'approve' | 'reject') {
    setBusy(q.id);
    setError(null);
    try {
      await adminReviewQuestion(q.id, {
        decision,
        notes: notes[q.id]?.trim() || null,
      });
      setItems((rows) => rows.filter((r) => r.id !== q.id));
      setTotal((t) => t - 1);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Review failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <div className="flex gap-2 text-sm">
          {(['draft', 'reviewed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded border px-3 py-1 ${
                status === s ? 'bg-neutral-900 text-white' : 'bg-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        {total} item{total === 1 ? '' : 's'} awaiting review. Approvals from two distinct reviewers
        are required before diagnostic and reassessment items can be published.
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-neutral-500">Queue is empty.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((q) => (
            <li key={q.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/questions/${q.id}`} className="font-medium hover:underline">
                    <Katex text={q.stem.slice(0, 300)} />
                  </Link>
                  <div className="mt-1 text-xs text-neutral-500">
                    {q.format} · {q.topic.name} · band {q.difficultyPrior} · pool {q.pool} ·{' '}
                    {q.sourceName ?? 'no source'}
                    {q.options.length > 0 &&
                      ` · ${q.options.filter((o) => o.isCorrect).length} correct option(s)`}
                  </div>
                  {q.reviews.length > 0 && (
                    <div className="mt-1 text-xs text-neutral-500">
                      {q.reviews.length} prior review(s):{' '}
                      {q.reviews.map((r) => `${r.reviewer.email}:${r.decision}`).join(', ')}
                    </div>
                  )}
                  <input
                    className="mt-2 w-full rounded border px-2 py-1 text-sm"
                    placeholder="Review notes (optional)"
                    value={notes[q.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [q.id]: e.target.value }))}
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === q.id}
                    onClick={() => void decide(q, 'approve')}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === q.id}
                    onClick={() => void decide(q, 'reject')}
                    className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
