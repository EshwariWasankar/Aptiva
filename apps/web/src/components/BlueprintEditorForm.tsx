'use client';

import { useState } from 'react';
import { ApiError } from '../lib/apiClient';
import type {
  BlueprintBody,
  BlueprintSectionInput,
  BlueprintSourceInput,
  BlueprintWeightInput,
  TopicNode,
} from '../lib/content';

const SOURCE_TYPES = [
  'official',
  'public',
  'candidate_reported',
  'pattern_inferred',
  'assumption',
] as const;
const CONFIDENCES = ['low', 'medium', 'high'] as const;

interface Props {
  topics: TopicNode[];
  /** When set, submits a new version; otherwise a new assessment (needs slug/company/name). */
  assessmentId?: string;
  initial?: BlueprintBody | undefined;
  onSubmit: (
    body: BlueprintBody & { slug?: string; company?: string; name?: string },
  ) => Promise<void>;
  onCancel: () => void;
}

interface WeightRow extends BlueprintWeightInput {
  key: string;
}
interface SectionRow extends Omit<BlueprintSectionInput, 'weights'> {
  key: string;
  weights: WeightRow[];
}
interface SourceRow extends BlueprintSourceInput {
  key: string;
}

let seq = 0;
const nid = () => `r${++seq}`;

function toRows(initial?: BlueprintBody) {
  const sources: SourceRow[] = (initial?.sources ?? []).map((s) => ({ ...s, key: nid() }));
  const sections: SectionRow[] = (initial?.sections ?? []).map((s) => ({
    key: nid(),
    name: s.name,
    orderNo: s.orderNo,
    durationMin: s.durationMin ?? null,
    questionCountMin: s.questionCountMin ?? null,
    questionCountMax: s.questionCountMax ?? null,
    negativeMarking: s.negativeMarking ?? null,
    formatMix: s.formatMix ?? null,
    ...(s.sourceIndex !== undefined ? { sourceIndex: s.sourceIndex } : {}),
    weights: s.weights.map((w) => ({
      ...w,
      key: nid(),
      ...(w.sourceIndex !== undefined ? { sourceIndex: w.sourceIndex } : {}),
    })),
  }));
  return { sources, sections };
}

