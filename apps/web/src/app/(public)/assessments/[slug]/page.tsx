import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProvenanceBadge } from '../../../../components/ProvenanceBadge';
import type { PublicBlueprint } from '../../../../lib/content';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const bp = await fetchBlueprint(slug);
  if (!bp) return { title: 'Assessment — Aptiva' };
  return {
    title: `${bp.assessment.name} blueprint — Aptiva`,
    description: `Sections, durations, question counts and topic weights for ${bp.assessment.name}, with per-field provenance.`,
  };
}

async function fetchBlueprint(slug: string): Promise<PublicBlueprint | null> {
  try {
    const res = await fetch(`${API}/api/v1/assessments/${encodeURIComponent(slug)}/blueprint`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: PublicBlueprint };
    return body.data ?? null;
  } catch {
    return null;
  }
}

export default async function BlueprintPage({ params }: Params) {
  const { slug } = await params;
  const bp = await fetchBlueprint(slug);
  if (!bp) notFound();

  const { assessment, version } = bp;
  const anyUnverified = version.sections.some(
    (s) =>
      !s.source ||
      s.source.sourceType === 'assumption' ||
      s.source.confidence === 'low' ||
      s.weights.some((w) => !w.source || w.source.sourceType === 'assumption'),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          Aptiva
        </Link>
        <Link href="/register" className="text-sm text-neutral-600 hover:text-neutral-900">
          Create free account
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{assessment.name}</h1>
        <p className="text-neutral-600">
          {assessment.company} · blueprint v{version.version}
          {version.lastVerifiedAt
            ? ` · last verified ${new Date(version.lastVerifiedAt).toLocaleDateString()}`
            : ' · never verified'}
        </p>
        {anyUnverified && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Some fields in this blueprint are unverified or inferred — check the provenance badge on
            each field before relying on it.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Sections</h2>
        {version.sections.map((s) => (
          <div key={s.id} className="rounded-lg border bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                {s.orderNo}. {s.name}
              </h3>
              <ProvenanceBadge source={s.source} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-neutral-500">Duration</dt>
                <dd>{s.durationMin != null ? `${s.durationMin} min` : 'unknown'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Questions</dt>
                <dd>
                  {s.questionCountMin != null && s.questionCountMax != null
                    ? `${s.questionCountMin}–${s.questionCountMax}`
                    : 'unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Negative marking</dt>
                <dd>
                  {s.negativeMarking != null ? `−${s.negativeMarking} per wrong` : 'none / unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Format mix</dt>
                <dd>
                  {s.formatMix
                    ? `${Math.round((s.formatMix.mcq ?? 0) * 100)}% MCQ · ${Math.round((s.formatMix.numerical ?? 0) * 100)}% numerical`
                    : 'unknown'}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium text-neutral-700">Topic weights</h4>
              <ul className="flex flex-col gap-2">
                {s.weights.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                  >
                    <span>
                      {w.topic.name}{' '}
                      <span className="text-neutral-400">
                        ({Math.round(w.share * 100)}%
                        {w.difficultyBand ? ` · band ${w.difficultyBand}` : ''}
                        {w.paceSeconds ? ` · ~${Math.round(w.paceSeconds / 60)} min pace` : ''})
                      </span>
                    </span>
                    <ProvenanceBadge source={w.source} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>

      <footer className="border-t pt-6 text-xs text-neutral-400">
        <p>
          Aptiva is an independent study tool. It is not affiliated with, endorsed by, or connected
          to {assessment.company} or any assessment provider. Blueprint details are compiled from
          the sources shown and may be incomplete or out of date.
        </p>
      </footer>
    </div>
  );
}
