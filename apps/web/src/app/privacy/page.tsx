import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy notice — Aptiva' };

/**
 * Draft privacy notice placeholder. Final text is a PH-10 deliverable
 * (PH10-T08: reviewed by counsel). Consent records store NOTICE_VERSION
 * from the API env; keep this page's version label in sync.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p className="mt-4 text-sm text-neutral-600">
        Draft placeholder (notice version 2026-11). Aptiva stores your account details, assessment
        answers, plans and error reports to provide the service. You can export or delete your data
        at any time. The final notice is published after legal review.
      </p>
      <a href="/" className="mt-6 inline-block text-sm text-neutral-600 underline">
        Back to Aptiva
      </a>
    </main>
  );
}
