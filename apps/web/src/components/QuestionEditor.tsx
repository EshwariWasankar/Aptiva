'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Katex } from './Katex';
import { ApiError } from '../lib/apiClient';
import {
  adminCreateQuestion,
  adminUpdateQuestion,
  type Question,
  type QuestionOptionInput,
  type QuestionUpsert,
  type TopicNode,
} from '../lib/content';

interface Props {
  question: Question | null; // null → create mode
  topics: TopicNode[];
}

interface OptionRow {
  key: string;
  id?: string;
  text: string;
  isCorrect: boolean;
  trapTag: string;
}

let optSeq = 0;
function blankOption(correct = false): OptionRow {
  optSeq += 1;
  return { key: `opt-${optSeq}`, text: '', isCorrect: correct, trapTag: '' };
}

export function QuestionEditor({ question, topics }: Props) {
  const router = useRouter();
  const topicOptions = topics.filter((t) => t.level === 'topic');

  const [form, setForm] = useState<QuestionUpsert>(() => ({
    topicId: question?.topic.id ?? '',
    format: question?.format ?? 'mcq',
    stem: question?.stem ?? '',
    solution: question?.solution ?? '',
    difficultyPrior: question?.difficultyPrior ?? 2,
    expectedTimeMs: question?.expectedTimeMs ?? 90_000,
    pool: (question?.pool as QuestionUpsert['pool']) ?? 'practice',
    status: (question?.status as QuestionUpsert['status']) ?? 'draft',
    sourceName: question?.sourceName ?? '',
    author: question?.author ?? '',
    numericAnswer: question?.numericAnswer ?? '',
    answerFormat: (question?.answerFormat as QuestionUpsert['answerFormat']) ?? null,
    decimalPlaces: question?.decimalPlaces ?? null,
    tolerance: question?.tolerance ?? '',
  }));
  const [options, setOptions] = useState<OptionRow[]>(() =>
    question?.options?.length
      ? question.options.map((o) => ({
          key: o.id,
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
          trapTag: o.trapTag ?? '',
        }))
      : [blankOption(true), blankOption(), blankOption(), blankOption()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const set = <K extends keyof QuestionUpsert>(key: K, value: QuestionUpsert[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const payload = (): QuestionUpsert => ({
    ...form,
    ...(form.format === 'mcq'
      ? {
          options: options
            .filter((o) => o.text.trim() !== '')
            .map((o, i): QuestionOptionInput => ({
              ...(o.id ? { id: o.id } : {}),
              text: o.text,
              isCorrect: o.isCorrect,
              trapTag: o.trapTag || null,
              orderNo: i,
            })),
        }
      : {}),
    numericAnswer:
      form.numericAnswer === '' || form.numericAnswer == null ? null : form.numericAnswer,
    tolerance: form.tolerance === '' || form.tolerance == null ? null : form.tolerance,
  });

  async function save() {
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const body = payload();
      if (question) {
        await adminUpdateQuestion(question.id, body);
      } else {
        const created = await adminCreateQuestion(body);
        router.replace(`/admin/questions/${created.id}`);
        return;
      }
      setError(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(`${e.code}: ${e.message}`);
        const det = e.details as { issues?: string[] } | undefined;
        if (det?.issues) setIssues(det.issues);
      } else {
        setError('Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded border px-3 py-1.5 text-sm';
  const labelCls = 'mb-1 block text-sm font-medium text-neutral-700';

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="q-topic">
            Topic
          </label>
          <select
            id="q-topic"
            className={inputCls}
            value={form.topicId}
            onChange={(e) => set('topicId', e.target.value)}
          >
            <option value="">Select topic…</option>
            {topicOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Format</label>
          <div className="flex gap-2">
            {(['mcq', 'numerical'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set('format', f)}
                className={`rounded border px-4 py-1.5 text-sm ${
                  form.format === f ? 'bg-neutral-900 text-white' : 'bg-white'
                }`}
              >
                {f === 'mcq' ? 'Multiple choice' : 'Numerical'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Difficulty band (1–3)</label>
          <select
            className={inputCls}
            value={form.difficultyPrior}
            onChange={(e) => set('difficultyPrior', Number(e.target.value))}
          >
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Pool</label>
          <select
            className={inputCls}
            value={form.pool}
            onChange={(e) => set('pool', e.target.value as QuestionUpsert['pool'])}
          >
            {['diagnostic', 'practice', 'reassessment'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Expected time (seconds)</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={Math.round(form.expectedTimeMs / 1000)}
            onChange={(e) => set('expectedTimeMs', Number(e.target.value) * 1000)}
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={form.status}
            onChange={(e) => set('status', e.target.value as QuestionUpsert['status'])}
          >
            {['draft', 'reviewed', 'published', 'retired'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="q-source">
            Source (required to publish)
          </label>
          <input
            id="q-source"
            className={inputCls}
            value={form.sourceName ?? ''}
            onChange={(e) => set('sourceName', e.target.value)}
            placeholder="e.g. DS-01 repo, team-authored"
          />
        </div>
        <div>
          <label className={labelCls}>Author</label>
          <input
            className={inputCls}
            value={form.author ?? ''}
            onChange={(e) => set('author', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="q-stem">
          Stem (HTML + $LaTeX$ allowed)
        </label>
        <textarea
          id="q-stem"
          className={`${inputCls} min-h-28 font-mono text-xs`}
          value={form.stem}
          onChange={(e) => set('stem', e.target.value)}
        />
        {form.stem && (
          <div className="mt-2 rounded border bg-neutral-50 p-3 text-sm">
            <div className="mb-1 text-xs text-neutral-400">Preview</div>
            <Katex text={form.stem} />
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Solution / explanation (optional)</label>
        <textarea
          className={`${inputCls} min-h-20 font-mono text-xs`}
          value={form.solution ?? ''}
          onChange={(e) => set('solution', e.target.value)}
        />
      </div>

      {form.format === 'mcq' ? (
        <div>
          <label className={labelCls}>Options (exactly one correct to publish)</label>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-option"
                  checked={o.isCorrect}
                  onChange={() =>
                    setOptions((rows) => rows.map((r, j) => ({ ...r, isCorrect: j === i })))
                  }
                  title="Mark correct"
                />
                <input
                  className={`${inputCls} flex-1`}
                  placeholder={`Option ${i + 1}`}
                  value={o.text}
                  onChange={(e) =>
                    setOptions((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)),
                    )
                  }
                />
                <input
                  className={`${inputCls} w-36`}
                  placeholder="trap tag"
                  value={o.trapTag}
                  onChange={(e) =>
                    setOptions((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, trapTag: e.target.value } : r)),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => setOptions((rows) => rows.filter((_, j) => j !== i))}
                  disabled={options.length <= 2}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 rounded border px-3 py-1 text-sm"
            onClick={() => setOptions((rows) => [...rows, blankOption()])}
          >
            Add option
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className={labelCls} htmlFor="q-numanswer">
              Numeric answer
            </label>
            <input
              id="q-numanswer"
              className={inputCls}
              value={form.numericAnswer ?? ''}
              onChange={(e) => set('numericAnswer', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Answer format</label>
            <select
              className={inputCls}
              value={form.answerFormat ?? ''}
              onChange={(e) =>
                set('answerFormat', (e.target.value || null) as QuestionUpsert['answerFormat'])
              }
            >
              <option value="">any</option>
              <option value="integer">integer</option>
              <option value="decimal">decimal</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Decimal places</label>
            <input
              type="number"
              min={0}
              max={10}
              className={inputCls}
              value={form.decimalPlaces ?? ''}
              onChange={(e) =>
                set('decimalPlaces', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className={labelCls}>Tolerance</label>
            <input
              className={inputCls}
              value={form.tolerance ?? ''}
              onChange={(e) => set('tolerance', e.target.value)}
              placeholder="0 = exact"
            />
          </div>
        </div>
      )}

      {question && question.reviews.length > 0 && (
        <div>
          <label className={labelCls}>Reviews</label>
          <ul className="flex flex-col gap-1 text-sm">
            {question.reviews.map((r) => (
              <li key={r.id} className="rounded border px-3 py-2">
                <span className={r.decision === 'approve' ? 'text-emerald-700' : 'text-red-700'}>
                  {r.decision}
                </span>{' '}
                by {r.reviewer.email} · {new Date(r.createdAt).toLocaleString()}
                {r.notes ? ` — ${r.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          {issues.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !form.topicId || !form.stem.trim()}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : question ? 'Save changes' : 'Create question'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/questions')}
          className="rounded-md border px-5 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
