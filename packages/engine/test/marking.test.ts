import { describe, expect, it } from 'vitest';
import { EngineError, markAttempt, parseNumericInput } from '../src';

/**
 * T-ML-03 — marking edge cases (playbook Section 20):
 * commas, leading minus, trailing zeros, tolerance boundary,
 * rounding-suspected, unparseable input.
 * Also covers API-ANS-03: correct 15, tolerance 0.01 →
 * 15 correct, 15.005 correct, 15.02 wrong.
 */

const numQ = {
  format: 'numerical' as const,
  numericAnswer: 15,
  tolerance: 0.01,
  decimalPlaces: 2,
};

describe('markAttempt — numerical', () => {
  it('API-ANS-03: 15, 15.005 correct; 15.02 wrong', () => {
    expect(markAttempt(numQ, { numericInput: '15' }).isCorrect).toBe(true);
    expect(markAttempt(numQ, { numericInput: '15.005' }).isCorrect).toBe(true);
    const wrong = markAttempt(numQ, { numericInput: '15.02' });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.scoreDelta).toBe(0);
  });

  it('tolerance boundary is inclusive', () => {
    // |15.01 - 15| = 0.01 <= 0.01 → correct
    expect(markAttempt(numQ, { numericInput: '15.01' }).isCorrect).toBe(true);
    expect(markAttempt(numQ, { numericInput: '-15.01' }).isCorrect).toBe(false);
  });

  it('strips commas and whitespace', () => {
    const q = { ...numQ, numericAnswer: 1234.5, tolerance: 0 };
    expect(markAttempt(q, { numericInput: '1,234.5' }).isCorrect).toBe(true);
    expect(markAttempt(q, { numericInput: ' 1 234.5 ' }).isCorrect).toBe(true);
  });

  it('handles leading minus', () => {
    const q = { ...numQ, numericAnswer: -42, tolerance: 0 };
    expect(markAttempt(q, { numericInput: '-42' }).isCorrect).toBe(true);
    expect(markAttempt(q, { numericInput: '42' }).isCorrect).toBe(false);
  });

  it('trailing zeros do not affect correctness', () => {
    expect(markAttempt(numQ, { numericInput: '15.000' }).isCorrect).toBe(true);
    expect(markAttempt(numQ, { numericInput: '15.0' }).isCorrect).toBe(true);
  });

  it('exact match when tolerance is absent', () => {
    const q = { format: 'numerical' as const, numericAnswer: 7, tolerance: null };
    expect(markAttempt(q, { numericInput: '7' }).isCorrect).toBe(true);
    expect(markAttempt(q, { numericInput: '7.0001' }).isCorrect).toBe(false);
  });

  it('flags roundingSuspected when a coarser rounding would be correct', () => {
    // 15.015 rounds to 15.0 at 1 dp → within tolerance of 15 → suspected.
    const r = markAttempt(numQ, { numericInput: '15.015' });
    expect(r.isCorrect).toBe(false);
    expect(r.roundingSuspected).toBe(true);
    // A plainly wrong answer is not rounding-suspected.
    expect(markAttempt(numQ, { numericInput: '18.5' }).roundingSuspected).toBe(false);
  });

  it('unparseable input throws INVALID_NUMERIC_INPUT', () => {
    expect(() => markAttempt(numQ, { numericInput: 'fifteen' })).toThrowError(EngineError);
    expect(() => markAttempt(numQ, { numericInput: '1.2.3' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_NUMERIC_INPUT' }),
    );
    expect(() => markAttempt(numQ, { numericInput: '' })).toThrow();
  });

  it('integer answerFormat rejects fractional input as wrong (consumed)', () => {
    const q = {
      format: 'numerical' as const,
      numericAnswer: 8,
      answerFormat: 'integer' as const,
      tolerance: 0,
    };
    expect(markAttempt(q, { numericInput: '8' }).isCorrect).toBe(true);
    expect(markAttempt(q, { numericInput: '8.5' }).isCorrect).toBe(false);
  });

  it('negative marking only applies when the blueprint allows it', () => {
    const wrong = markAttempt(numQ, { numericInput: '99' }, { negativeMarking: 0.25 });
    expect(wrong.scoreDelta).toBe(-0.25);
    const noNeg = markAttempt(numQ, { numericInput: '99' }, { negativeMarking: null });
    expect(noNeg.scoreDelta).toBe(0);
  });

  it('skipped attempts score zero and are not incorrect-marked', () => {
    const r = markAttempt(numQ, { skipped: true }, { negativeMarking: 0.25 });
    expect(r).toEqual({ isCorrect: false, roundingSuspected: false, scoreDelta: 0 });
  });
});

describe('markAttempt — mcq', () => {
  const q = {
    format: 'mcq' as const,
    options: [
      { id: 'a', isCorrect: false },
      { id: 'b', isCorrect: true },
    ],
  };

  it('correct option scores +1', () => {
    const r = markAttempt(q, { selectedOptionId: 'b' });
    expect(r.isCorrect).toBe(true);
    expect(r.scoreDelta).toBe(1);
  });

  it('wrong option applies negative marking when enabled', () => {
    const r = markAttempt(q, { selectedOptionId: 'a' }, { negativeMarking: 0.25 });
    expect(r.isCorrect).toBe(false);
    expect(r.scoreDelta).toBe(-0.25);
  });

  it('unknown option id throws UNKNOWN_OPTION', () => {
    expect(() => markAttempt(q, { selectedOptionId: 'zzz' })).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_OPTION' }),
    );
  });
});

describe('parseNumericInput', () => {
  it('normalises commas, spaces and signs', () => {
    expect(parseNumericInput('1,00,000')).toBe(100000);
    expect(parseNumericInput(' -12.50 ')).toBe(-12.5);
    expect(parseNumericInput('.5')).toBe(0.5);
  });
});
