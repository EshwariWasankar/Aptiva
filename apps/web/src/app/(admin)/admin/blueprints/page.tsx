'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProvenanceBadge } from '../../../../components/ProvenanceBadge';
import { BlueprintEditorForm } from '../../../../components/BlueprintEditorForm';
import { ApiError } from '../../../../lib/apiClient';
import {
  adminAddBlueprintVersion,
  adminCreateBlueprint,
  adminGetBlueprint,
  adminListBlueprints,
  adminListTopics,
  type BlueprintBody,
  type BlueprintDetail,
  type BlueprintListItem,
  type TopicNode,
} from '../../../../lib/content';
import { draftBlueprintFromRecords } from '../../../../lib/import';

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'version'; assessmentId: string };

export default function BlueprintsPage() {
  const [items, setItems] = useState<BlueprintListItem[]>([]);
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [detail, setDetail] = useState<BlueprintDetail | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, t] = await Promise.all([adminListBlueprints(), adminListTopics()]);
      setItems(b);
      setTopics(t);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setError(null);
    try {
      setDetail(await adminGetBlueprint(id));
      setMode({ kind: 'list' });
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Failed to load blueprint');
    }
  }

  async function submit(body: BlueprintBody & { slug?: string; company?: string; name?: string }) {
    if (mode.kind === 'version') {
      await adminAddBlueprintVersion(mode.assessmentId, body);
      await openDetail(mode.assessmentId);
      await load();
      setMode({ kind: 'list' });
    } else {
      if (!body.slug || !body.company || !body.name) return;
      const created = await adminCreateBlueprint({
        ...body,
        slug: body.slug,
        company: body.company,
        name: body.name,
      });
      setDetail(created);
      await load();
      setMode({ kind: 'list' });
    }
  }

  const [draftCompany, setDraftCompany] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);

  async function draftFromRecords() {
    if (!draftCompany.trim()) return;
    setDraftBusy(true);
    setError(null);
    try {
      await draftBlueprintFromRecords({ company: draftCompany.trim() });
      setDraftCompany('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Draft failed');
    } finally {
      setDraftBusy(false);
    }
  }

  const currentVersion = detail?.versions.find((v) => v.isCurrent) ?? detail?.versions[0];

  if (mode.kind === 'new') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">New blueprint</h1>
        <BlueprintEditorForm
          topics={topics}
          onSubmit={submit}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </div>
    );
  }

  if (mode.kind === 'version' && detail) {
    // Prefill from the current version so admins edit a copy, not a blank.
    const v = currentVersion;
    const sourceIndex = new Map(v?.sources.map((s, i) => [s.id, i]) ?? []);
    const idx = (s: { id: string } | null) => (s ? sourceIndex.get(s.id) : undefined);
    const initial: BlueprintBody | undefined = v
      ? {
          validFrom: v.validFrom.slice(0, 10),
          lastVerifiedAt: v.lastVerifiedAt?.slice(0, 10) ?? null,
          sources: v.sources.map((s) => ({
            sourceType: s.sourceType as BlueprintBody['sources'][number]['sourceType'],
            reference: s.reference,
            confidence: s.confidence as BlueprintBody['sources'][number]['confidence'],
            lastVerifiedAt: s.lastVerifiedAt?.slice(0, 10) ?? null,
          })),
          sections: v.sections.map((s) => ({
            name: s.name,
            orderNo: s.orderNo,
            durationMin: s.durationMin,
            questionCountMin: s.questionCountMin,
            questionCountMax: s.questionCountMax,
            negativeMarking: s.negativeMarking != null ? Number(s.negativeMarking) : null,
            formatMix: s.formatMix
              ? { mcq: s.formatMix.mcq ?? 0, numerical: s.formatMix.numerical ?? 0 }
              : null,
            sourceIndex: idx(s.source),
            weights: s.weights.map((w) => ({
              topicSlug: w.topic.slug,
              share: w.share,
              difficultyBand: w.difficultyBand,
              paceSeconds: w.paceSeconds,
              sourceIndex: idx(w.source),
            })),
          })),
        }
      : undefined;
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">New version — {detail.name}</h1>
        <BlueprintEditorForm
          topics={topics}
          assessmentId={mode.assessmentId}
          initial={initial}
          onSubmit={submit}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blueprints</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Draft from records: company"
            value={draftCompany}
            onChange={(e) => setDraftCompany(e.target.value)}
            className="w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={draftBusy || !draftCompany.trim()}
            onClick={() => void draftFromRecords()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Draft from records
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'new' })}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            New blueprint
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-neutral-500">
                    {a.company} · slug {a.slug}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => void openDetail(a.id)}
                      className={`rounded border px-2 py-1 text-xs ${
                        v.isCurrent ? 'border-emerald-500 text-emerald-700' : 'text-neutral-500'
                      }`}
                    >
                      v{v.version}
                      {v.isCurrent ? ' · current' : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      void openDetail(a.id).then(() =>
                        setMode({ kind: 'version', assessmentId: a.id }),
                      );
                    }}
                    className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
                  >
                    New version
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {detail && currentVersion && (
        <div className="rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold">
            {detail.name}{' '}
            <span className="text-sm font-normal text-neutral-500">
              v{currentVersion.version}
              {currentVersion.lastVerifiedAt
                ? ` · verified ${new Date(currentVersion.lastVerifiedAt).toLocaleDateString()}`
                : ' · unverified'}
            </span>
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {currentVersion.sections.map((s) => (
              <div key={s.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {s.orderNo}. {s.name}
                  </span>
                  <ProvenanceBadge source={s.source} />
                </div>
                <div className="mt-2 grid gap-1 text-sm text-neutral-600 sm:grid-cols-2">
                  <div>
                    {s.durationMin ?? '?'} min · {s.questionCountMin ?? '?'}–
                    {s.questionCountMax ?? '?'} questions
                    {s.negativeMarking != null ? ` · −${s.negativeMarking} negative` : ''}
                  </div>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {s.weights.map((w) => (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {w.topic.name} — {Math.round(w.share * 100)}%
                        {w.difficultyBand ? ` · band ${w.difficultyBand}` : ''}
                        {w.paceSeconds ? ` · ${w.paceSeconds}s` : ''}
                      </span>
                      <ProvenanceBadge source={w.source} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <h3 className="mt-4 text-sm font-medium text-neutral-700">Version history</h3>
          <ul className="mt-1 text-sm text-neutral-600">
            {detail.versions.map((v) => (
              <li key={v.id}>
                v{v.version} — {v.isCurrent ? 'current' : 'superseded'} · valid from{' '}
                {new Date(v.validFrom).toLocaleDateString()} · {v.sections.length} sections
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
