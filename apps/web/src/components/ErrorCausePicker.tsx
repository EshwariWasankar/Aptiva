'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '../lib/apiClient';
import { getErrorTypes, submitErrorFeedback, type ErrorType } from '../lib/diagnostic';

/**
 * ErrorCausePicker — one-tap error tag after a miss (FR-014, P-09).
 * Selecting a reason stores it via E-016; the stored label is always the
 * student's report. `onSaved` receives the inference result so the parent
 * can render ConflictNote when conflict=true.
 */
export function ErrorCausePicker({
  attemptId,
  onSaved,
}: {
  attemptId: string;
  onSaved?: (result: { conflict: boolean; errorTypeLabel: string }) => void;
}) {
  const [types, setTypes] = useState<ErrorType[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getErrorTypes()
      .then(setTypes)
      .catch(() => setTypes([]));
  }, []);

  async function save() {
    if (!selected) return;
    setError(null);
    try {
      const r = await submitErrorFeedback(attemptId, selected, note || undefined);
      setSaved(r.errorTypeLabel);
      onSaved?.({ conflict: r.conflict, errorTypeLabel: r.errorTypeLabel });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    }
  }

  if (saved) {
    return <p className="text-xs text-green-700">Tagged: {saved}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => (
          <button
            key={t.code}
            type="button"
            onClick={() => setSelected(t.code)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              selected === t.code
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {selected && (
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            aria-label="Optional note"
            className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => void save()}
            className="rounded bg-neutral-900 px-3 py-1 text-xs text-white"
          >
            Save
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
