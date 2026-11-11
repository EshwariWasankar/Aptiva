/**
 * markAttempt — pure marking function (playbook Section 18, PH2-T03).
 *
 * Input:  question key fields, student input, blueprint rules (ctx).
 * Output: { isCorrect, roundingSuspected, scoreDelta }.
 *
 * - MCQ: correctness comes from the selected option's is_correct flag.
 * - Numerical: the raw input string is normalised (commas/whitespace
 *   stripped, leading minus and trailing zeros handled by parseFloat),
 *   optionally rounded to the question's decimal_places rule, then
 *   compared against numeric_answer within tolerance (inclusive boundary,
 *   per API-ANS-03: |input - answer| <= tolerance → correct).
 * - Unparseable numeric input throws EngineError('INVALID_NUMERIC_INPUT')
 *   so services can map it to 422 without consuming the attempt.
 * - scoreDelta: +1 correct, -(ctx.negativeMarking ?? 0) wrong, 0 skipped.
 *   Negative marking applies only when the session blueprint allows it.
 * - roundingSuspected: the answer was wrong, but rounding the student's
 *   input to some precision the question allows would have made it
 *   correct — surfaced so the UI can offer the 'rounding or units' chip.
 */

export type EngineErrorCode = 'INVALID_NUMERIC_INPUT' | 'UNKNOWN_OPTION' | 'INVALID_INPUT';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface MarkingQuestion {
  format: 'mcq' | 'numerical';
  /** MCQ options — only is_correct matters for marking. */
  options?: ReadonlyArray<{ id: string; isCorrect: boolean }>;
  numericAnswer?: number | null;
  answerFormat?: 'integer' | 'decimal' | null;
  decimalPlaces?: number | null;
  /** Absolute tolerance; null/undefined means exact match. */
  tolerance?: number | null;
}

export interface MarkingInput {
  /** MCQ: selected option id. */
  selectedOptionId?: string | null;
  /** Numerical: raw student input string (commas tolerated). */
  numericInput?: string | null;
  skipped?: boolean;
}

export interface MarkingContext {
  /** Fraction of a mark deducted for a wrong answer; null/0 = no negative marking. */
  negativeMarking?: number | null;
}

export interface MarkingResult {
  isCorrect: boolean;
  roundingSuspected: boolean;
  scoreDelta: number;
}

const NUMERIC_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** Normalise a raw numeric string: strip commas/whitespace, validate shape. */
export function parseNumericInput(raw: string): number {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (!NUMERIC_RE.test(cleaned)) {
    throw new EngineError('INVALID_NUMERIC_INPUT', `Cannot parse numeric input: ${raw}`);
  }
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) {
    throw new EngineError('INVALID_NUMERIC_INPUT', `Cannot parse numeric input: ${raw}`);
  }
  return value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function withinTolerance(value: number, answer: number, tolerance: number): boolean {
  // 1e-9 guards float noise on exact comparisons (e.g. 0.1 + 0.2 style inputs).
  return Math.abs(value - answer) <= tolerance + 1e-9;
}

/**
 * roundingSuspected: input was wrong, but rounding it to some allowed
 * precision would have made it correct. Allowed precisions are the
 * question's decimal_places (when set) and every coarser precision down
 * to 0 — a student who typed 15.015 for a 2-dp question is "rounding
 * suspected" even though 15.02 itself is still outside tolerance.
 */
function detectRoundingSuspected(
  raw: number,
  answer: number,
  tolerance: number,
  decimalPlaces: number | null | undefined,
): boolean {
  const maxDecimals = decimalPlaces ?? 6;
  const inputDecimals = (() => {
    const s = String(raw);
    const i = s.indexOf('.');
    return i === -1 ? 0 : s.length - i - 1;
  })();
  const finest = Math.min(maxDecimals, Math.max(inputDecimals, 0));
  for (let d = finest; d >= 0; d -= 1) {
    if (withinTolerance(roundTo(raw, d), answer, tolerance)) return true;
  }
  return false;
}

export function markAttempt(
  question: MarkingQuestion,
  input: MarkingInput,
  ctx: MarkingContext = {},
): MarkingResult {
  if (input.skipped) {
    return { isCorrect: false, roundingSuspected: false, scoreDelta: 0 };
  }

  const negative = ctx.negativeMarking ?? 0;
  const wrongDelta = negative > 0 ? -Math.abs(negative) : 0;

  if (question.format === 'mcq') {
    const optionId = input.selectedOptionId;
    if (!optionId) {
      throw new EngineError('INVALID_INPUT', 'MCQ attempt requires selectedOptionId');
    }
    const option = question.options?.find((o) => o.id === optionId);
    if (!option) {
      throw new EngineError('UNKNOWN_OPTION', `Option ${optionId} is not on this question`);
    }
    const isCorrect = option.isCorrect;
    return {
      isCorrect,
      roundingSuspected: false,
      scoreDelta: isCorrect ? 1 : wrongDelta,
    };
  }

  // numerical
  if (input.numericInput == null || input.numericInput.trim() === '') {
    throw new EngineError('INVALID_NUMERIC_INPUT', 'Numerical attempt requires numericInput');
  }
  if (question.numericAnswer == null) {
    throw new EngineError('INVALID_INPUT', 'Question has no numeric answer key');
  }
  const answer = Number(question.numericAnswer);
  const tolerance = question.tolerance != null ? Number(question.tolerance) : 0;

  let value = parseNumericInput(input.numericInput);
  // The question's decimal_places rule bounds the precision we honour.
  if (question.decimalPlaces != null) {
    value = roundTo(value, question.decimalPlaces);
  }
  if (question.answerFormat === 'integer' && !Number.isInteger(value)) {
    // An integer-format question accepts only whole numbers; a fractional
    // input is wrong but still consumed (student answered, just badly).
    return {
      isCorrect: false,
      roundingSuspected: false,
      scoreDelta: wrongDelta,
    };
  }

  const isCorrect = withinTolerance(value, answer, tolerance);
  const roundingSuspected =
    !isCorrect &&
    detectRoundingSuspected(
      parseNumericInput(input.numericInput),
      answer,
      tolerance,
      question.decimalPlaces,
    );
  return {
    isCorrect,
    roundingSuspected,
    scoreDelta: isCorrect ? 1 : wrongDelta,
  };
}
