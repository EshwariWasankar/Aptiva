'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Katex } from '../../../../components/Katex';
import {
  adminListQuestions,
  type Question,
  type QuestionListResult,
  type TopicNode,
  adminListTopics,
} from '../../../../lib/content';
import { ApiError } from '../../../../lib/apiClient';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-neutral-200 text-neutral-700',
  reviewed: 'bg-sky-100 text-sky-800',
  published: 'bg-emerald-100 text-emerald-800',
  retired: 'bg-neutral-100 text-neutral-400 line-through',
};

export default function QuestionsPage() {
  const [data, setData] = useState<QuestionListResult | null>(null);
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: '',
    topicId: '',
    status: '',
    format: '',
    pool: '',
    difficulty: '',
    page: 1,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListQuestions({
        q: filters.q || undefined,
        topicId: filters.topicId || undefined,
        status: filters.status || undefined,
        format: filters.format || undefined,
        pool: filters.pool || undefined,
        difficulty: filters.difficulty || undefined,
        page: filters.page,
        pageSize: 20,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminListTopics()
      .then(setTopics)
      .catch(() => setTopics([]));
  }, []);

  const topicOptions = topics.filter((t) => t.level === 'topic');
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Questions</h1>
        <Link
          href="/admin/questions/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          New question
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search stems…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          className="rounded border px-3 py-1.5 text-sm"
        />
        <select
          value={filters.topicId}
          onChange={(e) => setFilters((f) => ({ ...f, topicId: e.target.value, page: 1 }))}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All topics</option>
          {topicOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {['draft', 'reviewed', 'published', 'retired'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.format}
          onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value, page: 1 }))}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All formats</option>
          <option value="mcq">MCQ</option>
          <option value="numerical">Numerical</option>
        </select>
        <select
          value={filters.pool}
          onChange={(e) => setFilters((f) => ({ ...f, pool: e.target.value, page: 1 }))}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All pools</option>
          {['diagnostic', 'practice', 'reassessment'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filters.difficulty}
          onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value, page: 1 }))}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">Any difficulty</option>
          {[1, 2, 3].map((d) => (
            <option key={d} value={d}>
              Band {d}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-neutral-500">No questions match the filters.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2 pr-4">Stem</th>
              <th className="py-2 pr-4">Topic</th>
              <th className="py-2 pr-4">Format</th>
              <th className="py-2 pr-4">Pool</th>
              <th className="py-2 pr-4">Diff</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((q: Question) => (
              <tr key={q.id} className="border-b align-top hover:bg-neutral-50">
                <td className="max-w-md py-2 pr-4">
                  <Link href={`/admin/questions/${q.id}`} className="hover:underline">
                    <Katex text={q.stem.slice(0, 140) + (q.stem.length > 140 ? '…' : '')} />
                  </Link>
                </td>
                <td className="py-2 pr-4">{q.topic.name}</td>
                <td className="py-2 pr-4">{q.format}</td>
                <td className="py-2 pr-4">{q.pool}</td>
                <td className="py-2 pr-4">{q.difficultyPrior}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[q.status] ?? ''}`}>
                    {q.status}
                  </span>
                </td>
                <td className="py-2 text-neutral-500">{q.sourceName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {data.page} of {totalPages} · {data.total} questions
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
