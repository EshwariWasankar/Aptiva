/**
 * inferError — rule-based error-cause inference (playbook Section 16,
 * PH5-T05, T-010, T-ML-04).
 *
 * The student's report is ALWAYS the stored label: when a report exists
 * the result is method='reported' with high confidence, and `conflict`
 * is set when the rule table disagrees. Rules only fire on wrong,
 * skipped or suspicious attempts.
 */

export type ErrorTypeCode =
  | 'concept'
  | 'formula'
  | 'calculation'
  | 'misread'
  | 'time'
  | 'careless'
  | 'underprepared'
  | 'application'
  | 'guess'
  | 'units_rounding'
  | 'other';

export interface InferErrorInput {
  isCorrect: boolean;
  skipped: boolean;
  /** Server-derived ms spent; null when unknown. */
  timeMs: number | null;
  expectedTimeMs: number;
  roundingSuspected?: boolean;
}

export interface InferErrorResult {
  /** null when the attempt was correct — nothing to infer. */
  errorType: ErrorTypeCode | null;
  method: 'reported' | 'rule';
  confidence: number;
  conflict: boolean;
}

interface RuleHit {
  type: ErrorTypeCode;
  confidence: number;
}

/** Rule table — first match wins, ordered most-specific to least. */
function ruleInfer(input: InferErrorInput): RuleHit | null {
  if (input.isCorrect) return null;
  if (input.skipped) return { type: 'time', confidence: 0.4 };
  if (input.roundingSuspected) return { type: 'units_rounding', confidence: 0.8 };

  const ratio =
    input.timeMs != null && input.expectedTimeMs > 0 ? input.timeMs / input.expectedTimeMs : null;
  if (ratio != null && ratio < 0.4) return { type: 'guess', confidence: 0.6 };
  if (ratio != null && ratio > 1.8) return { type: 'calculation', confidence: 0.5 };
  return { type: 'careless', confidence: 0.35 };
}

/**
 * @param reportCode student's reported error-type code (stored label wins)
 */
export function inferError(
  input: InferErrorInput,
  reportCode?: ErrorTypeCode | null,
): InferErrorResult {
  const rule = ruleInfer(input);

  if (reportCode) {
    return {
      errorType: reportCode,
      method: 'reported',
      confidence: 0.95,
      // Conflict only when a rule produced a different type.
      conflict: rule != null && rule.type !== reportCode,
    };
  }
  if (!rule) {
    return { errorType: null, method: 'rule', confidence: 0, conflict: false };
  }
  return { errorType: rule.type, method: 'rule', confidence: rule.confidence, conflict: false };
}
