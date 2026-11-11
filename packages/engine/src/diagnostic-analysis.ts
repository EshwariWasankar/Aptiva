/**
 * analyzeDiagnostic — pure result analysis (playbook PH5-T04, FR-005).
 * Computes the five measures for E-015 plus the thin-evidence list:
 * topic accuracy, difficulty accuracy, time vs expected, skip patterns,
 * consistency. Express diagnostics are flagged `coarse`.
 */

export interface DiagnosticAttemptInput {
  questionId: string;
  topicId: string;
  topicName?: string;
  sectionName?: string | null;
  difficultyPrior: number; // 1 easy | 2 medium | 3 hard
  isCorrect: boolean | null;
  skipped: boolean;
  timeMs: number | null;
  expectedTimeMs: number;
  sequenceNo: number;
}

export interface TopicAccuracy {
  topicId: string;
  topicName: string | null;
  sectionName: string | null;
  attempts: number;
  answered: number;
  correct: number;
  accuracy: number | null; // null when nothing answered
  avgTimeRatio: number | null;
  /** true when fewer than MIN_EVIDENCE attempts — "needs more evidence". */
  thinEvidence: boolean;
}

export interface BandAccuracy {
  band: 1 | 2 | 3;
  label: 'easy' | 'medium' | 'hard';
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface DiagnosticSummary {
  mode: 'standard' | 'express';
  /** Express results are always flagged coarse (FR-003). */
  coarse: boolean;
  engineVersion: string;
  totals: {
    questions: number;
    attempts: number;
    answered: number;
    correct: number;
    skipped: number;
    accuracy: number | null;
  };
  byTopic: TopicAccuracy[];
  byDifficulty: BandAccuracy[];
  timeVsExpected: {
    avgRatio: number | null;
    overExpectedShare: number | null; // share of answered with ratio > 1.2
    underExpectedShare: number | null; // share with ratio < 0.8
  };
  skipPattern: {
    skippedCount: number;
    skippedShare: number | null;
    /** sequence positions (1-based) that were skipped, capped at 20 */
    skippedPositions: number[];
  };
  consistency: {
    firstHalfAccuracy: number | null;
    secondHalfAccuracy: number | null;
    /** |second − first|; > 0.25 reads as drifting/unstable */
    drift: number | null;
    unstable: boolean;
  };
  thinEvidence: string[]; // topicIds needing more evidence
}

const MIN_EVIDENCE = 2; // diagnostic items per topic for a stable read
const DRIFT_THRESHOLD = 0.25;

function ratio(a: DiagnosticAttemptInput): number | null {
  if (a.timeMs == null || a.expectedTimeMs <= 0) return null;
  return a.timeMs / a.expectedTimeMs;
}

function accuracyOf(items: DiagnosticAttemptInput[]): number | null {
  const answered = items.filter((i) => !i.skipped && i.isCorrect != null);
  if (answered.length === 0) return null;
  return answered.filter((i) => i.isCorrect).length / answered.length;
}

export function analyzeDiagnostic(
  attempts: DiagnosticAttemptInput[],
  mode: 'standard' | 'express',
  engineVersion: string,
  totalQuestions: number,
): DiagnosticSummary {
  const ordered = [...attempts].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const answered = ordered.filter((i) => !i.skipped && i.isCorrect != null);
  const skipped = ordered.filter((i) => i.skipped);
  const correct = answered.filter((i) => i.isCorrect).length;

  // ---- by topic ----
  const topicMap = new Map<string, DiagnosticAttemptInput[]>();
  const topicMeta = new Map<string, { name: string | null; section: string | null }>();
  for (const a of ordered) {
    const list = topicMap.get(a.topicId) ?? [];
    list.push(a);
    topicMap.set(a.topicId, list);
    topicMeta.set(a.topicId, {
      name: a.topicName ?? null,
      section: a.sectionName ?? null,
    });
  }
  const byTopic: TopicAccuracy[] = [...topicMap.entries()].map(([topicId, items]) => {
    const ans = items.filter((i) => !i.skipped && i.isCorrect != null);
    const ratios = ans.map(ratio).filter((r): r is number => r != null);
    return {
      topicId,
      topicName: topicMeta.get(topicId)?.name ?? null,
      sectionName: topicMeta.get(topicId)?.section ?? null,
      attempts: items.length,
      answered: ans.length,
      correct: ans.filter((i) => i.isCorrect).length,
      accuracy: accuracyOf(items),
      avgTimeRatio: ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : null,
      thinEvidence: ans.length < MIN_EVIDENCE,
    };
  });
  byTopic.sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1));

  // ---- by difficulty band ----
  const bands: BandAccuracy[] = ([1, 2, 3] as const).map((band) => {
    const items = ordered.filter((i) => i.difficultyPrior === band);
    const ans = items.filter((i) => !i.skipped && i.isCorrect != null);
    return {
      band,
      label: band === 1 ? 'easy' : band === 2 ? 'medium' : 'hard',
      attempts: items.length,
      correct: ans.filter((i) => i.isCorrect).length,
      accuracy: accuracyOf(items),
    };
  });

  // ---- time vs expected ----
  const ratios = answered.map(ratio).filter((r): r is number => r != null);
  const timeVsExpected = {
    avgRatio: ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : null,
    overExpectedShare: ratios.length ? ratios.filter((r) => r > 1.2).length / ratios.length : null,
    underExpectedShare: ratios.length ? ratios.filter((r) => r < 0.8).length / ratios.length : null,
  };

  // ---- skip pattern ----
  const skipPattern = {
    skippedCount: skipped.length,
    skippedShare: ordered.length ? skipped.length / ordered.length : null,
    skippedPositions: skipped.map((s) => s.sequenceNo).slice(0, 20),
  };

  // ---- consistency: first vs second half accuracy drift ----
  const mid = Math.floor(ordered.length / 2);
  const firstHalf = ordered.slice(0, mid);
  const secondHalf = ordered.slice(mid);
  const firstAcc = accuracyOf(firstHalf);
  const secondAcc = accuracyOf(secondHalf);
  const drift = firstAcc != null && secondAcc != null ? Math.abs(secondAcc - firstAcc) : null;
  const consistency = {
    firstHalfAccuracy: firstAcc,
    secondHalfAccuracy: secondAcc,
    drift,
    unstable: drift != null && drift > DRIFT_THRESHOLD,
  };

  return {
    mode,
    coarse: mode === 'express',
    engineVersion,
    totals: {
      questions: totalQuestions,
      attempts: ordered.length,
      answered: answered.length,
      correct,
      skipped: skipped.length,
      accuracy: accuracyOf(ordered),
    },
    byTopic,
    byDifficulty: bands,
    timeVsExpected,
    skipPattern,
    consistency,
    thinEvidence: byTopic.filter((t) => t.thinEvidence).map((t) => t.topicId),
  };
}