export function BlueprintEditorForm({ topics, assessmentId, initial, onSubmit, onCancel }: Props) {
  const topicOptions = topics.filter((t) => t.level === 'topic');
  const [slug, setSlug] = useState('');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [{ sources, sections }, setRows] = useState(() => toRows(initial));
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? '');
  const [lastVerifiedAt, setLastVerifiedAt] = useState(initial?.lastVerifiedAt ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const patch = (fn: (d: { sources: SourceRow[]; sections: SectionRow[] }) => void) =>
    setRows((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });

  const inputCls = 'w-full rounded border px-2 py-1 text-sm';

  async function submit() {
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const body: BlueprintBody = {
        ...(validFrom ? { validFrom } : {}),
        lastVerifiedAt: lastVerifiedAt || null,
        sources: sources.map((s) => ({
          sourceType: s.sourceType,
          reference: s.reference || null,
          confidence: s.confidence,
          lastVerifiedAt: s.lastVerifiedAt || null,
        })),
        sections: sections.map((s) => ({
          name: s.name,
          orderNo: s.orderNo,
          durationMin: s.durationMin ?? null,
          questionCountMin: s.questionCountMin ?? null,
          questionCountMax: s.questionCountMax ?? null,
          negativeMarking: s.negativeMarking ?? null,
          formatMix: s.formatMix ?? null,
          ...(s.sourceIndex !== undefined ? { sourceIndex: s.sourceIndex } : {}),
          weights: s.weights.map((w) => ({
            topicSlug: w.topicSlug,
            share: w.share,
            difficultyBand: w.difficultyBand ?? null,
            paceSeconds: w.paceSeconds ?? null,
            ...(w.sourceIndex !== undefined ? { sourceIndex: w.sourceIndex } : {}),
          })),
        })),
      };
      await onSubmit({
        ...body,
        ...(!assessmentId ? { slug, company, name } : {}),
      });
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

  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-white p-5">
      {!assessmentId && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <input
              className={inputCls}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="tcs-nqt"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Company</label>
            <input
              className={inputCls}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Assessment name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Valid from</label>
          <input
            type="date"
            className={inputCls}
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Last verified</label>
          <input
            type="date"
            className={inputCls}
            value={lastVerifiedAt}
            onChange={(e) => setLastVerifiedAt(e.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Sources</h3>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() =>
              patch((d) =>
                d.sources.push({
                  key: nid(),
                  sourceType: 'assumption',
                  reference: '',
                  confidence: 'low',
                }),
              )
            }
          >
            Add source
          </button>
        </div>
        {sources.map((s, i) => (
          <div key={s.key} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-5">
            <select
              className={inputCls}
              value={s.sourceType}
              onChange={(e) =>
                patch((d) => {
                  d.sources[i]!.sourceType = e.target.value as SourceRow['sourceType'];
                })
              }
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className={`${inputCls} sm:col-span-2`}
              placeholder="Reference (URL, doc, note)"
              value={s.reference ?? ''}
              onChange={(e) =>
                patch((d) => {
                  d.sources[i]!.reference = e.target.value;
                })
              }
            />
            <select
              className={inputCls}
              value={s.confidence}
              onChange={(e) =>
                patch((d) => {
                  d.sources[i]!.confidence = e.target.value as SourceRow['confidence'];
                })
              }
            >
              {CONFIDENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border px-2 text-xs"
              onClick={() => patch((d) => d.sources.splice(i, 1))}
              disabled={sources.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <p className="text-xs text-neutral-500">
          Fields reference sources by index: source 0 is the first row above.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Sections</h3>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() =>
              patch((d) =>
                d.sections.push({
                  key: nid(),
                  name: '',
                  orderNo: d.sections.length + 1,
                  durationMin: null,
                  questionCountMin: null,
                  questionCountMax: null,
                  negativeMarking: null,
                  formatMix: null,
                  sourceIndex: 0,
                  weights: [],
                }),
              )
            }
          >
            Add section
          </button>
        </div>

        {sections.map((s, si) => (
          <div key={s.key} className="flex flex-col gap-3 rounded border p-3">
            <div className="grid gap-2 sm:grid-cols-6">
              <input
                className={`${inputCls} sm:col-span-2`}
                placeholder="Section name"
                value={s.name}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.name = e.target.value;
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Order"
                value={s.orderNo}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.orderNo = Number(e.target.value);
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Minutes"
                value={s.durationMin ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.durationMin =
                      e.target.value === '' ? null : Number(e.target.value);
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Q min"
                value={s.questionCountMin ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.questionCountMin =
                      e.target.value === '' ? null : Number(e.target.value);
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                placeholder="Q max"
                value={s.questionCountMax ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.questionCountMax =
                      e.target.value === '' ? null : Number(e.target.value);
                  })
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                className={inputCls}
                type="number"
                step="0.05"
                placeholder="Negative marking (blank = none/unknown)"
                value={s.negativeMarking ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.negativeMarking =
                      e.target.value === '' ? null : Number(e.target.value);
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                step="0.05"
                placeholder="MCQ share (0–1)"
                value={s.formatMix?.mcq ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    const cur = d.sections[si]!.formatMix ?? { mcq: 0, numerical: 0 };
                    d.sections[si]!.formatMix = v === null ? null : { ...cur, mcq: v };
                  })
                }
              />
              <input
                className={inputCls}
                type="number"
                step="0.05"
                placeholder="Numerical share (0–1)"
                value={s.formatMix?.numerical ?? ''}
                onChange={(e) =>
                  patch((d) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    const cur = d.sections[si]!.formatMix ?? { mcq: 0, numerical: 0 };
                    d.sections[si]!.formatMix = v === null ? null : { ...cur, numerical: v };
                  })
                }
              />
              <select
                className={inputCls}
                value={s.sourceIndex ?? 0}
                onChange={(e) =>
                  patch((d) => {
                    d.sections[si]!.sourceIndex = Number(e.target.value);
                  })
                }
              >
                {sources.map((_, i) => (
                  <option key={i} value={i}>
                    Section source: #{i}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-600">
                  Topic weights (shares must sum to 1)
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs"
                  onClick={() =>
                    patch((d) =>
                      d.sections[si]!.weights.push({
                        key: nid(),
                        topicSlug: topicOptions[0]?.slug ?? '',
                        share: 1,
                        difficultyBand: null,
                        paceSeconds: null,
                        sourceIndex: 0,
                      }),
                    )
                  }
                >
                  Add weight
                </button>
              </div>
              {s.weights.map((w, wi) => (
                <div key={w.key} className="mb-1 grid grid-cols-12 items-center gap-1">
                  <select
                    className={`${inputCls} col-span-4`}
                    value={w.topicSlug}
                    onChange={(e) =>
                      patch((d) => {
                        d.sections[si]!.weights[wi]!.topicSlug = e.target.value;
                      })
                    }
                  >
                    {topicOptions.map((t) => (
                      <option key={t.id} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputCls} col-span-2`}
                    type="number"
                    step="0.01"
                    placeholder="Share"
                    value={w.share}
                    onChange={(e) =>
                      patch((d) => {
                        d.sections[si]!.weights[wi]!.share = Number(e.target.value);
                      })
                    }
                  />
                  <input
                    className={`${inputCls} col-span-2`}
                    type="number"
                    placeholder="Band"
                    value={w.difficultyBand ?? ''}
                    onChange={(e) =>
                      patch((d) => {
                        d.sections[si]!.weights[wi]!.difficultyBand =
                          e.target.value === '' ? null : Number(e.target.value);
                      })
                    }
                  />
                  <input
                    className={`${inputCls} col-span-2`}
                    type="number"
                    placeholder="Pace s"
                    value={w.paceSeconds ?? ''}
                    onChange={(e) =>
                      patch((d) => {
                        d.sections[si]!.weights[wi]!.paceSeconds =
                          e.target.value === '' ? null : Number(e.target.value);
                      })
                    }
                  />
                  <select
                    className={`${inputCls} col-span-1`}
                    value={w.sourceIndex ?? 0}
                    onChange={(e) =>
                      patch((d) => {
                        d.sections[si]!.weights[wi]!.sourceIndex = Number(e.target.value);
                      })
                    }
                  >
                    {sources.map((_, i) => (
                      <option key={i} value={i}>
                        #{i}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="col-span-1 rounded border px-1 text-xs"
                    onClick={() => patch((d) => d.sections[si]!.weights.splice(wi, 1))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="self-start rounded border px-2 py-0.5 text-xs text-red-700"
              onClick={() => patch((d) => d.sections.splice(si, 1))}
              disabled={sections.length <= 1}
            >
              Remove section
            </button>
          </div>
        ))}
      </div>

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
          onClick={() => void submit()}
          disabled={
            saving ||
            sources.length === 0 ||
            sections.length === 0 ||
            (!assessmentId && (!slug || !company || !name))
          }
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : assessmentId ? 'Publish new version' : 'Create blueprint'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-5 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
