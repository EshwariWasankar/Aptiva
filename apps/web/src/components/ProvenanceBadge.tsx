import type { ProvenanceSource } from '../lib/content';

const TYPE_LABEL: Record<string, string> = {
  official: 'Official',
  public: 'Public',
  candidate_reported: 'Candidate-reported',
  pattern_inferred: 'Pattern-inferred',
  assumption: 'Assumption',
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-neutral-200 text-neutral-700',
};

/** Provenance badge + last-verified date (P-02 requirement). */
export function ProvenanceBadge({ source }: { source: ProvenanceSource | null }) {
  if (!source) {
    return <span className="text-xs text-neutral-400">No source recorded</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">
        {TYPE_LABEL[source.sourceType] ?? source.sourceType}
      </span>
      <span className={`rounded px-1.5 py-0.5 ${CONFIDENCE_STYLE[source.confidence] ?? ''}`}>
        {source.confidence} confidence
      </span>
      {source.lastVerifiedAt ? (
        <span className="text-neutral-500">
          verified {new Date(source.lastVerifiedAt).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-amber-700">never verified</span>
      )}
      {source.reference ? (
        <span className="max-w-56 truncate text-neutral-400" title={source.reference}>
          {source.reference}
        </span>
      ) : null}
    </span>
  );
}
