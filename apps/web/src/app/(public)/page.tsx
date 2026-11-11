import Link from 'next/link';
import type { Metadata } from 'next';
import type { PublicAssessment } from '../../lib/content';

export const metadata: Metadata = {
  title: 'Aptiva — placement aptitude preparation that adapts to you',
  description:
    'A diagnostic-driven study planner for campus placement aptitude tests. Know your weak topics, get a time-boxed daily plan, and practise what matters.',
};

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

async function fetchAssessments(): Promise<PublicAssessment[]> {
  try {
    const res = await fetch(`${API}/api/v1/assessments`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const body = (await res.json()) as { data: PublicAssessment[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

const STEPS = [
  {
    title: 'Take the diagnostic',
    body: 'A timed, mixed-format baseline across Quant, Logical Reasoning, Data Interpretation and Verbal — about 30 minutes, pausable once.',
  },
  {
    title: 'Get your plan',
    body: 'A time-boxed daily schedule built from your profile and your target assessment blueprint — with the reasoning behind every block.',
  },
  {
    title: 'Practise and recalibrate',
    body: 'Session feedback updates your profile continuously; the plan adapts as your readiness changes.',
  },
];

export default async function LandingPage() {
  const assessments = await fetchAssessments();
  const featured = assessments.filter((a) => a.slug !== 'generic').slice(0, 3);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-xl font-semibold">Aptiva</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-neutral-600 hover:text-neutral-900">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Placement prep that starts with what you don&apos;t know.
        </h1>
        <p className="max-w-2xl text-lg text-neutral-600">
          Aptiva runs a setup diagnostic, builds a baseline profile across aptitude topics, and
          generates a time-boxed practice plan matched to the assessment you&apos;re targeting.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/register"
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-white hover:bg-neutral-700"
          >
            Create free account
          </Link>
          <a href="#blueprints" className="rounded-md border px-5 py-2.5 hover:bg-neutral-100">
            See supported assessments
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-lg border bg-white p-5">
            <div className="mb-2 text-sm font-medium text-neutral-400">Step {i + 1}</div>
            <h2 className="mb-1 font-semibold">{s.title}</h2>
            <p className="text-sm text-neutral-600">{s.body}</p>
          </div>
        ))}
      </section>

      <section id="blueprints" className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold">Assessment blueprints</h2>
        <p className="text-neutral-600">
          Every blueprint lists its sections, timings and topic weights — each with its source and
          confidence level.
        </p>
        {featured.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Blueprints are being prepared — check back soon.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {featured.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/assessments/${a.slug}`}
                  className="block rounded-lg border bg-white p-4 hover:border-neutral-400"
                >
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-neutral-500">
                    {a.company} · v{a.currentVersion?.version ?? '?'}
                    {a.currentVersion?.lastVerifiedAt
                      ? ` · verified ${new Date(a.currentVersion.lastVerifiedAt).toLocaleDateString()}`
                      : ' · unverified'}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t pt-6 text-xs text-neutral-400">
        Aptiva is an independent study tool. It is not affiliated with, endorsed by, or connected to
        any assessment provider.
      </footer>
    </div>
  );
}
