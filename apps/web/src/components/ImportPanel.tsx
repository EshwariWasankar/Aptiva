'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminListBlueprints, adminListTopics, type TopicNode } from '../lib/content';
import {
  draftBlueprintFromRecords,
  getCoverage,
  listCompanyPatterns,
  listImportBatches,
  mapPattern,
  recomputeFitTags,
  reverseImportBatch,
  runCompanyImport,
  runImport,
  type CompanyImportResult,
  type CoverageReport,
  type ImportBatch,
  type ImportRunResult,
  type PatternList,
  type PatternRecord,
} from '../lib/import';
import { ApiError } from '../lib/apiClient';

type Tab = 'questions' | 'company' | 'coverage';

const inputCls =
  'w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none';
const btnCls =
  'rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';
const btnGhost =
  'rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50';

function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof ApiError ? `${error.code}: ${error.message}` : String(error);
  return <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg}</p>;
}

// ------------------------------------------------------- tab 1: sources

function QuestionImportTab() {
  const [source, setSource] = useState<'ds-01' | 'ds-03'>('ds-01');
  const [ref, setRef] = useState('');
  const [report, setReport] = useState<ImportRunResult | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(() => {
    listImportBatches()
      .then(setBatches)
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  const doRun = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await runImport({
        source,
        dryRun,
        ...(ref.trim() ? { ref: ref.trim() } : {}),
      });
      setReport(res);
      if (!dryRun) refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const doReverse = async (id: string) => {
    if (!window.confirm('Delete all draft questions from this batch?')) return;
    setError(null);
    try {
      await reverseImportBatch(id);
      refresh();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">Run an import</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Source
            <select
              className={inputCls}
              value={source}
              onChange={(e) => setSource(e.target.value as 'ds-01' | 'ds-03')}
            >
              <option value="ds-01">DS-01 Aptitude-For-Placements (GitHub)</option>
              <option value="ds-03">DS-03 GSM8K (numerical)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Pinned ref (optional — branch, tag or commit)
            <input
              className={inputCls}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="main"
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button className={btnGhost} disabled={busy} onClick={() => void doRun(true)}>
            Dry run
          </button>
          <button
            className={btnCls}
            disabled={busy || !report?.dryRun}
            onClick={() => void doRun(false)}
          >
            {busy ? 'Working…' : 'Confirm import (creates drafts)'}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Dry run fetches the pinned source and reports accepted / rejected / duplicate rows without
          writing. Real import creates draft questions linked to an import batch — nothing is
          published.
        </p>
      </section>

      <ErrorBox error={error} />

      {report && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-lg font-semibold">Import report</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-neutral-500">Files</dt>
              <dd>{report.filesSeen}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Parsed</dt>
              <dd>{report.parsed}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Accepted</dt>
              <dd className="font-semibold">{report.accepted}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Rejected</dt>
              <dd>{report.rejected}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Duplicates</dt>
              <dd>{report.duplicates}</dd>
            </div>
          </dl>
          <p className="mt-1 break-all text-xs text-neutral-500">{report.sourceRef}</p>
          {report.unmappedTopics.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold">Unmapped topics (need taxonomy/synonyms)</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
                {report.unmappedTopics.map((u) => (
                  <li key={u.phrase}>
                    {u.phrase} ×{u.count}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.rejectedSample.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Rejected rows ({report.rejected})
              </summary>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="pr-2">File</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rejectedSample.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="pr-2 font-mono">{r.sourcePath}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">Import batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-neutral-500">No batches yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-3">Source</th>
                <th className="pr-3">Ref</th>
                <th className="pr-3">Accepted</th>
                <th className="pr-3">Rejected</th>
                <th className="pr-3">Dup</th>
                <th className="pr-3">Drafts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-neutral-100">
                  <td className="pr-3">{b.sourceName}</td>
                  <td className="max-w-48 truncate pr-3 font-mono text-xs" title={b.sourceRef}>
                    {b.sourceRef}
                  </td>
                  <td className="pr-3">{b.accepted}</td>
                  <td className="pr-3">{b.rejected}</td>
                  <td className="pr-3">{b.duplicates}</td>
                  <td className="pr-3">{b.questionCount}</td>
                  <td className="text-right">
                    {b.questionCount > 0 && !b.reversedAt && (
                      <button className={btnGhost} onClick={() => void doReverse(b.id)}>
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------- tab 2: company data

function CompanyTab() {
  const [topics, setTopics] = useState<TopicNode[]>([]);
  const [patterns, setPatterns] = useState<PatternList | null>(null);
  const [companyFilter, setCompanyFilter] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(true);
  const [dsSource, setDsSource] = useState<'ds-07' | 'ds-08'>('ds-07');
  const [companyName, setCompanyName] = useState('');
  const [companyReport, setCompanyReport] = useState<CompanyImportResult | null>(null);
  const [draftCompany, setDraftCompany] = useState('');
  const [blueprints, setBlueprints] = useState<{ id: string; company: string }[]>([]);
  const [fitResult, setFitResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mapSlug, setMapSlug] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    listCompanyPatterns({
      ...(companyFilter ? { company: companyFilter } : {}),
      ...(unmappedOnly ? { unmapped: true } : {}),
    })
      .then(setPatterns)
      .catch(() => undefined);
  }, [companyFilter, unmappedOnly]);

  useEffect(() => {
    adminListTopics()
      .then(setTopics)
      .catch(() => undefined);
    adminListBlueprints()
      .then((b) => setBlueprints(b.map((x) => ({ id: x.id, company: x.company }))))
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  const doCompanyImport = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await runCompanyImport({
        source: dsSource,
        dryRun,
        ...(companyName.trim() ? { company: companyName.trim() } : {}),
      });
      setCompanyReport(res);
      if (!dryRun) refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const doMap = async (rec: PatternRecord, slug: string) => {
    setError(null);
    try {
      await mapPattern(rec.id, { topicSlug: slug, addSynonym: true });
      refresh();
    } catch (e) {
      setError(e);
    }
  };

  const doReject = async (rec: PatternRecord) => {
    setError(null);
    try {
      await mapPattern(rec.id, { reject: true });
      refresh();
    } catch (e) {
      setError(e);
    }
  };

  const doDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      await draftBlueprintFromRecords({ company: draftCompany.trim() });
      setCompanyReport(null);
      window.alert(`Draft blueprint created for ${draftCompany}. Review it under Blueprints.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const doFit = async (assessmentId: string) => {
    setError(null);
    try {
      const r = await recomputeFitTags(assessmentId);
      setFitResult(`Recomputed ${r.tags} fit tags across ${r.sections} sections.`);
    } catch (e) {
      setError(e);
    }
  };

  const topicOptions = topics.filter((t) => t.level === 'topic' || t.level === 'subtopic');

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">Company pattern extraction</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Source
            <select
              className={inputCls}
              value={dsSource}
              onChange={(e) => setDsSource(e.target.value as 'ds-07' | 'ds-08')}
            >
              <option value="ds-07">DS-07 preperation-hub (pattern records)</option>
              <option value="ds-08">DS-08 Company_Wise_Placement_Resources (coverage only)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Company filter (optional)
            <input
              className={inputCls}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="TCS"
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button className={btnGhost} disabled={busy} onClick={() => void doCompanyImport(true)}>
            Dry run
          </button>
          {dsSource === 'ds-07' && (
            <button
              className={btnCls}
              disabled={busy || !companyReport?.dryRun}
              onClick={() => void doCompanyImport(false)}
            >
              Import records
            </button>
          )}
        </div>
      </section>

      <ErrorBox error={error} />

      {companyReport && (
        <section className="rounded-lg border border-neutral-200 p-4 text-sm">
          <h2 className="mb-2 text-lg font-semibold">Extraction report</h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <dt className="text-neutral-500">Files</dt>
              <dd>{companyReport.filesSeen}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Records</dt>
              <dd>{companyReport.recordsFound ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Mapped</dt>
              <dd>{companyReport.mapped ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Companies</dt>
              <dd>{companyReport.companies?.length ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-1 break-all text-xs text-neutral-500">{companyReport.sourceRef}</p>
          {companyReport.note && <p className="mt-2 text-neutral-600">{companyReport.note}</p>}
          {companyReport.companies && companyReport.companies.length > 0 && (
            <p className="mt-2">Companies: {companyReport.companies.join(', ')}</p>
          )}
          {companyReport.unmappedPhrases && companyReport.unmappedPhrases.length > 0 && (
            <div className="mt-2">
              <h3 className="font-semibold">Unmapped phrases</h3>
              <ul className="list-disc pl-5">
                {companyReport.unmappedPhrases.map((u) => (
                  <li key={u.phrase}>
                    {u.phrase} ×{u.count}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-semibold">Mapping queue</h2>
          <input
            className={`${inputCls} w-40`}
            placeholder="Company filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={unmappedOnly}
              onChange={(e) => setUnmappedOnly(e.target.checked)}
            />
            Unmapped only
          </label>
        </div>
        {patterns?.unmappedPhrases && patterns.unmappedPhrases.length > 0 && (
          <p className="mb-2 text-sm text-neutral-600">
            Unmapped phrases:{' '}
            {patterns.unmappedPhrases.map((u) => `${u.phrase} ×${u.count}`).join(', ')}
          </p>
        )}
        {!patterns || patterns.items.length === 0 ? (
          <p className="text-sm text-neutral-500">No records. Run a DS-07 extraction first.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pr-2">Company</th>
                <th className="pr-2">Section</th>
                <th className="pr-2">Topic phrase</th>
                <th className="pr-2">Counts</th>
                <th className="pr-2">Status</th>
                <th>Map to topic</th>
              </tr>
            </thead>
            <tbody>
              {patterns.items.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="pr-2">{r.company}</td>
                  <td className="pr-2">{r.sectionName ?? '—'}</td>
                  <td className="pr-2">{r.topicText ?? <em>section</em>}</td>
                  <td className="pr-2 text-xs">
                    {r.questionCount != null && `${r.questionCount}q `}
                    {r.minutes != null && `${r.minutes}m`}
                  </td>
                  <td className="pr-2">{r.status}</td>
                  <td>
                    {r.status !== 'rejected' && (
                      <div className="flex items-center gap-1">
                        <select
                          className="rounded border border-neutral-300 px-1 py-1 text-xs"
                          value={mapSlug[r.id] ?? ''}
                          onChange={(e) => setMapSlug((m) => ({ ...m, [r.id]: e.target.value }))}
                        >
                          <option value="">topic…</option>
                          {topicOptions.map((t) => (
                            <option key={t.id} value={t.slug}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className={btnGhost}
                          disabled={!mapSlug[r.id]}
                          onClick={() => void doMap(r, mapSlug[r.id]!)}
                        >
                          Map
                        </button>
                        <button className={btnGhost} onClick={() => void doReject(r)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-lg font-semibold">Draft blueprint from records</h2>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Company (e.g. TCS)"
              value={draftCompany}
              onChange={(e) => setDraftCompany(e.target.value)}
            />
            <button
              className={btnCls}
              disabled={busy || !draftCompany.trim()}
              onClick={() => void doDraft()}
            >
              Draft
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Creates a non-current draft version with candidate_reported provenance. Review and
            publish under Blueprints.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-2 text-lg font-semibold">Fit tags</h2>
          <p className="mb-2 text-sm text-neutral-600">
            Recompute question→section fit for a published blueprint.
          </p>
          <div className="flex flex-col gap-1">
            {blueprints.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{b.company}</span>
                <button className={btnGhost} onClick={() => void doFit(b.id)}>
                  Recompute fit
                </button>
              </div>
            ))}
            {blueprints.length === 0 && (
              <p className="text-sm text-neutral-500">No blueprints yet.</p>
            )}
          </div>
          {fitResult && <p className="mt-2 text-sm text-green-700">{fitResult}</p>}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------ tab 3: coverage

function CoverageTab() {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    getCoverage().then(setReport).catch(setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!report) return <p className="text-sm text-neutral-500">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">{report.target}</p>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-neutral-500">Reviewed items</div>
          <div className="text-xl font-semibold">{report.totals.reviewed}</div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-neutral-500">Published items</div>
          <div className="text-xl font-semibold">{report.totals.published}</div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-neutral-500">Cells below threshold ({report.threshold})</div>
          <div className="text-xl font-semibold">{report.belowThreshold.length}</div>
        </div>
      </div>
      {report.belowThreshold.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="pr-2">Topic</th>
              <th className="pr-2">Band</th>
              <th className="pr-2">Pool</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {report.belowThreshold.slice(0, 100).map((c, i) => (
              <tr key={i} className="border-t border-neutral-100">
                <td className="pr-2">{c.topic}</td>
                <td className="pr-2">{c.difficultyBand}</td>
                <td className="pr-2">{c.pool}</td>
                <td>{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function ImportPanel() {
  const [tab, setTab] = useState<Tab>('questions');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'questions', label: 'Question sources' },
    { id: 'company', label: 'Company data' },
    { id: 'coverage', label: 'Coverage' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Import</h1>
      <div className="flex gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm ${
              tab === t.id ? 'border-b-2 border-neutral-900 font-semibold' : 'text-neutral-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'questions' && <QuestionImportTab />}
      {tab === 'company' && <CompanyTab />}
      {tab === 'coverage' && <CoverageTab />}
    </div>
  );
}
