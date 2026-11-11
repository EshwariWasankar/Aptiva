/**
 * Fit job math (Section 14.1 step 5, PH3-T11, DATA-007).
 * fit = topic share × format match × difficulty proximity, each in [0,1].
 * Pure and deterministic — recomputation must give identical tags.
 */

export interface FitInputs {
  /** The question's topic share within the section (0 when absent). */
  topicShare: number;
  /** The section's format_mix share for the question's format (0..1). */
  formatShare: number;
  /** Section difficulty band vs question band proximity in [0,1]. */
  difficultyProximity: number;
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export function computeFit(i: FitInputs): number {
  return clamp01(clamp01(i.topicShare) * clamp01(i.formatShare) * clamp01(i.difficultyProximity));
}

/** Section format_mix share for a format; unknown mix → neutral 0.5. */
export function formatShare(
  formatMix: { mcq?: number; numerical?: number } | null | undefined,
  format: 'mcq' | 'numerical',
): number {
  if (!formatMix) return 0.5;
  const v = formatMix[format];
  return v == null ? 0 : clamp01(v);
}

/** 1 when bands equal, 0 at gap ≥ 2 (bands are 1..3). */
export function difficultyProximity(questionBand: number, sectionBand: number | null): number {
  if (sectionBand == null) return 0.75; // unknown band → mildly favourable
  const gap = Math.abs(questionBand - sectionBand);
  return clamp01(1 - gap / 2);
}
