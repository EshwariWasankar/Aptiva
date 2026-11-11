'use client';

/**
 * ConflictNote — shown when the student's reported error cause disagrees
 * with the rule-based inference (T-010, FR-006). Dismissible; the stored
 * label is always the student's report.
 */
export function ConflictNote({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>
        Your report differs from the observed pattern (very fast/slow answer). Both are kept — your
        label is what we store.
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss note"
          className="text-amber-700 underline"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
