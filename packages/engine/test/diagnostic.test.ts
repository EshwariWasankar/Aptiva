import { describe, expect, it } from 'vitest';
import { inferError } from '../src/infer-error';
import { analyzeDiagnostic, type DiagnosticAttemptInput } from '../src/diagnostic-analysis';
import { ENGINE_VERSION } from '../src/index';

describe('inferError', () => {
  const base = { isCorrect: false, skipped: false, timeMs: 60_000, expectedTimeMs: 60_000 };

  it('correct attempt → no inference', () => {
    expect(inferError({ ...base, isCorrect: true })).toEqual({
      errorType: null,
      method: 'rule',
      confidence: 0,
      conflict: false,
    });
  });

  it('rule table: rounding suspected → units_rounding', () => {
    const r = inferError({ ...base, roundingSuspected: true });
    expect(r.errorType).toBe('units_rounding');
    expect(r.method).toBe('rule');
    expect(r.conflict).toBe(false);
  });

  it('rule table: very fast wrong → guess; slow wrong → calculation; normal → careless', () => {
    expect(inferError({ ...base, timeMs: 10_000 }).errorType).toBe('guess');
    expect(inferError({ ...base, timeMs: 200_000 }).errorType).toBe('calculation');
    expect(inferError(base).errorType).toBe('careless');
    expect(inferError({ ...base, skipped: true }).errorType).toBe('time');
  });

  it('T-010: report is the stored label; disagreement sets conflict', () => {
    // Wrong + very short time → rule says guess; student reports concept.
    const r = inferError({ ...base, timeMs: 5_000 }, 'concept');
    expect(r.errorType).toBe('concept');
    expect(r.method).toBe('reported');
    expect(r.conflict).toBe(true);
  });

  it('report agreeing with rule → no conflict', () => {
    const r = inferError({ ...base, timeMs: 5_000 }, 'guess');
    expect(r.errorType).toBe('guess');
    expect(r.method).toBe('reported');
    expect(r.conflict).toBe(false);
  });
});

function att(
  partial: Partial<DiagnosticAttemptInput> & { sequenceNo: number },
): DiagnosticAttemptInput {
  return {
    questionId: `q-${partial.sequenceNo}`,
    topicId: 't1',
    topicName: 'Topic One',
    sectionName: 'Quant',
    difficultyPrior: 2,
    isCorrect: true,
    skipped: false,
    timeMs: 60_000,
    expectedTimeMs: 60_000,
    ...partial,
  };
}

describe('analyzeDiagnostic', () => {
  it('computes the five measures + thin evidence', () => {
    const attempts: DiagnosticAttemptInput[] = [
      att({ sequenceNo: 1, isCorrect: true, timeMs: 30_000 }),
      att({
        sequenceNo: 2,
        isCorrect: false,
        timeMs: 120_000,
        topicId: 't2',
        topicName: 'Topic Two',
      }),
      att({
        sequenceNo: 3,
        isCorrect: null,
        skipped: true,
        timeMs: null,
        topicId: 't3',
        topicName: 'Topic Three',
      }),
      att({
        sequenceNo: 4,
        isCorrect: true,
        difficultyPrior: 1,
        timeMs: 20_000,
        expectedTimeMs: 60_000,
      }),
    ];
    const s = analyzeDiagnostic(attempts, 'standard', ENGINE_VERSION, 4);

    expect(s.coarse).toBe(false);
    expect(s.mode).toBe('standard');
    expect(s.totals).toMatchObject({
      questions: 4,
      attempts: 4,
      answered: 3,
      correct: 2,
      skipped: 1,
    });
    expect(s.totals.accuracy).toBeCloseTo(2 / 3);

    // byTopic sorted weakest first
    expect(s.byTopic[0]!.topicId).toBe('t2');
    expect(s.byTopic.find((t) => t.topicId === 't1')!.accuracy).toBe(1);

    // difficulty bands
    const easy = s.byDifficulty.find((b) => b.band === 1)!;
    expect(easy.accuracy).toBe(1);

    // time vs expected
    expect(s.timeVsExpected.avgRatio).not.toBeNull();
    expect(s.timeVsExpected.overExpectedShare).toBeGreaterThan(0);

    // skips
    expect(s.skipPattern.skippedCount).toBe(1);
    expect(s.skipPattern.skippedPositions).toEqual([3]);

    // consistency drift computed
    expect(s.consistency.drift).not.toBeNull();

    // thin evidence: t3 skipped-only and t2 single attempt → thin
    expect(s.thinEvidence).toContain('t2');
    expect(s.thinEvidence).toContain('t3');
  });

  it('express mode is flagged coarse', () => {
    const s = analyzeDiagnostic([att({ sequenceNo: 1 })], 'express', ENGINE_VERSION, 1);
    expect(s.coarse).toBe(true);
  });

  it('empty attempts → null accuracies, no crash', () => {
    const s = analyzeDiagnostic([], 'standard', ENGINE_VERSION, 0);
    expect(s.totals.accuracy).toBeNull();
    expect(s.consistency.drift).toBeNull();
    expect(s.timeVsExpected.avgRatio).toBeNull();
  });
});
